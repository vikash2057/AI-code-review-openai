import express from "express";
import axios from "axios";
import cors from "cors";
import dotenv from "dotenv";
import OpenAI from "openai";

dotenv.config();

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
        (f) => f.filename.endsWith("test.js") && f.contents_url
      );

      if (filteredFiles.length === 0) {
        console.log("⚠️ No reviewable files matched criteria.");
        return res.sendStatus(200);
      }

      const reviewResults = await Promise.all(
        filteredFiles.map(async (file) => {
          console.log(`🤖 Reviewing file: ${file.filename}`);

          // 🔄 Step 1: Fetch full file content from GitHub
          const contentRes = await axios.get(file.contents_url, {
            headers: {
              Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
              Accept: "application/vnd.github+json",
            },
          });

          const fullContent = Buffer.from(
            contentRes.data.content,
            "base64"
          ).toString("utf-8");

          // 🔍 Step 2: Construct AI prompt
          const prompt = `
You're reviewing this full source code file:

${fullContent}

1. Provide a brief, casual code review (syntax, quality, error handling, naming, etc.).
2. Suggest corrected code snippets if needed.
3. Then, perform a basic security audit: SQL injection, XSS, hardcoded secrets, command injection, etc.
4. Suggest secure alternatives for any vulnerabilities.

If everything is fine, say "✅ Looks good!".
`;

          // 🤖 Step 3: Call OpenAI
          try {
            const response = await openai.chat.completions.create({
              model: "gpt-4o",
              messages: [
                {
                  role: "system",
                  content:
                    "You're a friendly senior developer. Review code helpfully and clearly. Keep comments short and useful.",
                },
                {
                  role: "user",
                  content: prompt,
                },
              ],
            });

            return {
              filename: file.filename,
              feedback: response.choices[0].message.content,
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

      // 📝 Post Review Back to GitHub PR
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
