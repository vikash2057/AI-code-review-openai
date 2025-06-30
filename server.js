import express from 'express';
import axios from 'axios';
import cors from 'cors';
import dotenv from 'dotenv';
import OpenAI from 'openai';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Get list of reviewable files from .env
const REVIEW_FILES = process.env.REVIEW_FILES
  ? process.env.REVIEW_FILES.split(',').map(f => f.trim())
  : [];

app.get('/', (req, res) => {
  res.send('AI Code Review Webhook Server is running');
});

app.post('/github-webhook', async (req, res) => {
  console.log("Pull testing for review");

  const event = req.headers['x-github-event'];
  const action = req.body.action;

  console.log(`📥 GitHub Webhook Event: ${event}, Action: ${action}`);

  if (event === 'pull_request' && action === 'opened') {
    const pr = req.body.pull_request;
    const repo = req.body.repository;
    const prNumber = pr.number;

    console.log(`🔔 Pull request #${prNumber} opened in ${repo.full_name}`);

    try {
      // STEP 1: Fetch code diffs from PR
      const filesRes = await axios.get(`${pr.url}/files`, {
        headers: {
          Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
          Accept: 'application/vnd.github+json'
        }
      });

      const files = filesRes.data;
      console.log(`📄 Found ${files.length} file(s) in PR`);

      // Filter files by patch and filename (if REVIEW_FILES is set)
      const filteredFiles = files.filter(f =>
        f.patch && (REVIEW_FILES.length === 0 || REVIEW_FILES.includes(f.filename))
      );

      if (filteredFiles.length === 0) {
        console.log('⚠️ No matching code files to review.');
        return res.sendStatus(200);
      }

      // STEP 2: AI review each file
      const reviewResults = await Promise.all(
        filteredFiles.map(async (file) => {
          console.log(`🤖 Reviewing file: ${file.filename}`);
          const prompt = `Please review the following code diff:\n\n${file.patch}\n\nGive suggestions, improvements, or highlight any issues.`;

          try {
            const response = await openai.chat.completions.create({
              model: "gpt-4o",
              messages: [
                {
                  role: "system",
                  content: "You are a senior software engineer reviewing pull request diffs."
                },
                {
                  role: "user",
                  content: prompt
                }
              ]
            });

            return {
              filename: file.filename,
              feedback: response.choices[0].message.content
            };
          } catch (err) {
            console.error(`❌ OpenAI error on ${file.filename}:`, err.response?.data || err.message);
            return {
              filename: file.filename,
              feedback: "⚠️ Could not analyze this file due to an AI error."
            };
          }
        })
      );

      // STEP 3: Combine and post comment to PR
      const commentBody = reviewResults.map(r => `### 💡 Review for \`${r.filename}\`\n${r.feedback}`).join('\n\n');

      await axios.post(`${pr.url}/reviews`, {
        body: commentBody,
        event: "COMMENT"
      }, {
        headers: {
          Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
          Accept: 'application/vnd.github+json'
        }
      });


      console.log(`✅ AI feedback posted to PR #${prNumber} 🎉`);
    } catch (err) {
      console.error('❌ GitHub/Webhook error:', err.response?.data || err.message);
    }
  }

  res.sendStatus(200);
});

app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
