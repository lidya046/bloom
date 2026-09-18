export const ACHIEVEMENTS = [
    {
        key: 'first_bloom',
        icon: '🌱',
        name: 'First Bloom',
        description: 'Dapatkan bunga pertamamu dari Garden.',
        target: 1
    },
    {
        key: 'collector',
        icon: '📚',
        name: 'Flower Collector',
        description: 'Kumpulkan 5 jenis bunga berbeda.',
        target: 5
    },
    {
        key: 'first_gift',
        icon: '💌',
        name: 'First Gift',
        description: 'Kirim bouquet pertamamu.',
        target: 1
    },
    {
        key: 'bouquet_giver',
        icon: '💐',
        name: 'Bouquet Giver',
        description: 'Kirim 5 bouquet ke teman.',
        target: 5
    },
    {
        key: 'bouquet_master',
        icon: '🎀',
        name: 'Bouquet Master',
        description: 'Kirim 10 bouquet ke teman.',
        target: 10
    },
    {
        key: 'special_collector',
        icon: '✨',
        name: 'Special Collector',
        description: 'Miliki 1 bunga special.',
        target: 1
    },
    {
        key: 'level_5',
        icon: '🌟',
        name: 'Blooming Up',
        description: 'Capai Player Level 5.',
        target: 5
    }
];

export async function incrementAchievement(
    client,
    userId,
    key,
    amount = 1
) {
    const def = ACHIEVEMENTS.find(a => a.key === key);
    if (!def) return null;

    const increment = Math.max(0, Number(amount || 0));
    const target = Number(def.target);

    const row = (
        await client.query(
            `INSERT INTO user_achievements(
                user_id,
                achievement_key,
                progress
            )
            VALUES(
                $1,
                $2,
                LEAST($3::integer, $4::integer)
            )
            ON CONFLICT(user_id, achievement_key)
            DO UPDATE SET
                progress = LEAST(
                    user_achievements.progress + $3::integer,
                    $4::integer
                )
            RETURNING *`,
            [
                userId,
                key,
                increment,
                target
            ]
        )
    ).rows[0];

    if (
        Number(row.progress) >= target &&
        !row.unlocked_at
    ) {
        return (
            await client.query(
                `UPDATE user_achievements
                 SET unlocked_at = NOW()
                 WHERE user_id = $1
                   AND achievement_key = $2
                   AND unlocked_at IS NULL
                 RETURNING *`,
                [
                    userId,
                    key
                ]
            )
        ).rows[0] || row;
    }

    return row;
}

export async function setAchievementProgress(
    client,
    userId,
    key,
    progress
) {
    const def = ACHIEVEMENTS.find(a => a.key === key);
    if (!def) return null;

    const target = Number(def.target);

    const value = Math.max(
        0,
        Math.min(
            target,
            Number(progress || 0)
        )
    );

    return (
        await client.query(
            `INSERT INTO user_achievements(
                user_id,
                achievement_key,
                progress,
                unlocked_at
            )
            VALUES(
                $1,
                $2,
                $3::integer,
                CASE
                    WHEN $3::integer >= $4::integer
                    THEN NOW()
                    ELSE NULL
                END
            )
            ON CONFLICT(user_id, achievement_key)
            DO UPDATE SET
                progress = $3::integer,
                unlocked_at = COALESCE(
                    user_achievements.unlocked_at,
                    CASE
                        WHEN $3::integer >= $4::integer
                        THEN NOW()
                        ELSE NULL
                    END
                )
            RETURNING *`,
            [
                userId,
                key,
                value,
                target
            ]
        )
    ).rows[0];
}