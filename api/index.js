const { Client } = require('@line/bot-sdk');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const express = require('express');

const config = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET,
};

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
const client = new Client(config);
const app = express();

app.use(express.json());

const userState = {};

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

async function generateWithRetry(prompt, maxRetries = 5) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const result = await model.generateContent(prompt);
      return result.response.text();
    } catch (error) {
      const isRetryable = error.status === 503 || error.status === 429;
      if (isRetryable && i < maxRetries - 1) {
        const waitMs = (i + 1) * 3000;
        await new Promise(res => setTimeout(res, waitMs));
      } else {
        throw error;
      }
    }
  }
}

function getAccountStyle(account) {
  if (account === 'mama') {
    return `【アカウントのキャラクター設定】
・育児中のママアカウント
・文体はタメ口で親しみやすく、共感重視
・絵文字は文末に1〜2個、全体で最低1個使う
・「やば、すごくない？、神がかってる、もう無理（良い意味で）、どうしよ、優勝」などオーバー気味なフレーズを自然に使う
・「脳死」という言葉は絶対に使わない`;
  } else if (account === 'stylish') {
    return `【アカウントのキャラクター設定】
・おしゃれな雑貨・家具が好きな落ち着いたアカウント
・文体は丁寧だけど親しみやすく、世界観を大切にする
・絵文字や記号は🕊️🌿🫧❄️🌸〰︎☻𓅺𓂃𓃱𓈒𓏸𓆉𓄅𓍯𖤣𖥧𖥣𖡡などを文中や文末にさりげなく使う
・「〜な暮らし、日常に溶け込む、そっと寄り添う、お気に入りの一つに」などの落ち着いたフレーズを自然に使う`;
  }
  return '';
}

function getEditPrompt(mode, userText, account) {
  const accountStyle = getAccountStyle(account);
  if (mode === 'threads') {
    return `あなたはThreadsで楽天アフィリエイトを成功させているプロです。以下の投稿内容を分析し、Threadsで売れる投稿に添削してください。

${accountStyle}

【元の内容】
${userText}

Threadsの特性（500文字以内・ハッシュタグ不要・一文目で止める）を踏まえて、以下の形式で回答してください。回答全体は1500文字以内にしてください。

①評価：
②改善点：
③プロのリライト案（500文字以内・一文目で思わず続きを読みたくなる構成）：
④一文目だけの別案を3つ：
⑤一言アドバイス：`;
  } else {
    return `あなたは楽天ROOMのプロです。以下の投稿内容を分析し、Instagramで売れる魅力的な紹介文に添削してください。

${accountStyle}

【元の内容】
${userText}

以下の形式で回答してください。回答全体は1500文字以内にしてください。

①評価：
②改善点：
③プロのリライト案（冒頭3行で引き込む構成）：
④目を引くタイトル案：
⑤一言アドバイス：`;
  }
}

function getSuggestionPrompt(target, theme, account) {
  const accountStyle = getAccountStyle(account);
  const today = new Date().toLocaleDateString('ja-JP', { month: 'long', day: 'numeric' });
  return `以下の条件でターゲットに刺さる楽天の売れ筋商品を3つ提案してください。
今日は${today}です。

${accountStyle}

【ターゲット】${target}
【テーマ・季節】${theme === 'おまかせ' ? '今の季節や直近のイベントに合わせておまかせ' : theme}

回答は以下の形式のみで返してください。前置きや説明は不要です。回答全体は1200文字以内にしてください。

【商品①】
・商品ジャンル：
・おすすめ理由：
・URLへ誘導する一言（インパクト重視・短め）：

【商品②】
・商品ジャンル：
・おすすめ理由：
・URLへ誘導する一言（インパクト重視・短め）：

【商品③】
・商品ジャンル：
・おすすめ理由：
・URLへ誘導する一言（インパクト重視・短め）：`;
}

function showMenu(account) {
  const accountLabel = account === 'mama'
    ? '現在：育児ママアカウント👶'
    : account === 'stylish'
    ? '現在：おしゃれ雑貨・家具アカウント𓅺'
    : '※アカウントが未選択です（4か5を選んでください）';

  return `何をしますか？\n\n${accountLabel}\n\n1 → Threads投稿を添削\n2 → Instagram・楽天ROOM投稿を添削\n3 → 売れる商品・季節商品を一緒に考える\n4 → 育児ママアカウントに切り替え\n5 → おしゃれ雑貨・家具アカウントに切り替え\n\n番号を送ってください！`;
}

