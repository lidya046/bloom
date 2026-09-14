import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import 'dotenv/config';

import { telegramAuth } from './authMiddleware.js';
import user from './routes/user.js';
import flowers from './routes/flowers.js';
import garden from './routes/garden.js';
import rewards from './routes/rewards.js';
import bouquets from './routes/bouquets.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

app.use(cors());
app.use(express.json());

// Frontend Bloom
app.use(express.static(path.join(__dirname, '../public')));

app.get('/', (_req, res) => {
    res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Health check
app.get('/health', (_req, res) => {
    res.json({
        ok: true,
        service: 'bloom-backend',
        version: '0.1.0'
    });
});

// Telegram authentication untuk API
app.use('/api', telegramAuth);

app.use('/api/user', user);
app.use('/api/flowers', flowers);
app.use('/api/garden', garden);
app.use('/api/rewards', rewards);
app.use('/api/bouquets', bouquets);

const port = Number(process.env.PORT || 3000);

app.listen(port, () => {
    console.log(`Bloom backend running on http://localhost:${port}`);
});