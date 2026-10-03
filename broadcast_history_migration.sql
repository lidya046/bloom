CREATE TABLE IF NOT EXISTS broadcast_history (
  id BIGSERIAL PRIMARY KEY,
  admin_id BIGINT NOT NULL,
  message TEXT NOT NULL,
  total_recipients INTEGER NOT NULL DEFAULT 0,
  successful_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_broadcast_history_admin ON broadcast_history(admin_id, created_at DESC);
