import { Router } from 'express';
import { pool } from '../db.js';
import { isAdminTelegramId } from '../admin.js';

const router = Router();

function getPackages() {
    try {
        const parsed = JSON.parse(process.env.COIN_PACKAGES_JSON || '[]');
        if (!Array.isArray(parsed)) return [];
        return parsed
            .map((p, i) => ({
                id: String(p.id ?? `coins_${i + 1}`),
                coins: Number(p.coins),
                price: Number(p.price)
            }))
            .filter(p => p.id && Number.isInteger(p.coins) && p.coins > 0 && Number.isInteger(p.price) && p.price >= 0);
    } catch (_) {
        return [];
    }
}

function formatRupiah(value) {
    return `Rp${Number(value).toLocaleString('id-ID')}`;
}

function makeOrderCode(id, createdAt = new Date()) {
    const d = new Date(createdAt);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `BLM-${yyyy}${mm}${dd}-${String(id).padStart(6, '0')}`;
}

async function sendTelegram(chatId, text) {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token || !chatId) return false;
    try {
        const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: chatId, text })
        });
        const data = await r.json().catch(() => ({}));
        return Boolean(r.ok && data.ok);
    } catch (_) {
        return false;
    }
}

async function answerCallback(callbackQueryId, text) {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token || !callbackQueryId) return;
    try {
        await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ callback_query_id: callbackQueryId, text })
        });
    } catch (_) { }
}

/*
 * Pesan order awal dikirim sebagai foto bukti pembayaran.
 * Setelah Approve/Reject:
 * 1. Hapus pesan foto + tombol Approve/Reject.
 * 2. Kirim pesan hasil ke chat Telegram yang sama.
 */
async function replaceTelegramOrderMessage(chatId, messageId, text) {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token || !chatId || !messageId) return false;

    try {
        const deleteResponse = await fetch(`https://api.telegram.org/bot${token}/deleteMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: chatId,
                message_id: messageId
            })
        });

        const deleteData = await deleteResponse.json().catch(() => ({}));

        if (!deleteResponse.ok || !deleteData.ok) {
            return false;
        }

        const sendResponse = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: chatId,
                text
            })
        });

        const sendData = await sendResponse.json().catch(() => ({}));

        return Boolean(sendResponse.ok && sendData.ok);
    } catch (_) {
        return false;
    }
}

function webhookAuthorized(req) {
    const expected = String(process.env.TELEGRAM_WEBHOOK_SECRET || '').trim();
    if (!expected || expected === '.') return true;
    return req.headers['x-telegram-bot-api-secret-token'] === expected;
}

router.get('/config', async (_req, res) => {
    res.json({
        payment: {
            method: process.env.COIN_PAYMENT_BANK || '',
            name: process.env.COIN_PAYMENT_NAME || '',
            account: process.env.COIN_PAYMENT_ACCOUNT || '',
            note: process.env.COIN_PAYMENT_NOTE || ''
        },
        packages: getPackages()
    });
});

router.get('/latest', async (req, res) => {
    const r = await pool.query(`
        SELECT id, order_code, package_id, coins, price, status, created_at, updated_at
        FROM coin_orders
        WHERE user_id=$1
        ORDER BY id DESC
        LIMIT 1
    `, [req.user.id]);

    res.json(r.rows[0] || null);
});

router.post('/', async (req, res) => {
    const packageId = String(req.body?.packageId || '').trim();
    const proofImage = String(req.body?.proofImage || '').trim();

    if (!proofImage.startsWith('data:image/')) {
        return res.status(400).json({ error: 'Bukti pembayaran wajib diupload' });
    }

    if (proofImage.length > 12 * 1024 * 1024) {
        return res.status(400).json({ error: 'Bukti pembayaran terlalu besar' });
    }

    const packages = getPackages();
    const pkg = packages.find(p => p.id === packageId);

    if (!pkg) {
        return res.status(400).json({ error: 'Paket coins tidak ditemukan' });
    }

    const pending = await pool.query(`
        SELECT id, order_code, package_id, coins, price, status, created_at, updated_at
        FROM coin_orders
        WHERE user_id=$1 AND status='pending'
        ORDER BY id DESC LIMIT 1
    `, [req.user.id]);

    if (pending.rows[0]) {
        return res.json({
            order: pending.rows[0],
            existing: true
        });
    }

    const inserted = await pool.query(`
        INSERT INTO coin_orders (
            user_id,
            telegram_id,
            username,
            first_name,
            package_id,
            coins,
            price,
            status
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,'pending')
        RETURNING id, order_code, package_id, coins, price, status, created_at, updated_at
    `, [
        req.user.id,
        req.user.telegram_id,
        req.user.username || null,
        req.user.first_name || null,
        pkg.id,
        pkg.coins,
        pkg.price
    ]);

    const order = inserted.rows[0];

    order.order_code = makeOrderCode(order.id, order.created_at);

    await pool.query(
        `UPDATE coin_orders SET order_code=$1 WHERE id=$2`,
        [order.order_code, order.id]
    );

    const buyer = req.user.username
        ? `@${req.user.username}`
        : (req.user.first_name || `ID ${req.user.telegram_id}`);

    const text = [
        '💰 PEMBELIAN COINS BARU',
        '',
        `👤 User: ${buyer}`,
        `🆔 Telegram ID: ${req.user.telegram_id}`,
        `📦 Paket: ${pkg.coins.toLocaleString('id-ID')} Coins`,
        `💵 Harga: ${formatRupiah(pkg.price)}`,
        `🧾 Order: ${order.order_code}`,
        '⏳ Status: Menunggu pengecekan admin',
        '',
        '📸 User sudah mengirim bukti pembayaran. Silakan cek bukti dan pembayaran sebelum approve.'
    ].join('\n');

    const token = process.env.TELEGRAM_BOT_TOKEN;

    const adminIds = String(process.env.ADMIN_TELEGRAM_IDS || '')
        .split(',')
        .map(x => x.trim())
        .filter(Boolean);

    let notified = 0;

    if (token && adminIds.length) {
        const comma = proofImage.indexOf(',');
        const meta = comma >= 0 ? proofImage.slice(0, comma) : '';
        const base64 = comma >= 0 ? proofImage.slice(comma + 1) : '';

        const mime =
            (meta.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64$/) || [])[1]
            || 'image/jpeg';

        const proofBuffer = Buffer.from(base64, 'base64');

        for (const chatId of adminIds) {
            try {
                const form = new FormData();

                form.append(
                    'chat_id',
                    String(chatId)
                );

                form.append(
                    'photo',
                    new Blob([proofBuffer], { type: mime }),
                    'bukti-pembayaran.jpg'
                );

                form.append(
                    'caption',
                    text
                );

                form.append(
                    'reply_markup',
                    JSON.stringify({
                        inline_keyboard: [[
                            {
                                text: '✅ Approve',
                                callback_data: `coin:approve:${order.id}`
                            },
                            {
                                text: '❌ Reject',
                                callback_data: `coin:reject:${order.id}`
                            }
                        ]]
                    })
                );

                const r = await fetch(
                    `https://api.telegram.org/bot${token}/sendPhoto`,
                    {
                        method: 'POST',
                        body: form
                    }
                );

                const data = await r.json().catch(() => ({}));

                if (r.ok && data.ok) {
                    notified++;
                }
            } catch (_) { }
        }
    }

    res.json({
        order: {
            ...order,
            order_code: order.order_code
        },
        notified
    });
});

