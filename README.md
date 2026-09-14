# Bloom Backend V0.1

Node.js + Express + PostgreSQL backend for the Bloom Telegram Mini App.

## 1. Install

```bash
npm install
```

## 2. Configure

Copy `.env.example` to `.env` and fill in:
- DATABASE_URL
- TELEGRAM_BOT_TOKEN (the token from BotFather; NEVER put this in frontend code)

## 3. Database

Create a PostgreSQL database named `bloom`, then run `schema.sql`.

Example:
```bash
psql "$DATABASE_URL" -f schema.sql
```

## 4. Run

```bash
npm run dev
```

Health check:
`GET http://localhost:3000/health`

## API

All `/api/*` endpoints require the Telegram Mini App initData in:
`Authorization: tma <initData>`

- GET `/api/user`
- GET `/api/user/collection`
- GET `/api/flowers`
- POST `/api/garden/plant`
- POST `/api/rewards/daily`
- POST `/api/bouquets`
- GET `/api/bouquets/sent`
- GET `/api/bouquets/received`

## Important

This is MVP backend code. Before production, add rate limiting, stricter CORS, input validation, logging, migrations, backups, and abuse protection.