async function handleEvent(event) {
  if (event.type !== 'message' || event.message.type !== 'text') return null;

  const userId = event.source.userId;
  const userText = event.message.text.trim();
  const state = userState[userId] || { step: 'menu', account: null };

  try {
    if (userText === 'メニュー' || userText === 'menu' || userText === '0') {
      userState[userId] = { ...state, step: 'menu' };
      return client.replyMessage(event.replyToken, {
        type: 'text', text: showMenu(state.account),
      });
    }

    if (state.step === 'menu' || state.step === undefined) {
      if (userText === '1') {
        if (!state.account) {
          return client.replyMessage(event.replyToken, {
            type: 'text', text: 'まずアカウントを選んでください！\n\n4 → 育児ママアカウント\n5 → おしゃれ雑貨・家具アカウント',
          });
        }
        userState[userId] = { ...state, step: 'waiting_post', mode: 'threads' };
        return client.replyMessage(event.replyToken, {
          type: 'text', text: 'Threadsモードです！\n添削したい投稿文を送ってください。\n\n（「メニュー」と送るといつでも戻れます）',
        });
      }
      if (userText === '2') {
        if (!state.account) {
          return client.replyMessage(event.replyToken, {
            type: 'text', text: 'まずアカウントを選んでください！\n\n4 → 育児ママアカウント\n5 → おしゃれ雑貨・家具アカウント',
          });
        }
        userState[userId] = { ...state, step: 'waiting_post', mode: 'instagram' };
        return client.replyMessage(event.replyToken, {
          type: 'text', text: 'Instagram・楽天ROOMモードです！\n添削したい投稿文を送ってください。\n\n（「メニュー」と送るといつでも戻れます）',
        });
      }
      if (userText === '3') {
        if (!state.account) {
          return client.replyMessage(event.replyToken, {
            type: 'text', text: 'まずアカウントを選んでください！\n\n4 → 育児ママアカウント\n5 → おしゃれ雑貨・家具アカウント',
          });
        }
        userState[userId] = { ...state, step: 'waiting_target' };
        return client.replyMessage(event.replyToken, {
          type: 'text', text: '商品提案モードです！\n\nまず教えてください。\nあなたのフォロワー層はどんな方が多いですか？\n\n例：20代女性・育児中のママ・40代主婦・美容好きな女性など',
        });
      }
      if (userText === '4') {
        userState[userId] = { ...state, account: 'mama', step: 'menu' };
        return client.replyMessage(event.replyToken, {
          type: 'text', text: '育児ママアカウントに切り替えました👶\n\n' + showMenu('mama'),
        });
      }
      if (userText === '5') {
        userState[userId] = { ...state, account: 'stylish', step: 'menu' };
        return client.replyMessage(event.replyToken, {
          type: 'text', text: 'おしゃれ雑貨・家具アカウントに切り替えました𓅺\n\n' + showMenu('stylish'),
        });
      }
      return client.replyMessage(event.replyToken, {
        type: 'text', text: showMenu(state.account),
      });
    }

    if (state.step === 'waiting_post') {
      await client.replyMessage(event.replyToken, {
        type: 'text', text: '少々お待ちください✏️\n添削しています...',
      });
      const prompt = getEditPrompt(state.mode, userText, state.account);
      const replyText = await generateWithRetry(prompt);
      userState[userId] = { ...state, step: 'menu' };
      return client.pushMessage(userId, {
        type: 'text', text: replyText + '\n\n続けるには「メニュー」と送ってください。',
      });
    }

    if (state.step === 'waiting_target') {
      userState[userId] = { ...state, step: 'waiting_theme', target: userText };
      return client.replyMessage(event.replyToken, {
        type: 'text', text: `「${userText}」ですね！\n\n次に、テーマや季節はありますか？\n\n例：夏・運動会・入学準備・クリスマスなど\nなければ「おまかせ」と送ってください。`,
      });
    }

    if (state.step === 'waiting_theme') {
      await client.replyMessage(event.replyToken, {
        type: 'text', text: '少々お待ちください🔍\n商品を考えています...',
      });
      const prompt = getSuggestionPrompt(state.target, userText, state.account);
      const replyText = await generateWithRetry(prompt);
      userState[userId] = { ...state, step: 'menu' };
      return client.pushMessage(userId, {
        type: 'text', text: replyText + '\n\n続けるには「メニュー」と送ってください。',
      });
    }

  } catch (error) {
    console.error("Gemini Error:", error);
    let errorMessage = "申し訳ありません。AIとの通信でエラーが発生しました。\n少し時間をおいて再度お試しください。";
    if (error.status === 503) {
      errorMessage = "ただいまAIが混み合っています。\n少し時間をおいて再度お試しください🙏";
    }
    userState[userId] = { ...state, step: 'menu' };
    try {
      return await client.replyMessage(event.replyToken, {
        type: 'text', text: errorMessage,
      });
    } catch (replyError) {
      return await client.pushMessage(userId, {
        type: 'text', text: errorMessage,
      });
    }
  }
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

module.exports = app;
