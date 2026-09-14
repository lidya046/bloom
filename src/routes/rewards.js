import { Router } from 'express';
import { pool } from '../db.js';
const router = Router();
router.post('/daily', async (req,res)=>{
  const client=await pool.connect();
  try{
    await client.query('BEGIN');
    const u=(await client.query('SELECT * FROM users WHERE id=$1 FOR UPDATE',[req.user.id])).rows[0];
    if(u.daily_reward_at && Date.now()-new Date(u.daily_reward_at).getTime()<24*60*60*1000){await client.query('ROLLBACK');return res.status(400).json({error:'Daily reward already claimed'});}
    await client.query('UPDATE users SET coins=coins+50,seeds=seeds+2,xp=xp+10,daily_reward_at=NOW() WHERE id=$1',[u.id]);
    await client.query('COMMIT');res.json({coins:50,seeds:2,xp:10});
  }catch(e){await client.query('ROLLBACK');res.status(500).json({error:e.message});}finally{client.release();}
});
export default router;
