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

Admin Telegram IDs use numeric Telegram user IDs. Keep the existing variable for
backward compatibility:

```env
ADMIN_TELEGRAM_IDS=OWNER_TELEGRAM_ID,STAFF_TELEGRAM_ID
```

When explicit role variables are needed, use:

```env
ADMIN_OWNER_TELEGRAM_ID=OWNER_TELEGRAM_ID
ADMIN_STAFF_TELEGRAM_IDS=STAFF_TELEGRAM_ID
```

If explicit role variables are omitted, the first ID in `ADMIN_TELEGRAM_IDS`
is the owner and the remaining IDs are staff admins. Staff admins can use the
existing admin panel, adjust user Coins/Seeds, and approve or reject Coin orders.

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
- POST `/api/bouquets/:bouquetId/interaction` with `{ "reaction": "❤️", "message": "..." }`
- POST `/api/transfers` with `{ "username": "@teman", "amount": 100 }`
- GET `/api/transfers`

For existing databases, run `coin_transfers_migration.sql` and
`bouquet_interactions_migration.sql` after `schema.sql`. If the interaction
table already exists, also run `bouquet_interactions_reactions_migration.sql`
to enable the expanded reaction set.

## Important

This is MVP backend code. Before production, add rate limiting, stricter CORS, input validation, logging, migrations, backups, and abuse protection.
