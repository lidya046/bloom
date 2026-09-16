CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  telegram_id BIGINT UNIQUE NOT NULL,
  username TEXT,
  first_name TEXT,
  coins INTEGER NOT NULL DEFAULT 100,
  seeds INTEGER NOT NULL DEFAULT 5,
  level INTEGER NOT NULL DEFAULT 1,
  xp INTEGER NOT NULL DEFAULT 0,
  daily_reward_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS flowers (
  id SERIAL PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  emoji TEXT NOT NULL,
  rarity TEXT NOT NULL CHECK (
    rarity IN ('common', 'rare', 'epic', 'legendary')
  ),
  sell_value INTEGER NOT NULL DEFAULT 5
);

CREATE TABLE IF NOT EXISTS user_flowers (
  user_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
  flower_id INTEGER REFERENCES flowers(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  PRIMARY KEY (user_id, flower_id)
);

CREATE TABLE IF NOT EXISTS bouquets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  receiver_telegram_id BIGINT,
  receiver_username TEXT,
  message TEXT NOT NULL DEFAULT '',
  wrapping TEXT NOT NULL DEFAULT 'paper',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bouquet_items (
  bouquet_id UUID REFERENCES bouquets(id) ON DELETE CASCADE,
  flower_id INTEGER REFERENCES flowers(id),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  PRIMARY KEY (bouquet_id, flower_id)
);

-- =========================
-- SHOP PURCHASES
-- =========================

CREATE TABLE IF NOT EXISTS shop_purchases (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  flower_id INTEGER NOT NULL REFERENCES flowers(id),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  price INTEGER NOT NULL CHECK (price >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =========================
-- FLOWER DATA
-- =========================

INSERT INTO flowers (name, emoji, rarity, sell_value) VALUES
('Daisy', '🌼', 'common', 5),
('Tulip', '🌷', 'common', 6),
('Sunflower', '🌻', 'common', 7),
('Rose', '🌹', 'rare', 12),
('Lavender', '🪻', 'rare', 14),
('Hibiscus', '🌺', 'rare', 15),
('Sakura', '🌸', 'epic', 25),
('Lotus', '🪷', 'epic', 28),
('Black Rose', '🥀', 'legendary', 60),
('Golden Flower', '🌟', 'legendary', 100)
ON CONFLICT (name) DO NOTHING;

-- =========================
-- USERNAME
-- =========================

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username_lower
ON users (LOWER(username))
WHERE username IS NOT NULL;