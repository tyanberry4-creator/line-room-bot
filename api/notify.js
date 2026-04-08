import { Client } from '@line/bot-sdk';

const client = new Client({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET,
});

// あなたのLINEユーザーID
const MY_LINE_USER_ID = 'asgs1204';

// 楽天イベント一覧（日程が決まったら追加してください）
const RAKUTEN_EVENTS = [
  { name: "お買い物マラソン", date: "2025-12-19" },
  { name: "楽天スーパーSALE", date: "2025-12-04" },
  { name: "楽天感謝祭", date: "2025-11-21" },
];

function getTwoDaysLaterDate() {
  const d = new Date();
  d.setDate(d.getDate() + 2);
  return d.toISOString().split('T')[0]; // "2025-11-19"形式
}

function getZeroFiveDays() {
  // 0と5のつく日を自動生成（当月＋翌月）
  const days = [5, 10, 15, 20, 25, 30];
  const results = [];
  const now = new Date();
  for (let m = 0; m <= 1; m++) {
    const year = now.getFullYear();
    const month = now.getMonth() + m;
    for (const d of days) {
      const dateStr = new Date(year, month, d).toISOString().split('T')[0];
      results.push({ name: "0か5のつく日（ポイントアップ）", date: dateStr });
    }
  }
  return results;
}

export default async function handler(req, res) {
  const twoDaysLater = getTwoDaysLaterDate();
  const allEvents = [...RAKUTEN_EVENTS, ...getZeroFiveDays()];
  const matched = allEvents.filter(e => e.date === twoDaysLater);

  if (matched.length === 0) {
    return res.status(200).send('No events today');
  }

  const eventNames = matched.map(e => e.name).join('・');
  const message = `📢 楽天イベントのお知らせ\n\n明後日は【${eventNames}】です！\n\n今日中に投稿を準備しておきましょう✨\n\n商品のアイデアが欲しい方は「メニュー」→「3」を選んでください！`;

  try {
    await client.pushMessage(MY_LINE_USER_ID, {
      type: 'text',
      text: message,
    });
    return res.status(200).send('Notification sent');
  } catch (error) {
    console.error("Push Error:", error);
    return res.status(500).send('Error');
  }
}
