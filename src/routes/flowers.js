import { Router } from 'express';
import { pool } from '../db.js';
const router = Router();
router.get('/', async (_req,res)=>{ const r=await pool.query('SELECT * FROM flowers ORDER BY id'); res.json(r.rows); });
export default router;
