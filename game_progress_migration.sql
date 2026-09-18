-- Bloom: Achievement + Custom Bouquet support.
-- users.level/xp already exist in the current schema.
-- Run this once on the same PostgreSQL/Neon database used by Bloom.

CREATE TABLE IF NOT EXISTS user_achievements (
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  achievement_key TEXT NOT NULL,
  progress INTEGER NOT NULL DEFAULT 0 CHECK (progress >= 0),
  unlocked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, achievement_key)
);

ALTER TABLE bouquets ADD COLUMN IF NOT EXISTS ribbon TEXT NOT NULL DEFAULT '🎀';
ALTER TABLE bouquets ADD COLUMN IF NOT EXISTS decoration TEXT NOT NULL DEFAULT 'sparkle';

CREATE INDEX IF NOT EXISTS idx_user_achievements_user_id ON user_achievements(user_id);
