-- Bloom manual Coins top-up orders
CREATE TABLE IF NOT EXISTS coin_orders (
  id BIGSERIAL PRIMARY KEY,
  order_code TEXT UNIQUE,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  telegram_id BIGINT NOT NULL,
  username TEXT,
  first_name TEXT,
  package_id TEXT NOT NULL,
  coins INTEGER NOT NULL CHECK (coins > 0),
  price INTEGER NOT NULL CHECK (price >= 0),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  reviewed_by BIGINT,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_coin_orders_user_id ON coin_orders(user_id);
CREATE INDEX IF NOT EXISTS idx_coin_orders_status ON coin_orders(status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_coin_orders_one_pending_per_user
  ON coin_orders(user_id) WHERE status='pending';
