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
  const longest = blocks.reduce((a, b) => (a[1].length > b[1].length ? a : b));
  let code = longest[1];
  const lines = code.split("\n");
  if (lines[0].trim().toLowerCase() === "javascript") lines.shift();
  return lines.join("\n").trim();
}

function getGenericReviewPrompt(filename, code) {
  return `You are a senior software engineer performing a code quality and security audit on the file "${filename}".

Please check the following generic criteria:

1. **Naming & Structure**  - Clear, meaningful names; no unused variables/functions.
2. **Error Handling**  - All I/O operations have proper error handling.
3. **Security Best Practices**  - Input validation/sanitization; no hard-coded secrets.

If the code meets all of the above criteria, respond with exactly:
\`\`\`
✅ No changes needed
\`\`\`
(with no additional explanation).
Otherwise, list any issues and then provide a full, corrected version of the file in one or more \`\`\`js code blocks\`\`\`.

\`\`\`${filename.endsWith('.js') ? 'js' : ''}
${code}
\`\`\``;
}

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

app.get("/", (req, res) => res.send("AI Code Review Webhook Server is running"));

app.post("/github-webhook", async (req, res) => {
  debugger;
  console.log("Received webhook");
  const event = req.headers["x-github-event"];
  const action = req.body.action;
 if (
  event !== "pull_request" ||
  !["opened", "synchronize", "reopened"].includes(action)
) {
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

          const raw = await axios.get(file.contents_url, {
            headers: {
              Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
              Accept: "application/vnd.github+json",
            },
          });
          const original = Buffer.from(raw.data.content, "base64").toString("utf8");

          const prompt = getGenericReviewPrompt(file.filename, original);

          const aiResp = await openai.chat.completions.create({
            model: "gpt-4o",
            temperature: 0,
            messages: [
              { role: "system", content: "You are a precise, consistent senior developer. Follow instructions exactly." },
              { role: "user", content: prompt },
            ]
          });

          const aiContent = aiResp.choices[0].message.content.trim();
          let feedback = aiContent;
          let correctedCode = null;
			debugger;
			console.log("aiContent");
			console.log(aiContent);
          if (aiContent === "✅ No changes needed" || aiContent.includes("No changes needed")) {
            console.log("ℹ️  No changes needed for test.js");
          } else {
            correctedCode = extractCorrectedCode(aiContent);
            if (correctedCode && correctedCode !== original) {
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

app.listen(PORT, () => console.log(`🚀 Listening AI code review on http://localhost:${PORT}`));
