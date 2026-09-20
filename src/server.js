import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import cors from 'cors';
import 'dotenv/config';

import { telegramAuth } from './authMiddleware.js';

import user from './routes/user.js';
import flowers from './routes/flowers.js';
import garden from './routes/garden.js';
import rewards from './routes/rewards.js';
import bouquets from './routes/bouquets.js';
import shop from './routes/shop.js';
import admin from './routes/admin.js';
import coinOrders from './routes/coin-orders.js';
import achievements from './routes/achievements.js';
import transfers from './routes/transfers.js';

const app = express();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, '..', 'public');

app.use(cors());
app.use(express.json({ limit: '15mb' }));

app.use(express.static(publicDir));

app.get('/', (_req, res) => {
    res.sendFile(path.join(publicDir, 'index.html'));
});

app.get('/health', (_req, res) => {
    res.json({
        ok: true,
        service: 'bloom-backend',
        version: '0.1.0'
    });
});

// Semua endpoint coin-orders tetap menggunakan telegramAuth.
// Webhook Telegram akan dikecualikan langsung di authMiddleware.js.
app.use('/api', telegramAuth);

app.use('/api/user', user);
app.use('/api/flowers', flowers);
app.use('/api/garden', garden);
app.use('/api/rewards', rewards);
app.use('/api/bouquets', bouquets);
app.use('/api/shop', shop);
app.use('/api/admin', admin);
app.use('/api/coin-orders', coinOrders);
app.use('/api/achievements', achievements);
app.use('/api/transfers', transfers);

const port = Number(process.env.PORT || 3000);

app.listen(port, () => {
    console.log(`Bloom backend running on http://localhost:${port}`);
});