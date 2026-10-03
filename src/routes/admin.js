import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import multer from 'multer';
import { Router } from 'express';
import { pool } from '../db.js';
import { isAdminTelegramId, getAdminRole, getAdminStats } from '../admin.js';

const router = Router();
const BROADCAST_BATCH_SIZE = 20;
const BROADCAST_DELAY_MS = 250;
const MAX_AUDIO_BYTES = 15 * 1024 * 1024;
const AUDIO_EXTENSIONS = new Set(['.mp3', '.m4a', '.wav', '.ogg', '.aac']);
const AUDIO_MIME_TYPES = new Set([
    'audio/mpeg',
    'audio/mp3',
    'audio/mp4',
    'audio/x-m4a',
    'audio/aac',
    'audio/wav',
    'audio/wave',
    'audio/ogg',
    'audio/x-wav'
]);
const TEMP_UPLOAD_DIR = path.join(process.cwd(), 'storage', 'broadcast-temp');

await fs.mkdir(TEMP_UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
    destination: async (_req, _file, cb) => {
        try {
            await fs.mkdir(TEMP_UPLOAD_DIR, { recursive: true });
            cb(null, TEMP_UPLOAD_DIR);
        } catch (error) {
            cb(error);
        }
    },
    filename: (_req, file, cb) => {
        const ext = path.extname(file.originalname || '').toLowerCase() || '.bin';
        const safeName = `${Date.now()}-${crypto.randomUUID()}${ext}`;
        cb(null, safeName);
    }
});

const upload = multer({
    storage,
    limits: { fileSize: MAX_AUDIO_BYTES },
    fileFilter: (_req, file, cb) => {
        const mime = String(file.mimetype || '').toLowerCase();
        const ext = path.extname(file.originalname || '').toLowerCase();
        const isAllowed = AUDIO_MIME_TYPES.has(mime) || AUDIO_EXTENSIONS.has(ext);

        if (!isAllowed) {
            return cb(new Error('Format audio tidak didukung. Gunakan MP3, M4A, WAV, OGG, atau AAC.'));
        }

        cb(null, true);
    }
});

function requireAdmin(req, res, next) {
    if (!isAdminTelegramId(req.user?.telegram_id)) return res.status(403).json({ error: 'Admin only' });
    next();
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function sanitizeBroadcastMessage(rawValue) {
    return String(rawValue ?? '').replace(/\r\n/g, '\n').trim();
}

async function getEligibleBroadcastRecipients() {
    const result = await pool.query(`
        SELECT DISTINCT telegram_id
        FROM users
        WHERE telegram_id IS NOT NULL
          AND telegram_id <> 0
        ORDER BY telegram_id ASC
    `);

    return result.rows
        .map(row => Number(row.telegram_id))
        .filter(id => Number.isFinite(id) && id !== 0);
}

async function sendTelegramBroadcastMessage(chatId, text) {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token || !chatId) {
        return { ok: false, reason: 'missing_bot_token_or_chat_id' };
    }

    try {
        const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: chatId,
                text,
                disable_web_page_preview: true
            })
        });

        const data = await response.json().catch(() => ({}));

        if (!response.ok || !data.ok) {
            return {
                ok: false,
                reason: data.description || `telegram_http_${response.status || 'unknown'}`
            };
        }

        return { ok: true };
    } catch (error) {
        return { ok: false, reason: error?.message || 'telegram_request_failed' };
    }
}

async function sendTelegramAudio(chatId, filePath, mimeType, caption = '') {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token || !chatId || !filePath) {
        return { ok: false, reason: 'missing_bot_token_or_chat_id_or_file' };
    }

    try {
        const fileBuffer = await fs.readFile(filePath);
        const form = new FormData();
        form.append('chat_id', String(chatId));
        if (caption) form.append('caption', caption);
        form.append('audio', new Blob([fileBuffer], { type: mimeType || 'audio/mpeg' }), path.basename(filePath));

        const response = await fetch(`https://api.telegram.org/bot${token}/sendAudio`, {
            method: 'POST',
            body: form
        });

        const data = await response.json().catch(() => ({}));

        if (!response.ok || !data.ok) {
            return {
                ok: false,
                reason: data.description || `telegram_http_${response.status || 'unknown'}`
            };
        }

        return { ok: true, file_id: data.result?.audio?.file_id || data.result?.document?.file_id || null };
    } catch (error) {
        return { ok: false, reason: error?.message || 'telegram_audio_failed' };
    }
}

