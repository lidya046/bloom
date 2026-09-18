import { Router } from 'express';
import { pool } from '../db.js';
const router = Router();
router.get('/', async (req, res) => {
    const r = await pool.query('SELECT id,telegram_id,username,first_name,coins,seeds,level,xp,created_at FROM users WHERE id=$1', [req.user.id]);
    const user = r.rows[0];
    if (user) {
        const normalizedLevel = Math.max(1, Math.floor(Math.max(0, Number(user.xp || 0)) / 100) + 1);
        if (Number(user.level) !== normalizedLevel) {
            const fixed = await pool.query('UPDATE users SET level=$1 WHERE id=$2 RETURNING id,telegram_id,username,first_name,coins,seeds,level,xp,created_at', [normalizedLevel, req.user.id]);
            return res.json(fixed.rows[0]);
        }
    }
    res.json(user);
});
router.get('/lookup', async (req, res) => {
    const raw = String(req.query.username || '').trim().replace(/^@/, '');
    if (!raw) return res.status(400).json({ error: 'Username wajib diisi' });
    const r = await pool.query(
        `SELECT telegram_id, username, first_name FROM users WHERE LOWER(username)=LOWER($1) LIMIT 1`,
        [raw]
    );
    if (!r.rows[0]) return res.status(404).json({ error: 'Username belum terdaftar di Bloom' });
    res.json(r.rows[0]);
});
router.get('/collection', async (req, res) => { const r = await pool.query(`SELECT f.id,f.name,f.emoji,f.rarity,uf.quantity FROM user_flowers uf JOIN flowers f ON f.id=uf.flower_id WHERE uf.user_id=$1 AND uf.quantity>0 ORDER BY f.rarity,f.name`, [req.user.id]); res.json(r.rows); });
export default router;
