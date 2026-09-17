import { validateTelegramInitData } from './telegramAuth.js';
import { pool } from './db.js';

export async function telegramAuth(req, res, next) {
  // Telegram webhook tidak menggunakan Mini App initData.
  if (req.method === 'POST' && req.path === '/coin-orders/telegram') {
    return next();
  }

  try {
    const header = req.headers.authorization || '';
    const initData = header.startsWith('tma ')
      ? header.slice(4)
      : req.headers['x-telegram-init-data'];

    const tgUser = validateTelegramInitData(
      initData,
      process.env.TELEGRAM_BOT_TOKEN
    );

    const result = await pool.query(
      `INSERT INTO users (telegram_id, username, first_name)
             VALUES ($1,$2,$3)
             ON CONFLICT (telegram_id)
             DO UPDATE SET
                username=EXCLUDED.username,
                first_name=EXCLUDED.first_name
             RETURNING *`,
      [
        tgUser.id,
        tgUser.username ?? null,
        tgUser.first_name ?? null
      ]
    );

    req.user = result.rows[0];
    req.telegramUser = tgUser;

    next();
  } catch (e) {
    res.status(401).json({ error: e.message });
  }
}