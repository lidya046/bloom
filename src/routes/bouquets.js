import { Router } from 'express';
import { pool } from '../db.js';
import { notifyAdmins } from '../admin.js';
import { addXp } from '../progress.js';
import { incrementAchievement, setAchievementProgress } from '../achievements.js';
const router = Router();

async function notifyTelegram(telegramId, bouquet, sender) {
  if (!telegramId || !process.env.TELEGRAM_BOT_TOKEN) return { sent: false, reason: 'missing_recipient_or_token' };
  const text = `💐 Kamu menerima bouquet dari ${sender.first_name || sender.username || 'seseorang'}!\n\n${bouquet.message || 'Ada bunga untukmu 🌷'}\n\nBuka Bloom untuk melihat bouquet-mu 💌`;
  const payload = { chat_id: telegramId, text };
  if (process.env.WEB_APP_URL) {
    payload.reply_markup = { inline_keyboard: [[{ text: '💌 Buka Bouquet', web_app: { url: `${process.env.WEB_APP_URL}?bouquet=${encodeURIComponent(bouquet.id)}` } }]] };
  }
  const r = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
  });
  const data = await r.json();
  if (!r.ok || !data.ok) return { sent: false, reason: data.description || 'telegram_send_failed' };
  return { sent: true };
}

router.post('/', async (req, res) => {
  const { receiverUsername = null, message = '', wrapping = 'pink', ribbon = '🎀', decoration = 'sparkle', items = [] } = req.body || {};
  if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ error: 'Bouquet needs at least one flower' });

  const rawUsername = String(receiverUsername || '').trim().replace(/^@/, '');
  if (!rawUsername) return res.status(400).json({ error: 'Username Telegram penerima wajib diisi' });
  if (!/^[A-Za-z][A-Za-z0-9_]{4,31}$/.test(rawUsername)) {
    return res.status(400).json({ error: 'Username Telegram tidak valid' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const u = (await client.query('SELECT * FROM users WHERE id=$1 FOR UPDATE', [req.user.id])).rows[0];
    const receiver = (await client.query(
      `SELECT id, telegram_id, username, first_name FROM users WHERE LOWER(username)=LOWER($1) LIMIT 1`,
      [rawUsername]
    )).rows[0];
    if (!receiver) throw new Error('User dengan username tersebut belum terdaftar di Bloom. Minta dia buka Bloom dulu.');
    if (receiver.id === u.id) throw new Error('Kamu tidak bisa mengirim bouquet ke diri sendiri.');

    const cost = 10;
    if (u.coins < cost) throw new Error('Not enough coins');
    for (const item of items) {
      const qty = Math.max(1, Number(item.quantity || 1));
      const q = await client.query('SELECT quantity FROM user_flowers WHERE user_id=$1 AND flower_id=$2 FOR UPDATE', [u.id, item.flowerId]);
      if (!q.rows[0] || q.rows[0].quantity < qty) throw new Error('Not enough flower quantity');
    }
    const safeWrapping = ['pink', 'purple', 'cream'].includes(String(wrapping)) ? String(wrapping) : 'pink';
    const safeRibbon = ['🎀', '💜', '✨'].includes(String(ribbon)) ? String(ribbon) : '🎀';
    const safeDecoration = ['sparkle', 'heart', 'none'].includes(String(decoration)) ? String(decoration) : 'sparkle';
    const b = (await client.query(`INSERT INTO bouquets(sender_id,receiver_telegram_id,receiver_username,message,wrapping,ribbon,decoration) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`, [u.id, receiver.telegram_id, receiver.username, message, safeWrapping, safeRibbon, safeDecoration])).rows[0];
    for (const item of items) { const qty = Math.max(1, Number(item.quantity || 1)); await client.query('UPDATE user_flowers SET quantity=quantity-$1 WHERE user_id=$2 AND flower_id=$3', [qty, u.id, item.flowerId]); await client.query('INSERT INTO bouquet_items(bouquet_id,flower_id,quantity) VALUES($1,$2,$3)', [b.id, item.flowerId, qty]); }
    const xpResult = await addXp(client, u.id, 15);
    await client.query('UPDATE users SET coins=coins-$1 WHERE id=$2', [cost, u.id]);
    await incrementAchievement(client, u.id, 'first_gift', 1);
    await incrementAchievement(client, u.id, 'bouquet_giver', 1);
    await incrementAchievement(client, u.id, 'bouquet_master', 1);
    if (xpResult.level >= 5) await setAchievementProgress(client, u.id, 'level_5', xpResult.level);
    await client.query('COMMIT');
    let notification = { sent: false };
    try { notification = await notifyTelegram(receiver.telegram_id, b, u); } catch (e) { notification = { sent: false, reason: e.message }; }
    const senderLabel = u.username ? `@${u.username}` : (u.first_name || `ID ${u.telegram_id}`);
    const receiverLabel = receiver.username ? `@${receiver.username}` : (receiver.first_name || `ID ${receiver.telegram_id}`);
    let flowerSummary = [];
    try {
      const rows = await pool.query(`SELECT f.emoji, f.name, bi.quantity FROM bouquet_items bi JOIN flowers f ON f.id=bi.flower_id WHERE bi.bouquet_id=$1 ORDER BY f.id`, [b.id]);
      flowerSummary = rows.rows.map(x => `${x.emoji} ${x.name} ×${x.quantity}`);
    } catch (_) { }
    notifyAdmins(`💐 BOUQUET TERKIRIM!\n\n👤 Pengirim: ${senderLabel}\n👤 Penerima: ${receiverLabel}\n\n${flowerSummary.join('\n') || '🌸 Bouquet'}\n\n💌 ${message || 'Tanpa pesan'}\n🕐 ${new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}`).catch(() => { });
    res.json({ bouquet: b, cost, xp: 15, level: xpResult.level, leveledUp: xpResult.leveledUp, receiver: { username: receiver.username, first_name: receiver.first_name }, notification });
  } catch (e) { await client.query('ROLLBACK'); res.status(400).json({ error: e.message }); } finally { client.release(); }
});
router.get('/sent', async (req, res) => { const r = await pool.query(`SELECT b.*,json_agg(json_build_object('flowerId',bi.flower_id,'quantity',bi.quantity)) items FROM bouquets b JOIN bouquet_items bi ON bi.bouquet_id=b.id WHERE b.sender_id=$1 GROUP BY b.id ORDER BY b.created_at DESC`, [req.user.id]); res.json(r.rows); });
router.get('/received', async (req, res) => { const r = await pool.query(`SELECT b.*,u.first_name AS sender_first_name,u.username AS sender_username,json_agg(json_build_object('flowerId',bi.flower_id,'quantity',bi.quantity)) items FROM bouquets b JOIN bouquet_items bi ON bi.bouquet_id=b.id LEFT JOIN users u ON u.id=b.sender_id WHERE b.receiver_telegram_id=$1 GROUP BY b.id,u.first_name,u.username ORDER BY b.created_at DESC`, [req.user.telegram_id]); res.json(r.rows); });
export default router;
