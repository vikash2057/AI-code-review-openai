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

app.get('/', (req, res) => {
  res.send('AI Code Review Webhook Server is running');
});

app.post('/github-webhook', async (req, res) => {
  console.log("pull testing for code review")
  const event = req.headers['x-github-event'];
  const action = req.body.action;

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

      // STEP 2: AI review each file
      const reviewResults = await Promise.all(
        files
          .filter(file => file.patch) // Skip binary or unchanged files
          .map(async (file) => {
            const prompt = `Please review the following code diff:\n\n${file.patch}\n\nGive suggestions, improvements, or highlight any issues.`;

            const response = await openai.chat.completions.create({
              model: "gpt-4o", // or "gpt-3.5-turbo" for cheaper review
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
          })
      );

      // STEP 3: Combine and post comment to PR
      const body = reviewResults.map(r => `### 💡 \`${r.filename}\`\n${r.feedback}`).join('\n\n');

      await axios.post(`${pr.url}/comments`, { body }, {
        headers: {
          Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
          Accept: 'application/vnd.github+json'
        }
      });

      console.log(`✅ AI feedback posted to PR #${prNumber}`);
    } catch (err) {
      console.error('❌ Error reviewing PR:', err.message);
    }
  }

  res.sendStatus(200);
});

app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
