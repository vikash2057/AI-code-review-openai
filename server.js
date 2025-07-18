import express from "express";
import axios from "axios";
import cors from "cors";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import OpenAI from "openai";

dotenv.config();

function extractCorrectedCode(aiText) {
  const blocks = [...aiText.matchAll(/```(?:[a-zA-Z]+)?\n([\s\S]*?)```/g)];
  if (!blocks.length) return null;
  // choose the longest — the full corrected file
  const longest = blocks.reduce((a, b) => (a[1].length > b[1].length ? a : b));
  let code = longest[1];
  // strip a leading "javascript" line if present
  const lines = code.split("\n");
  if (lines[0].trim().toLowerCase() === "javascript") lines.shift();
  return lines.join("\n").trim();
}

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

app.get("/", (req, res) => res.send("AI Code Review Webhook Server is running"));

app.post("/github-webhook", async (req, res) => {
  const event = req.headers["x-github-event"];
  const action = req.body.action;
  if (event !== "pull_request" || action !== "opened") {
    return res.sendStatus(200);
  }

  const pr = req.body.pull_request,
        prNumber = pr.number,
        reviewUrl = pr.url + "/files";

  console.log(`🔔 PR #${prNumber} opened — fetching files…`);

  try {
    const filesRes = await axios.get(reviewUrl, {
      headers: {
        Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
        Accept: "application/vnd.github+json",
      },
    });

    const reviewResults = await Promise.all(
      filesRes.data
        .filter(f => f.filename.endsWith("test.js") && f.status !== "removed")
        .map(async file => {
          console.log(`🤖 Reviewing ${file.filename}`);

          // 1) fetch full content
          const raw = await axios.get(file.contents_url, {
            headers: {
              Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
              Accept: "application/vnd.github+json",
            },
          });
          const original = Buffer.from(raw.data.content, "base64").toString("utf8");

          // 2) build the prompt
          const prompt = `
You are a senior software engineer. Review this JavaScript file:

\`\`\`js
${original}
\`\`\`

1. Give a short summary.
2. List any bugs, concerns, error handling or security issues.
3. Suggest improvements.
4. **Remove any unused variables.**
5. Then, if fixes are needed, provide the **entire corrected file** in one or more \`\`\`js code blocks\`\`\`;
   if the code already follows best practices (error handling, security, etc.), respond with exactly:

\`\`\`
✅ No changes needed
\`\`\`

(with no code blocks).
`;

          // 3) call AI
          const aiResp = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
              { role: "system", content: "You're a helpful, precise senior developer." },
              { role: "user", content: prompt },
            ]
          });

          const aiContent = aiResp.choices[0].message.content.trim();
          let feedback = aiContent;
          let correctedCode = null;

          if (aiContent === "✅ No changes needed") {
            console.log("ℹ️  No changes needed for test.js");
          } else {
            correctedCode = extractCorrectedCode(aiContent);
            if (correctedCode && correctedCode !== original) {
              // backup & overwrite
              const fp = path.join(process.cwd(), "test.js");
              fs.writeFileSync(fp + ".bak", original, "utf8");
              fs.writeFileSync(fp, correctedCode, "utf8");
              console.log("✅ test.js updated with corrected code");
            } else {
              console.log("⚠️  Extracted code equal to original or missing; skipping write");
            }
          }

          return { filename: file.filename, feedback };
        })
    );

    // post review comment
    const body = reviewResults.map(r => `**${r.filename}**\n${r.feedback}`).join("\n\n");
    await axios.post(pr.url + "/reviews", {
      body, event: "COMMENT"
    }, {
      headers: {
        Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
        Accept: "application/vnd.github+json",
      }
    });

    console.log(`✅ AI feedback posted to PR #${prNumber}`);
  } catch (err) {
    console.error("❌ Error in webhook handler:", err.message);
  }

  res.sendStatus(200);
});

app.listen(PORT, () => console.log(`🚀 Listening on http://localhost:${PORT}`));
