import express from 'express';
import cors from 'cors';
import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { telegramAuth } from './authMiddleware.js';

import user from './routes/user.js';
import flowers from './routes/flowers.js';
import garden from './routes/garden.js';
import rewards from './routes/rewards.js';
import bouquets from './routes/bouquets.js';
import shop from './routes/shop.js';

const app = express();

/*
 * ---------------------------------------------------------
 * PATH CONFIGURATION
 * ---------------------------------------------------------
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const publicDir = path.join(__dirname, '..', 'public');

/*
 * ---------------------------------------------------------
 * MIDDLEWARE
 * ---------------------------------------------------------
 */

app.use(cors());
app.use(express.json());

/*
 * ---------------------------------------------------------
 * FRONTEND
 * ---------------------------------------------------------
 */

app.use(express.static(publicDir));

app.get('/', (_req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

/*
 * ---------------------------------------------------------
 * HEALTH CHECK
 * ---------------------------------------------------------
 */

app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'bloom-backend',
    version: '0.1.0'
  });
});

/*
 * ---------------------------------------------------------
 * TELEGRAM AUTH
 * ---------------------------------------------------------
 */

app.use('/api', telegramAuth);

/*
 * ---------------------------------------------------------
 * API ROUTES
 * ---------------------------------------------------------
 */

app.use('/api/user', user);

app.use('/api/flowers', flowers);

app.use('/api/garden', garden);

app.use('/api/rewards', rewards);

app.use('/api/bouquets', bouquets);

app.use('/api/shop', shop);

/*
 * ---------------------------------------------------------
 * API 404
 * ---------------------------------------------------------
 */

app.use('/api', (_req, res) => {
  res.status(404).json({
    error: 'API endpoint not found'
  });
});

/*
 * ---------------------------------------------------------
 * SERVER
 * ---------------------------------------------------------
 */

const port = Number(process.env.PORT || 3000);

app.listen(port, () => {
  console.log(`Bloom backend running on http://localhost:${port}`);
});