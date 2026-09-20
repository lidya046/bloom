import { Router } from 'express';
import { pool } from '../db.js';

const router = Router();

async function notifyRecipient(telegramId, sender, amount) {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token || !telegramId) return;
    const senderLabel = sender.username ? `@${sender.username}` : (sender.first_name || 'Teman');
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            chat_id: telegramId,
            text: `🪙 ${senderLabel} mengirim ${amount.toLocaleString('id-ID')} Coins untukmu di Bloom! Buka Bloom untuk melihat saldo kamu.`
        })
    });
}

router.post('/', async (req, res) => {
    const rawUsername = String(req.body?.username || '').trim().replace(/^@/, '');
    const amount = Number(req.body?.amount);

    if (!/^[A-Za-z][A-Za-z0-9_]{4,31}$/.test(rawUsername)) {
        return res.status(400).json({ error: 'Username Telegram tidak valid' });
    }
    if (!Number.isInteger(amount) || amount < 1 || amount > 1000000) {
        return res.status(400).json({ error: 'Jumlah Coins harus bilangan bulat antara 1 dan 1.000.000' });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const receiver = (await client.query(
            `SELECT id, telegram_id, username, first_name
       FROM users WHERE LOWER(username)=LOWER($1) LIMIT 1`,
            [rawUsername]
        )).rows[0];
        if (!receiver) throw new Error('User dengan username tersebut belum terdaftar di Bloom.');

        const userIds = [req.user.id, receiver.id].sort((a, b) => Number(a) - Number(b));
        const lockedUsers = (await client.query(
            `SELECT id, telegram_id, username, first_name, coins
       FROM users WHERE id = ANY($1::bigint[]) ORDER BY id FOR UPDATE`,
            [userIds]
        )).rows;
        const sender = lockedUsers.find(user => String(user.id) === String(req.user.id));
        const lockedReceiver = lockedUsers.find(user => String(user.id) === String(receiver.id));
        if (!sender || !lockedReceiver) throw new Error('User tidak ditemukan');
        if (sender.id === lockedReceiver.id) throw new Error('Kamu tidak bisa mengirim Coins ke diri sendiri.');
        if (sender.coins < amount) throw new Error('Saldo Coins tidak cukup.');

        await client.query('UPDATE users SET coins=coins-$1 WHERE id=$2', [amount, sender.id]);
        await client.query('UPDATE users SET coins=coins+$1 WHERE id=$2', [amount, lockedReceiver.id]);
        const transfer = (await client.query(
            `INSERT INTO coin_transfers (sender_id, receiver_id, amount)
       VALUES ($1, $2, $3) RETURNING id, amount, created_at`,
            [sender.id, lockedReceiver.id, amount]
        )).rows[0];
        const balances = (await client.query(
            'SELECT id, coins FROM users WHERE id = ANY($1::bigint[])',
            [[sender.id, lockedReceiver.id]]
        )).rows;
        await client.query('COMMIT');

        notifyRecipient(lockedReceiver.telegram_id, sender, amount).catch(() => { });
        res.json({
            transfer,
            receiver: { username: lockedReceiver.username, first_name: lockedReceiver.first_name },
            balance: balances.find(user => String(user.id) === String(sender.id))?.coins
        });
    } catch (error) {
        await client.query('ROLLBACK');
        res.status(400).json({ error: error.message });
    } finally {
        client.release();
    }
});

router.get('/', async (req, res) => {
    const result = await pool.query(
        `SELECT t.id, t.amount, t.created_at,
            sender.username AS sender_username, receiver.username AS receiver_username
     FROM coin_transfers t
     JOIN users sender ON sender.id=t.sender_id
     JOIN users receiver ON receiver.id=t.receiver_id
     WHERE t.sender_id=$1 OR t.receiver_id=$1
     ORDER BY t.created_at DESC LIMIT 20`,
        [req.user.id]
    );
    res.json(result.rows);
});

export default router;