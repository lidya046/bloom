import { pool } from './db.js';

function adminIds() {
    return String(process.env.ADMIN_TELEGRAM_IDS || '')
        .split(',')
        .map(v => v.trim())
        .filter(Boolean);
}

export function isAdminTelegramId(id) {
    return adminIds().includes(String(id));
}

export function adminIdsConfigured() {
    return adminIds().length > 0;
}

export async function notifyAdmins(text) {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) return { sent: 0, reason: 'missing_bot_token' };
    const ids = adminIds();
    if (!ids.length) return { sent: 0, reason: 'no_admin_ids_configured' };

    let sent = 0;
    for (const chatId of ids) {
        try {
            const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ chat_id: chatId, text })
            });
            const data = await r.json();
            if (r.ok && data.ok) sent++;
        } catch (_) { }
    }
    return { sent };
}

export async function getAdminStats() {
    const [users, bouquets, purchases] = await Promise.all([
        pool.query(`SELECT COUNT(*)::int AS count FROM users`),
        pool.query(`SELECT COUNT(*)::int AS count FROM bouquets`),
        pool.query(`SELECT COALESCE(COUNT(*),0)::int AS count, COALESCE(SUM(quantity * price),0)::int AS coins FROM shop_purchases`)
            .catch(() => ({ rows: [{ count: 0, coins: 0 }] }))
    ]);
    return {
        users: users.rows[0].count,
        bouquets: bouquets.rows[0].count,
        purchases: purchases.rows[0].count,
        coinsSpent: purchases.rows[0].coins
    };
}
