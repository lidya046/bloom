export function levelForXp(xp) {
    return Math.max(1, Math.floor(Math.max(0, Number(xp || 0)) / 100) + 1);
}

export async function addXp(client, userId, amount) {
    const xpAmount = Math.max(0, Math.floor(Number(amount || 0)));
    const current = (await client.query('SELECT xp, level FROM users WHERE id=$1 FOR UPDATE', [userId])).rows[0];
    if (!current) throw new Error('User not found');
    const oldLevel = Math.max(1, Number(current.level || 1));
    const newXp = Math.max(0, Number(current.xp || 0) + xpAmount);
    const newLevel = levelForXp(newXp);
    await client.query('UPDATE users SET xp=$1, level=$2 WHERE id=$3', [newXp, newLevel, userId]);
    return { xp: newXp, level: newLevel, oldLevel, leveledUp: newLevel > oldLevel };
}
