import { Router } from 'express';
import { pool } from '../db.js';
import { isAdminTelegramId, getAdminStats } from '../admin.js';

const router = Router();

function requireAdmin(req, res, next) {
    if (!isAdminTelegramId(req.user?.telegram_id)) return res.status(403).json({ error: 'Admin only' });
    next();
}

router.get('/stats', requireAdmin, async (_req, res) => {
    try {
        const stats = await getAdminStats();
        const recent = await pool.query(`
      SELECT b.id, b.created_at, su.username AS sender_username, ru.username AS receiver_username, b.message
      FROM bouquets b
      JOIN users su ON su.id=b.sender_id
      LEFT JOIN users ru ON ru.telegram_id=b.receiver_telegram_id
      ORDER BY b.created_at DESC LIMIT 10
    `);
        res.json({ ...stats, recentBouquets: recent.rows });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.get('/me', requireAdmin, async (req, res) => {
    res.json({ isAdmin: true, telegramId: String(req.user.telegram_id) });
});

router.get('/user', requireAdmin, async (req, res) => {
    const username = String(req.query.username || '').trim().replace(/^@/, '');
    if (!username) return res.status(400).json({ error: 'Username wajib diisi' });

    const r = await pool.query(
        `SELECT id, telegram_id, username, first_name, coins, seeds, level, xp
         FROM users
         WHERE LOWER(username)=LOWER($1)
         LIMIT 1`,
        [username]
    );

    if (!r.rows[0]) return res.status(404).json({ error: 'User tidak ditemukan' });
    res.json(r.rows[0]);
});

router.post('/balance', requireAdmin, async (req, res) => {
    const username = String(req.body.username || '').trim().replace(/^@/, '');
    const coinsDelta = Number(req.body.coinsDelta ?? 0);
    const seedsDelta = Number(req.body.seedsDelta ?? 0);

    if (!username) return res.status(400).json({ error: 'Username wajib diisi' });
    if (!Number.isInteger(coinsDelta) || !Number.isInteger(seedsDelta)) {
        return res.status(400).json({ error: 'Coins dan seeds harus berupa bilangan bulat' });
    }
    if (coinsDelta === 0 && seedsDelta === 0) {
        return res.status(400).json({ error: 'Isi jumlah coins atau seeds yang ingin diubah' });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const before = await client.query(
            `SELECT id, telegram_id, username, first_name, coins, seeds
             FROM users
             WHERE LOWER(username)=LOWER($1)
             FOR UPDATE`,
            [username]
        );

        if (!before.rows[0]) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'User tidak ditemukan' });
        }

        const u = before.rows[0];
        const newCoins = Number(u.coins) + coinsDelta;
        const newSeeds = Number(u.seeds) + seedsDelta;

        if (newCoins < 0 || newSeeds < 0) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'Saldo user tidak boleh menjadi negatif' });
        }

        const updated = await client.query(
            `UPDATE users
             SET coins=$1, seeds=$2
             WHERE id=$3
             RETURNING id, telegram_id, username, first_name, coins, seeds, level, xp`,
            [newCoins, newSeeds, u.id]
        );

        await client.query('COMMIT');

        console.log(
            `[ADMIN BALANCE] admin=${req.user.telegram_id} target=@${u.username} ` +
            `coins ${u.coins}->${newCoins}, seeds ${u.seeds}->${newSeeds}`
        );

        res.json({
            message: 'Balance berhasil diubah',
            before: { coins: Number(u.coins), seeds: Number(u.seeds) },
            user: updated.rows[0],
            delta: { coins: coinsDelta, seeds: seedsDelta }
        });
    } catch (e) {
        await client.query('ROLLBACK');
        res.status(500).json({ error: e.message });
    } finally {
        client.release();
    }
});

export default router;
