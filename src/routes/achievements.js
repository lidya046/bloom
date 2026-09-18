import { Router } from 'express';
import { pool } from '../db.js';
import { ACHIEVEMENTS } from '../achievements.js';

const router = Router();

router.get('/', async (req, res) => {
    try {
        const user = (await pool.query('SELECT level FROM users WHERE id=$1', [req.user.id])).rows[0];
        const distinct = Number((await pool.query('SELECT COUNT(*)::int AS count FROM user_flowers WHERE user_id=$1 AND quantity>0', [req.user.id])).rows[0]?.count || 0);
        const special = Number((await pool.query('SELECT COUNT(*)::int AS count FROM user_flowers uf JOIN flowers f ON f.id=uf.flower_id WHERE uf.user_id=$1 AND uf.quantity>0 AND f.is_special=true', [req.user.id])).rows[0]?.count || 0);
        const sent = Number((await pool.query('SELECT COUNT(*)::int AS count FROM bouquets WHERE sender_id=$1', [req.user.id])).rows[0]?.count || 0);

        const client = await pool.connect();
        try {
            if (distinct > 0) await (await import('../achievements.js')).setAchievementProgress(client, req.user.id, 'first_bloom', 1);
            await (await import('../achievements.js')).setAchievementProgress(client, req.user.id, 'collector', distinct);
            await (await import('../achievements.js')).setAchievementProgress(client, req.user.id, 'first_gift', sent);
            await (await import('../achievements.js')).setAchievementProgress(client, req.user.id, 'bouquet_giver', sent);
            await (await import('../achievements.js')).setAchievementProgress(client, req.user.id, 'bouquet_master', sent);
            await (await import('../achievements.js')).setAchievementProgress(client, req.user.id, 'special_collector', special);
            await (await import('../achievements.js')).setAchievementProgress(client, req.user.id, 'level_5', Number(user?.level || 1));
        } finally {
            client.release();
        }

        const r = await pool.query(
            `SELECT achievement_key, progress, unlocked_at
       FROM user_achievements
       WHERE user_id=$1`,
            [req.user.id]
        );
        const map = new Map(r.rows.map(x => [x.achievement_key, x]));
        res.json({
            achievements: ACHIEVEMENTS.map(a => ({
                ...a,
                progress: Number(map.get(a.key)?.progress || 0),
                unlocked: Boolean(map.get(a.key)?.unlocked_at)
            }))
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

export default router;
