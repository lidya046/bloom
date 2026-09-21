-- Bouquet reactions and replies. Run after schema.sql.
CREATE TABLE IF NOT EXISTS bouquet_interactions (
  bouquet_id UUID PRIMARY KEY REFERENCES bouquets(id) ON DELETE CASCADE,
  sender_telegram_id BIGINT NOT NULL REFERENCES users(telegram_id) ON DELETE CASCADE,
  receiver_telegram_id BIGINT NOT NULL REFERENCES users(telegram_id) ON DELETE CASCADE,
  reaction TEXT,
  message TEXT NOT NULL DEFAULT '',
  reply TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (reaction IS NULL OR reaction IN ('❤️','😍','🌸','🥹','😂','✨','😢','😭','😔','🤢','😒')),
  CHECK (char_length(message) <= 500),
  CHECK (char_length(reply) <= 500)
);

CREATE INDEX IF NOT EXISTS idx_bouquet_interactions_sender
  ON bouquet_interactions(sender_telegram_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_bouquet_interactions_receiver
  ON bouquet_interactions(receiver_telegram_id, updated_at DESC);
