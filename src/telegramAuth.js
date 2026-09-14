import crypto from 'crypto';

export function validateTelegramInitData(initData, botToken, maxAgeSeconds = 86400) {
  if (!initData || !botToken) throw new Error('Missing Telegram initData or bot token');
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) throw new Error('Missing Telegram hash');
  const authDate = Number(params.get('auth_date'));
  if (!authDate || Math.floor(Date.now() / 1000) - authDate > maxAgeSeconds) throw new Error('Telegram initData expired');

  const pairs = [];
  for (const [key, value] of params.entries()) if (key !== 'hash') pairs.push(`${key}=${value}`);
  pairs.sort();
  const dataCheckString = pairs.join('\n');
  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const calculated = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
  if (!crypto.timingSafeEqual(Buffer.from(calculated), Buffer.from(hash))) throw new Error('Invalid Telegram initData');

  const userRaw = params.get('user');
  if (!userRaw) throw new Error('Telegram user missing');
  return JSON.parse(userRaw);
}
