import { Router } from 'express';
import { pool } from '../db.js';
const router = Router();
router.get('/', async (req,res)=>{ const r=await pool.query('SELECT id,telegram_id,username,first_name,coins,seeds,level,xp,created_at FROM users WHERE id=$1',[req.user.id]); res.json(r.rows[0]); });
router.get('/collection', async (req,res)=>{ const r=await pool.query(`SELECT f.id,f.name,f.emoji,f.rarity,uf.quantity FROM user_flowers uf JOIN flowers f ON f.id=uf.flower_id WHERE uf.user_id=$1 AND uf.quantity>0 ORDER BY f.rarity,f.name`,[req.user.id]); res.json(r.rows); });
export default router;
