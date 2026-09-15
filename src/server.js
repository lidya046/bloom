import express from 'express';
import cors from 'cors';
import 'dotenv/config';
import { telegramAuth } from './authMiddleware.js';
import user from './routes/user.js';
import flowers from './routes/flowers.js';
import garden from './routes/garden.js';
import rewards from './routes/rewards.js';
import bouquets from './routes/bouquets.js';
import shop from './routes/shop.js';

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

app.get('/health', (_req, res) =>
  res.json({
    ok: true,
    service: 'bloom-backend',
    version: '0.1.0'
  })
);

app.use('/api', telegramAuth);
app.use('/api/user', user);
app.use('/api/flowers', flowers);
app.use('/api/garden', garden);
app.use('/api/rewards', rewards);
app.use('/api/bouquets', bouquets);
app.use('/api/shop', shop);

const port = Number(process.env.PORT || 3000);

app.listen(port, () =>
  console.log(`Bloom backend running on http://localhost:${port}`)
);