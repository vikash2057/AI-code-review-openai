import express from "express";
import axios from "axios";
import cors from "cors";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import OpenAI from "openai";

dotenv.config();

function extractCorrectedCode(aiText) {
  const blocks = [...aiText.matchAll(/```(?:\w+)?\n([\s\S]*?)```/g)];
  if (!blocks || blocks.length === 0) return null;

  // Combine all code blocks (e.g., main fix + XSS fix)
  const allCode = blocks
    .map((b) => {
      const lines = b[1].split("\n");
      return lines[0].trim().toLowerCase() === "javascript"
        ? lines.slice(1).join("\n")
        : lines.join("\n");
    })
    .join("\n\n");

  return allCode.trim();
}


const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

app.get("/", (req, res) => {
  res.send("AI Code Review Webhook Server is running");
});

app.post("/github-webhook", async (req, res) => {
  console.log("Pull testing for review");
  const event = req.headers["x-github-event"];
  const action = req.body.action;

  console.log(`📥 GitHub Webhook Event: ${event}, Action: ${action}`);

  if (event === "pull_request" && action === "opened") {
    const pr = req.body.pull_request;
    const repo = req.body.repository;
    const prNumber = pr.number;

    console.log(`🔔 Pull request #${prNumber} opened in ${repo.full_name}`);

    try {
      const filesRes = await axios.get(`${pr.url}/files`, {
        headers: {
          Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
          Accept: "application/vnd.github+json",
        },
      });

      const files = filesRes.data;
      console.log(`📄 Found ${files.length} file(s) in PR`);

      const filteredFiles = files.filter(
        (f) => f.filename.endsWith("test.js") && f.patch
      );
      if (filteredFiles.length === 0) {
        console.log("⚠️ No reviewable files matched criteria.");
        return res.sendStatus(200);
      }

      const reviewResults = await Promise.all(
        filteredFiles.map(async (file) => {
          console.log(`🤖 Reviewing file: ${file.filename}`);

          const prompt = `
You're reviewing this code diff:

${file.patch}

1. Provide a brief, casual code review (syntax, quality, error handling, naming, etc.).
2. Suggest corrected code snippets if needed.
3. Then, perform a basic security audit: SQL injection, XSS, hardcoded secrets, command injection, etc.
4. Suggest secure alternatives for any vulnerabilities.

If no issues are found, just write "✅ No major security risks detected."
`;

          try {
            const response = await openai.chat.completions.create({
              model: "gpt-4o",
              messages: [
                {
                  role: "system",
                  content:
                    "You're a friendly senior developer. Keep code review feedback short, casual, and to the point. No intros, no formality. Use emojis lightly if helpful.",
                },
                {
                  role: "user",
                  content: prompt,
                },
              ],
            });

            const aiContent = response.choices[0].message.content;
            const correctedCode = extractCorrectedCode(aiContent);

            if (correctedCode && file.filename.endsWith("test.js")) {
              const testFilePath = path.join(process.cwd(), "test.js");
              try {
                fs.writeFileSync(testFilePath + ".bak", fs.readFileSync(testFilePath, "utf8")); // Backup
                fs.writeFileSync(testFilePath, correctedCode, "utf8");
                console.log(`✅ test.js updated with corrected code at ${testFilePath}`);
              } catch (err) {
                console.error("❌ Failed to update test.js:", err.message);
              }
            } else {
              console.log("⚠️ No corrected code found or filename mismatch.");
            }

            return {
              filename: file.filename,
              feedback: aiContent,
            };
          } catch (err) {
            console.error(
              `❌ OpenAI error on ${file.filename}:`,
              err.response?.data || err.message
            );
            return {
              filename: file.filename,
              feedback: "⚠️ Could not analyze this file due to an AI error.",
            };
          }
        })
      );

      const commentBody = reviewResults
        .map((r) => `**${r.filename}**\n${r.feedback}`)
        .join("\n\n");

      const commentRes = await axios.post(
        `${pr.url}/reviews`,
        {
          body: commentBody,
          event: "COMMENT",
        },
        {
          headers: {
            Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
            Accept: "application/vnd.github+json",
          },
        }
      );

      console.log(
        `✅ AI feedback posted to PR #${prNumber} 🎉`,
        commentRes.statusText
      );
    } catch (err) {
      console.error(
        "❌ GitHub/Webhook error:",
        err.response?.data || err.message
      );
    }
  }

  res.sendStatus(200);
});

app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
