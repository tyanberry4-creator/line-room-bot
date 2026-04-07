const { Client, middleware } = require('@line/bot-sdk');
const { OpenAI } = require('openai');
const express = require('express');

const config = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET,
};

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const client = new Client(config);
const app = express();

app.post('/api/webhook', middleware(config), (req, res) => {
  Promise.all(req.body.events.map(handleEvent))
    .then((result) => res.json(result))
    .catch((err) => {
      console.error(err);
      res.status(500).end();
    });
});

async function handleEvent(event) {
  if (event.type !== 'message' || event.message.type !== 'text') return null;

  const userMessage = event.message.text;

  const prompt = `
あなたは楽天ROOMで売れる投稿を作るプロです。
以下のユーザーからの情報を元に、指定の形式で添削してください。

【入力情報】
${userMessage}

【出力形式】
①総合評価（A〜Cで理由付き）
②弱いポイントの指摘（率直に）
③改善ポイント（具体的に）
④より売れる投稿にリライト（1〜2パターン）
⑤クリックしたくなるタイトル案（3つ）
⑥「売れるための一言」（追記すべき一文）

※共感・リアル感・時短・お得を重視し、スマホで読みやすく改行してください。
`;

  const completion = await openai.chat.completions.create({
    model: "gpt-3.5-turbo",
    messages: [{ role: "system", content: "楽天ROOM専門のセールスライターです。" }, { role: "user", content: prompt }],
  });

  return client.replyMessage(event.replyToken, {
    type: 'text',
    text: completion.choices[0].message.content,
  });
}

module.exports = app;
