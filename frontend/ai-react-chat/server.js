import express from 'express';
import cors from 'cors';

const app = express();
const PORT = process.env.PORT || 3001;

// 中间件
app.use(cors());
app.use(express.json());

// Gemini API 配置
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent';

// AI生成响应
app.post('/generate', async (req, res) => {
  try {
    const { prompt, temperature = 0.7, max_new_tokens = 100 } = req.body;

    if (!GEMINI_API_KEY) {
      return res.status(500).json({
        error: 'Gemini API key not configured. Please set GEMINI_API_KEY environment variable.'
      });
    }

    // 调用 Gemini API
    const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: prompt
          }]
        }],
        generationConfig: {
          temperature: temperature,
          maxOutputTokens: max_new_tokens
        }
      })
    });

    if (!response.ok) {
      throw new Error(`Gemini API error: ${response.status}`);
    }

    const data = await response.json();
    const aiResponse = data.candidates?.[0]?.content?.parts?.[0]?.text || 'AI 没有回复';

    res.json({ text: aiResponse });
  } catch (error) {
    console.error('Generate error:', error);
    res.status(500).json({ error: error.message });
  }
});

// 停止生成
app.post('/stop', (req, res) => {
  res.json({ status: 'stopped' });
});

// 会话管理
app.get('/conversations', (req, res) => {
  res.json([]);
});

app.post('/conversations', (req, res) => {
  const conversation = {
    id: Date.now().toString(),
    title: '新对话',
    created_at: new Date().toISOString()
  };
  res.json(conversation);
});

app.listen(PORT, () => {
  console.log(`后端服务器运行在 http://localhost:${PORT}`);
  if (!GEMINI_API_KEY) {
    console.log('⚠️  警告: 未设置 GEMINI_API_KEY 环境变量');
  }
});