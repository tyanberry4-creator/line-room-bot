import { Client } from '@line/bot-sdk';
import { GoogleGenerativeAI } from "@google/generative-ai";
import express from 'express';

const config = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET,
};

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
const client = new Client(config);
const app = express();

app.use(express.json());

app.post('*', async (req, res) => {
  const events = req.body.events;
  if (!events || events.length === 0) {
    return res.status(200).send('OK');
  }
  try {
    await Promise.all(events.map(handleEvent));
    res.json({ status: 'success' });
  } catch (err) {
    console.error("Webhook Error:", err);
    res.status(500).end();
  }
});

// リトライ付きGemini呼び出し
async function generateWithRetry(prompt, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const result = await model.generateContent(prompt);
      return result.response.text();
    } catch (error) {
      const isRetryable = error.status === 503 || error.status === 429;
      if (isRetryable && i < maxRetries - 1) {
        const waitMs = (i + 1) * 2000;
        console.log(`Gemini ${error.status}, ${waitMs}ms後にリトライ (${i + 1}/${maxRetries - 1})`);
        await new Promise(res => setTimeout(res, waitMs));
      } else {
        throw error;
      }
    }
  }
}

async function handleEvent(event) {
  if (event.type !== 'message' || event.message.type !== 'text') return null;
  try {
    const userText = event.message.text;
    const prompt = `あなたは楽天ROOMのプロです。以下の投稿内容を分析し、魅力的な紹介文に添削してください。
【元の内容】
${userText}
以下の形式で回答してください：
①評価：
②改善点：
③プロのリライト案：
④目を引くタイトル案：
⑤一言アドバイス：`;

    const replyText = await generateWithRetry(prompt);

    return client.replyMessage(event.replyToken, {
      type: 'text',
      text: replyText,
    });
  } catch (error) {
    console.error("Gemini Error:", error);

    let errorMessage = "申し訳ありません。AIとの通信でエラーが発生しました。";
    if (error.status === 503) {
      errorMessage = "ただいまAIが混み合っています。少し時間をおいて再度お試しください。";
    } else if (error.message?.includes("404")) {
      errorMessage += "\n(エラー原因: モデル名が見つかりません)";
    } else if (error.message?.includes("API key")) {
      errorMessage += "\n(エラー原因: APIキーが無効です)";
    }

    return client.replyMessage(event.replyToken, {
      type: 'text',
      text: errorMessage,
    });
  }
}

export default app;
