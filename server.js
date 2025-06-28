import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import OpenAI from 'openai';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();
const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Serve static frontend files
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.use(express.static(path.join(__dirname, 'public')));

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const getPrompt = (code) => `
You are a senior software engineer. Perform a brief code review with:
- A short summary
- Any bugs or concerns
- 1–2 improvement suggestions

Only respond in JSON:
{
  "summary": "...",
  "issues": ["..."],
  "recommendations": ["..."]
}

Code:
\`\`\`
${code}
\`\`\`
`;

app.post('/review-text', async (req, res) => {
  try {
    const { code } = req.body;
    const prompt = getPrompt(code);

    const response = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      temperature: 0.3,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = response.choices[0].message.content.trim();

    let json;
    try {
      json = JSON.parse(text);
    } catch (err) {
      console.error("❌ Failed to parse model response:", text);
      return res.status(500).json({ error: "Model response was not valid JSON.", raw: text });
    }

    res.json(json);

  } catch (error) {
    console.error('❌ Error:', error.message);
    res.status(500).json({ error: 'Failed to review code.' });
  }
});

// Optional fallback to serve index.html for unknown routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/index.html'));
});

app.listen(PORT, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
});
app.post('/webhook', express.json(), async (req, res) => {
  const event = req.headers['x-github-event'];

  if (event === 'pull_request' && ['opened', 'synchronize'].includes(req.body.action)) {
    const pr = req.body.pull_request;
    const repo = req.body.repository;
    const files_url = pr.url + '/files';

    const token = process.env.GITHUB_TOKEN; // needs repo read access

    const response = await fetch(files_url, {
      headers: {
        'Authorization': `token ${token}`,
        'Accept': 'application/vnd.github.v3+json',
      }
    });

    const files = await response.json();

    for (const file of files) {
      if (file.status === 'modified' || file.status === 'added') {
        const rawContent = await fetch(file.raw_url);
        const code = await rawContent.text();

        const aiResponse = await fetch('http://localhost:5000/review-text', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code })
        });

        const result = await aiResponse.json();

        // You can now log this, or optionally post to PR via GitHub API
        console.log(`Review for ${file.filename}:`, result);
      }
    }

    res.status(200).send('Review complete');
  } else {
    res.status(200).send('No action taken');
  }
});

