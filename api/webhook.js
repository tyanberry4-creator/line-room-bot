import { Client } from '@line/bot-sdk';
import { GoogleGenerativeAI } from "@google/generative-ai";
import express from 'express';

const config = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET,
};

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
// モデル名を「gemini-1.5-flash」に固定して、確実に動かします
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
const client = new Client(config);
const app = express();

// Vercelのファイル名が webhook.js なら、ここは '/' でOKです
app.post('/', express.json(), async (req, res) => {
  const events = req.body.events;
  if (!events || events.length === 0) return res.status(200).send('OK');
  
  try {
    await Promise.all(events.map(handleEvent));
    res.json({ status: 'success' });
  } catch (err) {
    console.error("Error in webhook:", err);
    res.status(500).end();
  }
});

async function handleEvent(event) {
  if (event.type !== 'message' || event.message.type !== 'text') return null;

  try {
    const prompt = `あなたは楽天ROOMのプロです。以下の投稿を添削して。
【内容】${event.message.text}
①評価 ②改善点 ③リライト案 ④タイトル案 ⑤一言`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    
    return client.replyMessage(event.replyToken, {
      type: 'text',
      text: response.text(),
    });
  } catch (error) {
    console.error("Gemini Error:", error);
    // エラーが起きた時にLINEに通知が行くようにします
    return client.replyMessage(event.replyToken, {
      type: 'text',
      text: "申し訳ありません。AI側でエラーが発生しました。設定（APIキーやモデル名）を確認してください。",
    });
  }
}

export default app;
