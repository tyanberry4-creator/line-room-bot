import { Client } from '@line/bot-sdk';
import { GoogleGenerativeAI } from "@google/generative-ai";
import express from 'express';

const config = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET,
};

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
const client = new Client(config);
const app = express();

app.post('/api/webhook', express.json(), async (req, res) => {
  const events = req.body.events;
  if (!events || events.length === 0) return res.status(200).send('OK');
  
  try {
    await Promise.all(events.map(handleEvent));
    res.json({ status: 'success' });
  } catch (err) {
    console.error(err);
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
    return client.replyMessage(event.replyToken, {
      type: 'text',
      text: "AIの準備中です。少し待ってから再度送ってください。",
    });
  }
}

export default app;
