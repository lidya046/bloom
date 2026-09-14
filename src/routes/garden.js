import { Router } from 'express';
import { pool } from '../db.js';
const router = Router();
router.post('/plant', async (req,res)=>{
  const client=await pool.connect();
  try {
    await client.query('BEGIN');
    const u=(await client.query('SELECT * FROM users WHERE id=$1 FOR UPDATE',[req.user.id])).rows[0];
    if(u.seeds<1){ await client.query('ROLLBACK'); return res.status(400).json({error:'No seeds'}); }
    const roll=Math.random();
    const rarity=roll<0.01?'legendary':roll<0.10?'epic':roll<0.35?'rare':'common';
    const f=(await client.query('SELECT * FROM flowers WHERE rarity=$1 ORDER BY random() LIMIT 1',[rarity])).rows[0];
    await client.query('UPDATE users SET seeds=seeds-1, coins=coins+5, xp=xp+5 WHERE id=$1',[u.id]);
    await client.query(`INSERT INTO user_flowers(user_id,flower_id,quantity) VALUES($1,$2,1) ON CONFLICT(user_id,flower_id) DO UPDATE SET quantity=user_flowers.quantity+1`,[u.id,f.id]);
    await client.query('COMMIT'); res.json({flower:f,reward:{coins:5,xp:5}});
  } catch(e){await client.query('ROLLBACK');res.status(500).json({error:e.message});} finally{client.release();}
});
export default router;
