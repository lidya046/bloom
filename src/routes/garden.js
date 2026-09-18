import { Router } from 'express';
import { pool } from '../db.js';
import { addXp } from '../progress.js';
import { incrementAchievement, setAchievementProgress } from '../achievements.js';

const router = Router();

// Get user's flower collection
router.get('/collection', async (req, res) => {
  try {
    const result = await pool.query(
      `
      SELECT
        f.id,
        f.name,
        f.emoji,
        f.rarity,
        f.is_special,
        uf.quantity
      FROM user_flowers uf
      JOIN flowers f ON f.id = uf.flower_id
      WHERE uf.user_id = $1
        AND uf.quantity > 0
      ORDER BY
        CASE f.rarity
          WHEN 'legendary' THEN 4
          WHEN 'epic' THEN 3
          WHEN 'rare' THEN 2
          ELSE 1
        END DESC,
        f.name ASC
      `,
      [req.user.id]
    );

    res.json(result.rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// Plant one seed
router.post('/plant', async (req, res) => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const u = (
      await client.query(
        'SELECT * FROM users WHERE id = $1 FOR UPDATE',
        [req.user.id]
      )
    ).rows[0];

    if (u.seeds < 1) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        error: 'No seeds'
      });
    }

    const roll = Math.random();

    const rarity =
      roll < 0.01
        ? 'legendary'
        : roll < 0.10
          ? 'epic'
          : roll < 0.35
            ? 'rare'
            : 'common';

    const f = (
      await client.query(
        `
        SELECT *
        FROM flowers
        WHERE rarity = $1
        ORDER BY random()
        LIMIT 1
        `,
        [rarity]
      )
    ).rows[0];

    const xpResult = await addXp(client, u.id, 5);
    await client.query(
      `UPDATE users SET seeds=seeds-1, coins=coins+5 WHERE id=$1`,
      [u.id]
    );

    await incrementAchievement(client, u.id, 'first_bloom', 1);

    await client.query(
      `
      INSERT INTO user_flowers (
        user_id,
        flower_id,
        quantity
      )
      VALUES ($1, $2, 1)
      ON CONFLICT (user_id, flower_id)
      DO UPDATE SET
        quantity = user_flowers.quantity + 1
      `,
      [u.id, f.id]
    );

    const distinct = (await client.query(
      'SELECT COUNT(*)::int AS count FROM user_flowers WHERE user_id=$1 AND quantity>0',
      [u.id]
    )).rows[0].count;
    await setAchievementProgress(client, u.id, 'collector', distinct);
    if (f.is_special) await incrementAchievement(client, u.id, 'special_collector', 1);
    if (xpResult.leveledUp && xpResult.level >= 5) await setAchievementProgress(client, u.id, 'level_5', xpResult.level);

    await client.query('COMMIT');

    res.json({
      flower: f,
      reward: {
        coins: 5,
        xp: 5
      },
      level: xpResult.level,
      leveledUp: xpResult.leveledUp
    });

  } catch (e) {
    await client.query('ROLLBACK');

    console.error(e);

    res.status(500).json({
      error: e.message
    });

  } finally {
    client.release();
  }
});

export default router;