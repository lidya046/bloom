import { Router } from 'express';
import { pool } from '../db.js';
const router = Router();
router.post('/', async (req,res)=>{
  const { receiverTelegramId=null, receiverUsername=null, message='', wrapping='paper', items=[] }=req.body||{};
  if(!Array.isArray(items)||items.length===0)return res.status(400).json({error:'Bouquet needs at least one flower'});
  const client=await pool.connect();
  try{
    await client.query('BEGIN');
    const u=(await client.query('SELECT * FROM users WHERE id=$1 FOR UPDATE',[req.user.id])).rows[0];
    const cost=10;
    if(u.coins<cost){await client.query('ROLLBACK');return res.status(400).json({error:'Not enough coins'});}
    for(const item of items){
      const q=await client.query('SELECT quantity FROM user_flowers WHERE user_id=$1 AND flower_id=$2 FOR UPDATE',[u.id,item.flowerId]);
      if(!q.rows[0] || q.rows[0].quantity<item.quantity) throw new Error('Not enough flower quantity');
    }
    const b=(await client.query(`INSERT INTO bouquets(sender_id,receiver_telegram_id,receiver_username,message,wrapping) VALUES($1,$2,$3,$4,$5) RETURNING *`,[u.id,receiverTelegramId,receiverUsername,message,wrapping])).rows[0];
    for(const item of items){await client.query('UPDATE user_flowers SET quantity=quantity-$1 WHERE user_id=$2 AND flower_id=$3',[item.quantity,u.id,item.flowerId]);await client.query('INSERT INTO bouquet_items(bouquet_id,flower_id,quantity) VALUES($1,$2,$3)',[b.id,item.flowerId,item.quantity]);}
    await client.query('UPDATE users SET coins=coins-$1,xp=xp+15 WHERE id=$2',[cost,u.id]);
    await client.query('COMMIT');res.json({bouquet:b,cost,xp:15});
  }catch(e){await client.query('ROLLBACK');res.status(400).json({error:e.message});}finally{client.release();}
});
router.get('/sent',async(req,res)=>{const r=await pool.query(`SELECT b.*,json_agg(json_build_object('flowerId',bi.flower_id,'quantity',bi.quantity)) items FROM bouquets b JOIN bouquet_items bi ON bi.bouquet_id=b.id WHERE b.sender_id=$1 GROUP BY b.id ORDER BY b.created_at DESC`,[req.user.id]);res.json(r.rows);});
router.get('/received',async(req,res)=>{const r=await pool.query(`SELECT b.*,json_agg(json_build_object('flowerId',bi.flower_id,'quantity',bi.quantity)) items FROM bouquets b JOIN bouquet_items bi ON bi.bouquet_id=b.id WHERE b.receiver_telegram_id=$1 GROUP BY b.id ORDER BY b.created_at DESC`,[req.user.telegram_id]);res.json(r.rows);});
export default router;