router.post('/telegram', async (req, res) => {
    if (!webhookAuthorized(req)) {
        return res.status(401).json({
            error: 'Unauthorized webhook'
        });
    }

    const cq = req.body?.callback_query;

    if (!cq?.data?.startsWith('coin:')) {
        return res.json({ ok: true });
    }

    const parts = String(cq.data).split(':');
    const action = parts[1];
    const orderId = Number(parts[2]);

    if (
        !['approve', 'reject'].includes(action)
        || !Number.isInteger(orderId)
    ) {
        await answerCallback(
            cq.id,
            'Data order tidak valid'
        );

        return res.json({ ok: true });
    }

    if (!isAdminTelegramId(cq.from?.id)) {
        await answerCallback(
            cq.id,
            'Akses admin ditolak'
        );

        return res.json({ ok: true });
    }

    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        const r = await client.query(
            `SELECT * FROM coin_orders WHERE id=$1 FOR UPDATE`,
            [orderId]
        );

        const order = r.rows[0];

        if (!order) {
            await client.query('ROLLBACK');

            await answerCallback(
                cq.id,
                'Order tidak ditemukan'
            );

            return res.json({ ok: true });
        }

        if (order.status !== 'pending') {
            await client.query('ROLLBACK');

            await answerCallback(
                cq.id,
                `Order sudah ${order.status}`
            );

            return res.json({ ok: true });
        }

        if (action === 'approve') {
            await client.query(
                `UPDATE users SET coins=coins+$1 WHERE id=$2`,
                [order.coins, order.user_id]
            );
        }

        const updated = await client.query(`
            UPDATE coin_orders
            SET
                status=$1,
                reviewed_by=$2,
                reviewed_at=NOW(),
                updated_at=NOW()
            WHERE id=$3
            RETURNING *
        `, [
            action === 'approve'
                ? 'approved'
                : 'rejected',
            cq.from.id,
            order.id
        ]);

        await client.query('COMMIT');

        const result = updated.rows[0];

        const statusText =
            action === 'approve'
                ? 'DISETUJUI ✅'
                : 'DITOLAK ❌';

        const adminText = [
            '💰 PEMBELIAN COINS',
            '',
            `🧾 Order: ${order.order_code}`,
            `👤 User: ${order.username
                ? `@${order.username}`
                : (order.first_name || `ID ${order.telegram_id}`)
            }`,
            `📦 Paket: ${Number(order.coins).toLocaleString('id-ID')} Coins`,
            `💵 Harga: ${formatRupiah(order.price)}`,
            `📌 Status: ${statusText}`,
            `👮 Admin: ${cq.from.username
                ? `@${cq.from.username}`
                : cq.from.id
            }`
        ].join('\n');

        // Ganti pesan foto + tombol menjadi hasil Approve/Reject
        await replaceTelegramOrderMessage(
            cq.message?.chat?.id,
            cq.message?.message_id,
            adminText
        );

        await answerCallback(
            cq.id,
            action === 'approve'
                ? 'Coins berhasil ditambahkan'
                : 'Order ditolak'
        );

        if (action === 'approve') {
            await sendTelegram(
                order.telegram_id,
                `🌷 Pembelian Coins berhasil!\n\n🧾 Order: ${order.order_code}\n🪙 +${Number(order.coins).toLocaleString('id-ID')} Coins sudah masuk ke akun Bloom.`
            );
        } else {
            await sendTelegram(
                order.telegram_id,
                `🌷 Order Coins kamu ditolak.\n\n🧾 Order: ${order.order_code}\nSilakan hubungi admin Bloom jika kamu merasa sudah melakukan pembayaran.`
            );
        }

        return res.json({
            ok: true,
            status: result.status
        });

    } catch (e) {
        await client.query('ROLLBACK');

        await answerCallback(
            cq.id,
            'Terjadi error saat memproses order'
        );

        return res.status(500).json({
            error: e.message
        });

    } finally {
        client.release();
    }
});

export default router;