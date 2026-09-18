import { Router } from 'express';
import { pool } from '../db.js';
import { ACHIEVEMENTS } from '../achievements.js';

const router = Router();

async function claimAchievementMasterReward(userId) {
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        const achievementResult = await client.query(
            `SELECT COUNT(*)::int AS unlocked
             FROM user_achievements
             WHERE user_id = $1
               AND unlocked_at IS NOT NULL`,
            [userId]
        );

        const unlocked = Number(
            achievementResult.rows[0]?.unlocked || 0
        );

        if (unlocked < ACHIEVEMENTS.length) {
            await client.query('ROLLBACK');

            return {
                claimed: false,
                unlocked
            };
        }

        const userResult = await client.query(
            `SELECT achievement_master_reward_claimed
             FROM users
             WHERE id = $1
             FOR UPDATE`,
            [userId]
        );

        const user = userResult.rows[0];

        if (!user) {
            await client.query('ROLLBACK');
            return {
                claimed: false,
                unlocked
            };
        }

        if (user.achievement_master_reward_claimed) {
            await client.query('ROLLBACK');

            return {
                claimed: false,
                alreadyClaimed: true,
                unlocked
            };
        }

        await client.query(
            `UPDATE users
             SET coins = coins + 500,
                 seeds = seeds + 10,
                 achievement_master_reward_claimed = TRUE
             WHERE id = $1`,
            [userId]
        );

        await client.query('COMMIT');

        return {
            claimed: true,
            unlocked,
            coins: 500,
            seeds: 10
        };
    } catch (e) {
        await client.query('ROLLBACK');
        throw e;
    } finally {
        client.release();
    }
}

router.get('/', async (req, res) => {
    try {
        const user = (
            await pool.query(
                'SELECT level FROM users WHERE id=$1',
                [req.user.id]
            )
        ).rows[0];

        const distinct = Number(
            (
                await pool.query(
                    `SELECT COUNT(*)::int AS count
                     FROM user_flowers
                     WHERE user_id=$1
                       AND quantity>0`,
                    [req.user.id]
                )
            ).rows[0]?.count || 0
        );

        const special = Number(
            (
                await pool.query(
                    `SELECT COUNT(*)::int AS count
                     FROM user_flowers uf
                     JOIN flowers f ON f.id=uf.flower_id
                     WHERE uf.user_id=$1
                       AND uf.quantity>0
                       AND f.is_special=true`,
                    [req.user.id]
                )
            ).rows[0]?.count || 0
        );

        const sent = Number(
            (
                await pool.query(
                    `SELECT COUNT(*)::int AS count
                     FROM bouquets
                     WHERE sender_id=$1`,
                    [req.user.id]
                )
            ).rows[0]?.count || 0
        );

        const client = await pool.connect();

        try {
            const {
                setAchievementProgress
            } = await import('../achievements.js');

            if (distinct > 0) {
                await setAchievementProgress(
                    client,
                    req.user.id,
                    'first_bloom',
                    1
                );
            }

            await setAchievementProgress(
                client,
                req.user.id,
                'collector',
                distinct
            );

            await setAchievementProgress(
                client,
                req.user.id,
                'first_gift',
                sent
            );

            await setAchievementProgress(
                client,
                req.user.id,
                'bouquet_giver',
                sent
            );

            await setAchievementProgress(
                client,
                req.user.id,
                'bouquet_master',
                sent
            );

            await setAchievementProgress(
                client,
                req.user.id,
                'special_collector',
                special
            );

            await setAchievementProgress(
                client,
                req.user.id,
                'level_5',
                Number(user?.level || 1)
            );
        } finally {
            client.release();
        }

        const r = await pool.query(
            `SELECT achievement_key, progress, unlocked_at
             FROM user_achievements
             WHERE user_id=$1`,
            [req.user.id]
        );

        const map = new Map(
            r.rows.map(x => [x.achievement_key, x])
        );

        const achievements = ACHIEVEMENTS.map(a => ({
            ...a,
            progress: Number(
                map.get(a.key)?.progress || 0
            ),
            unlocked: Boolean(
                map.get(a.key)?.unlocked_at
            )
        }));

        const allUnlocked =
            achievements.length > 0 &&
            achievements.every(a => a.unlocked);

        let masterReward = {
            claimed: false,
            alreadyClaimed: false
        };

        if (allUnlocked) {
            masterReward =
                await claimAchievementMasterReward(req.user.id);
        }

        res.json({
            achievements,
            masterReward
        });
    } catch (e) {
        console.error('Achievement error:', e);

        res.status(500).json({
            error: e.message
        });
    }
});

export default router;