async function applyRoseRewardToRecipients(recipients, rewardKey) {
    const rose = await pool.query(`
        SELECT id, name
        FROM flowers
        WHERE LOWER(name) = 'rose'
        LIMIT 1
    `);

    if (!rose.rows[0]) {
        return { awarded: 0, skipped: recipients.length };
    }

    const roseId = rose.rows[0].id;
    let awarded = 0;

    for (const telegramId of recipients) {
        const user = await pool.query(
            `SELECT id, telegram_id
             FROM users
             WHERE telegram_id = $1
             LIMIT 1`,
            [telegramId]
        );

        if (!user.rows[0]) continue;

        const existing = await pool.query(
            `SELECT 1
             FROM broadcast_history
             WHERE reward_key = $1
             LIMIT 1`,
            [rewardKey]
        );

        if (existing.rows[0]) {
            return { awarded: 0, skipped: recipients.length };
        }

        await pool.query(
            `INSERT INTO user_flowers (user_id, flower_id, quantity)
             VALUES ($1, $2, 1)
             ON CONFLICT (user_id, flower_id)
             DO UPDATE SET quantity = user_flowers.quantity + 1`,
            [user.rows[0].id, roseId]
        );

        awarded += 1;
    }

    return { awarded, skipped: recipients.length - awarded };
}

