import { Router } from 'express';
import { pool } from '../db.js';
import { addXp } from '../progress.js';
import { setAchievementProgress } from '../achievements.js';
const router = Router();
router.post('/daily', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const u = (await client.query('SELECT * FROM users WHERE id=$1 FOR UPDATE', [req.user.id])).rows[0];
    if (u.daily_reward_at && Date.now() - new Date(u.daily_reward_at).getTime() < 24 * 60 * 60 * 1000) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'Daily reward already claimed' }); }
    const xpResult = await addXp(client, u.id, 10);
    await client.query('UPDATE users SET coins=coins+50,seeds=seeds+2,daily_reward_at=NOW() WHERE id=$1', [u.id]);
    if (xpResult.level >= 5) await setAchievementProgress(client, u.id, 'level_5', xpResult.level);
    await client.query('COMMIT'); res.json({ coins: 50, seeds: 2, xp: 10, level: xpResult.level, leveledUp: xpResult.leveledUp });
  } catch (e) { await client.query('ROLLBACK'); res.status(500).json({ error: e.message }); } finally { client.release(); }
});
export default router;
