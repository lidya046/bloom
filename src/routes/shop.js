import { Router } from 'express';
import { pool } from '../db.js';
import { notifyAdmins } from '../admin.js';
const router = Router();

router.get('/', async (_req, res) => {
  const r = await pool.query(`SELECT id,name,emoji,rarity,sell_value,is_special,shop_price,
    COALESCE(shop_price, CASE rarity WHEN 'common' THEN 15 WHEN 'rare' THEN 40 WHEN 'epic' THEN 100 WHEN 'legendary' THEN 500 END) AS price
    FROM flowers ORDER BY is_special DESC, id`);
  res.json(r.rows);
});

router.post('/buy', async (req, res) => {
  const flowerId = Number(req.body?.flowerId);
  const quantity = Math.max(1, Math.min(99, Number(req.body?.quantity || 1)));
  if (!Number.isInteger(flowerId)) return res.status(400).json({ error: 'Invalid flower' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const flower = (await client.query(`SELECT * FROM flowers WHERE id=$1`, [flowerId])).rows[0];
    if (!flower) throw new Error('Flower not found');

    // Special flowers use their explicit shop_price (5,000 / 7,500 / 12,000 / 25,000).
    const price = Number(flower.shop_price ?? ({ common: 15, rare: 40, epic: 100, legendary: 500 })[flower.rarity]);
    const u = (await client.query('SELECT * FROM users WHERE id=$1 FOR UPDATE', [req.user.id])).rows[0];
    const total = price * quantity;
    if (u.coins < total) throw new Error(`Coins tidak cukup. Butuh ${total} coins.`);

    await client.query('UPDATE users SET coins=coins-$1 WHERE id=$2', [total, u.id]);
    await client.query(`INSERT INTO user_flowers(user_id,flower_id,quantity) VALUES($1,$2,$3)
      ON CONFLICT(user_id,flower_id) DO UPDATE SET quantity=user_flowers.quantity+EXCLUDED.quantity`, [u.id, flowerId, quantity]);
    await client.query(`INSERT INTO shop_purchases(user_id,flower_id,quantity,price) VALUES($1,$2,$3,$4)`, [u.id, flowerId, quantity, price]);
    await client.query('COMMIT');

    const buyer = u.username ? `@${u.username}` : (u.first_name || `ID ${u.telegram_id}`);
    notifyAdmins(`🛒 PEMBELIAN BARU!\n\n👤 User: ${buyer}\n📦 Item: ${flower.emoji} ${flower.name}\n🔢 Jumlah: ${quantity}\n💰 Total: ${total} coins\n\n🕐 ${new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}`).catch(() => { });
    res.json({ flower, quantity, price, total });
  } catch (e) {
    await client.query('ROLLBACK'); res.status(400).json({ error: e.message });
  } finally { client.release(); }
});
export default router;
