import { Client } from '@line/bot-sdk';
import { GoogleGenerativeAI } from "@google/generative-ai";
import express from 'express';

// 1. 設定情報（VercelのEnvironment Variablesから読み込み）
const config = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET,
};

// 2. Gemini AIの設定（モデル名を直接指定して404を回避）
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-pro" });

const client = new Client(config);
const app = express();

// 3. Webhookのメイン処理
app.use(express.json());

// どんなパス（/api でも /api/webhook でも）で来ても受け取れるように設定
app.post('*', async (req, res) => {
  const events = req.body.events;
  
  // LINEからの疎通確認（Verify）用
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

// 4. メッセージ受信時の処理
async function handleEvent(event) {
  // テキストメッセージ以外は無視
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

    // Geminiで回答を生成
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const replyText = response.text();
    
    // LINEに返信
    return client.replyMessage(event.replyToken, {
      type: 'text',
      text: replyText,
    });

  } catch (error) {
    console.error("Gemini Error:", error);
    
    // エラーが起きた場合、ユーザーに状況を伝える
    let errorMessage = "申し訳ありません。AIとの通信でエラーが発生しました。";
    if (error.message.includes("404")) {
      errorMessage += "\n(エラー原因: モデル名が見つかりません。設定を確認してください)";
    } else if (error.message.includes("API key")) {
      errorMessage += "\n(エラー原因: APIキーが無効です)";
    }

    return client.replyMessage(event.replyToken, {
      type: 'text',
      text: errorMessage,
    });
  }
}

export default app;