async function processBroadcast(adminTelegramId, message, recipients, audioFilePath, mimeType, rewardRose, rewardKey) {
    let sent = 0;
    let failed = 0;
    let finalMessage = sanitizeBroadcastMessage(message);

    if (!finalMessage && !audioFilePath && !rewardRose) {
        return { total: recipients.length, sent, failed, rewarded: 0 };
    }

    if (!finalMessage && !audioFilePath && rewardRose) {
        finalMessage = '🌹 Rose × 1 telah ditambahkan ke inventory Bloom kamu!';
    }

    for (let index = 0; index < recipients.length; index += BROADCAST_BATCH_SIZE) {
        const batch = recipients.slice(index, index + BROADCAST_BATCH_SIZE);
        const results = await Promise.all(
            batch.map(async chatId => {
                if (audioFilePath) {
                    return sendTelegramAudio(chatId, audioFilePath, mimeType, finalMessage || '');
                }
                return sendTelegramBroadcastMessage(chatId, finalMessage || '');
            })
        );

        for (const result of results) {
            if (result.ok) sent += 1;
            else failed += 1;
        }

        if (index + BROADCAST_BATCH_SIZE < recipients.length) {
            await sleep(BROADCAST_DELAY_MS);
        }
    }

    let rewarded = 0;
    if (rewardRose) {
        const rewardResult = await applyRoseRewardToRecipients(recipients, rewardKey);
        rewarded = rewardResult.awarded;
    }

    await pool.query(
        `INSERT INTO broadcast_history (admin_id, message, total_recipients, successful_count, failed_count, reward_key)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [adminTelegramId, finalMessage || '', recipients.length, sent, failed, rewardKey || null]
    );

    return { total: recipients.length, sent, failed, rewarded };
}

router.get('/stats', requireAdmin, async (_req, res) => {
    try {
        const stats = await getAdminStats();
        const recent = await pool.query(`
      SELECT b.id, b.created_at, su.username AS sender_username, ru.username AS receiver_username, b.message
      FROM bouquets b
      JOIN users su ON su.id=b.sender_id
      LEFT JOIN users ru ON ru.telegram_id=b.receiver_telegram_id
      ORDER BY b.created_at DESC LIMIT 10
    `);
        res.json({ ...stats, recentBouquets: recent.rows });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.get('/me', requireAdmin, async (req, res) => {
    res.json({ isAdmin: true, role: getAdminRole(req.user.telegram_id) });
});

router.get('/broadcast/count', requireAdmin, async (_req, res) => {
    try {
        const recipients = await getEligibleBroadcastRecipients();
        res.json({ totalRecipients: recipients.length });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.post('/broadcast/preview', requireAdmin, async (req, res) => {
    const message = sanitizeBroadcastMessage(req.body?.message);

    if (message && message.length > 4096) {
        return res.status(400).json({ error: 'Pesan broadcast terlalu panjang. Maksimal 4096 karakter.' });
    }

    try {
        const recipients = await getEligibleBroadcastRecipients();
        const previewText = message || '🎵 Audio broadcast siap dikirim';
        res.json({
            totalRecipients: recipients.length,
            preview: previewText.length > 240 ? `${previewText.slice(0, 240)}...` : previewText
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.post('/broadcast', requireAdmin, upload.single('audio'), async (req, res) => {
    const message = sanitizeBroadcastMessage(req.body?.message);
    const rewardRose = String(req.body?.rewardRose ?? 'false').toLowerCase() === 'true' || req.body?.rewardRose === true || req.body?.rewardRose === '1';
    const rewardKey = String(req.body?.broadcastId || crypto.randomUUID());
    const audioFile = req.file;

    if (!message && !audioFile && !rewardRose) {
        return res.status(400).json({ error: 'Pesan atau audio wajib diisi' });
    }

    if (message && message.length > 4096) {
        return res.status(400).json({ error: 'Pesan broadcast terlalu panjang. Maksimal 4096 karakter.' });
    }

    if (audioFile && audioFile.size > MAX_AUDIO_BYTES) {
        await fs.rm(audioFile.path, { force: true }).catch(() => { });
        return res.status(400).json({ error: 'Ukuran audio terlalu besar. Maksimal 15 MB.' });
    }

    try {
        const recipients = await getEligibleBroadcastRecipients();

        if (!recipients.length) {
            await pool.query(
                `INSERT INTO broadcast_history (admin_id, message, total_recipients, successful_count, failed_count, reward_key)
                 VALUES ($1, $2, $3, $4, $5, $6)`,
                [req.user.telegram_id, message || '', 0, 0, 0, rewardKey]
            );

            if (audioFile?.path) {
                await fs.rm(audioFile.path, { force: true }).catch(() => { });
            }

            return res.json({
                ok: true,
                message: 'Broadcast completed.',
                sent: 0,
                failed: 0,
                total: 0,
                recipients: 0,
                rewarded: 0
            });
        }

        const result = await processBroadcast(
            req.user.telegram_id,
            message,
            recipients,
            audioFile?.path || null,
            audioFile?.mimetype || null,
            rewardRose,
            rewardKey
        );

        if (audioFile?.path) {
            await fs.rm(audioFile.path, { force: true }).catch(() => { });
        }

        res.json({
            ok: true,
            message: 'Broadcast completed.',
            sent: result.sent,
            failed: result.failed,
            total: result.total,
            recipients: result.total,
            rewarded: result.rewarded || 0
        });
    } catch (e) {
        if (audioFile?.path) {
            await fs.rm(audioFile.path, { force: true }).catch(() => { });
        }
        res.status(500).json({ error: e.message });
    }
});

router.get('/user', requireAdmin, async (req, res) => {
    const username = String(req.query.username || '').trim().replace(/^@/, '');
    if (!username) return res.status(400).json({ error: 'Username wajib diisi' });

    const r = await pool.query(
        `SELECT id, telegram_id, username, first_name, coins, seeds, level, xp
         FROM users
         WHERE LOWER(username)=LOWER($1)
         LIMIT 1`,
        [username]
    );

    if (!r.rows[0]) return res.status(404).json({ error: 'User tidak ditemukan' });
    res.json(r.rows[0]);
});

router.post('/balance', requireAdmin, async (req, res) => {
    const username = String(req.body.username || '').trim().replace(/^@/, '');
    const coinsDelta = Number(req.body.coinsDelta ?? 0);
    const seedsDelta = Number(req.body.seedsDelta ?? 0);

    if (!username) return res.status(400).json({ error: 'Username wajib diisi' });
    if (!Number.isInteger(coinsDelta) || !Number.isInteger(seedsDelta)) {
        return res.status(400).json({ error: 'Coins dan seeds harus berupa bilangan bulat' });
    }
    if (coinsDelta === 0 && seedsDelta === 0) {
        return res.status(400).json({ error: 'Isi jumlah coins atau seeds yang ingin diubah' });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const before = await client.query(
            `SELECT id, telegram_id, username, first_name, coins, seeds
             FROM users
             WHERE LOWER(username)=LOWER($1)
             FOR UPDATE`,
            [username]
        );

        if (!before.rows[0]) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'User tidak ditemukan' });
        }

        const u = before.rows[0];
        const newCoins = Number(u.coins) + coinsDelta;
        const newSeeds = Number(u.seeds) + seedsDelta;

        if (newCoins < 0 || newSeeds < 0) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'Saldo user tidak boleh menjadi negatif' });
        }

        const updated = await client.query(
            `UPDATE users
             SET coins=$1, seeds=$2
             WHERE id=$3
             RETURNING id, telegram_id, username, first_name, coins, seeds, level, xp`,
            [newCoins, newSeeds, u.id]
        );

        await client.query('COMMIT');

        console.log(
            `[ADMIN BALANCE] admin=${req.user.telegram_id} target=@${u.username} ` +
            `coins ${u.coins}->${newCoins}, seeds ${u.seeds}->${newSeeds}`
        );

        res.json({
            message: 'Balance berhasil diubah',
            before: { coins: Number(u.coins), seeds: Number(u.seeds) },
            user: updated.rows[0],
            delta: { coins: coinsDelta, seeds: seedsDelta }
        });
    } catch (e) {
        await client.query('ROLLBACK');
        res.status(500).json({ error: e.message });
    } finally {
        client.release();
    }
});

export default router;
