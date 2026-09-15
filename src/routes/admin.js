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

export default router;
