import pg from 'pg';
import 'dotenv/config';

const { Pool } = pg;

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export async function ensureBroadcastHistoryRewardKey() {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS broadcast_history (
            id BIGSERIAL PRIMARY KEY,
            admin_id BIGINT NOT NULL,
            message TEXT NOT NULL,
            total_recipients INTEGER NOT NULL DEFAULT 0,
            successful_count INTEGER NOT NULL DEFAULT 0,
            failed_count INTEGER NOT NULL DEFAULT 0,
            reward_key TEXT,
            sent_message_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
            deleted_at TIMESTAMPTZ,
            deleted_count INTEGER NOT NULL DEFAULT 0,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    `);

    await pool.query(`
        ALTER TABLE IF EXISTS broadcast_history
        ADD COLUMN IF NOT EXISTS reward_key TEXT
    `);
    await pool.query(`
        ALTER TABLE IF EXISTS broadcast_history
        ADD COLUMN IF NOT EXISTS sent_message_ids JSONB NOT NULL DEFAULT '[]'::jsonb
    `);
    await pool.query(`
        ALTER TABLE IF EXISTS broadcast_history
        ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ
    `);
    await pool.query(`
        ALTER TABLE IF EXISTS broadcast_history
        ADD COLUMN IF NOT EXISTS deleted_count INTEGER NOT NULL DEFAULT 0
    `);

    await pool.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_broadcast_history_reward_key
        ON broadcast_history (reward_key)
        WHERE reward_key IS NOT NULL
    `);
}
