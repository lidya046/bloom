-- Coin transfers between Bloom users.
CREATE TABLE IF NOT EXISTS coin_transfers (
  id BIGSERIAL PRIMARY KEY,
  sender_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  receiver_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL CHECK (amount > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (sender_id <> receiver_id)
);

CREATE INDEX IF NOT EXISTS idx_coin_transfers_sender ON coin_transfers(sender_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_coin_transfers_receiver ON coin_transfers(receiver_id, created_at DESC);