// Сессии в cookie, гости, защита от перебора паролей. Работает только внутри запроса (next/headers)
import crypto from 'node:crypto';
import { cookies, headers } from 'next/headers';
import { pool } from './db.js';
import { HttpError, shared } from './http.js';
import { hashPassword, userRow, verifyPassword } from './users.js';

const COOKIE = 'diary_session';
const SESSION_DAYS = 60;
const SESSION_RENEW_DAYS = 30; // при входе в приложение продлеваем сессию, если осталось меньше

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

// Secure-cookie только по HTTPS (через Cloudflare), иначе вход по http://localhost не работал бы.
// cloudflared передаёт X-Forwarded-Proto: https
async function setSessionCookie(token, maxAge) {
  const secure = (await headers()).get('x-forwarded-proto') === 'https';
  (await cookies()).set(COOKIE, token, { path: '/', httpOnly: true, sameSite: 'lax', maxAge, secure });
}

export const sessionToken = async () => (await cookies()).get(COOKIE)?.value;

export async function createSession(userId) {
  const token = crypto.randomBytes(32).toString('base64url');
  await pool.query(
    `INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, now() + make_interval(days => $3))`,
    [sha256(token), userId, SESSION_DAYS],
  );
  await setSessionCookie(token, SESSION_DAYS * 86400);
}

export async function endSession() {
  const token = await sessionToken();
  if (token) await pool.query('DELETE FROM sessions WHERE token_hash = $1', [sha256(token)]);
  await setSessionCookie('', 0);
}

// Завершить все сессии пользователя, кроме текущей
export async function endOtherSessions(userId) {
  await pool.query('DELETE FROM sessions WHERE user_id = $1 AND token_hash <> $2', [userId, sha256((await sessionToken()) || '')]);
}

// Пользователь по cookie сессии (или null)
export async function loadUser() {
  const token = await sessionToken();
  if (!token) return null;
  const { rows } = await pool.query(
    `SELECT u.*, s.token_hash, s.expires_at < now() + make_interval(days => $2) AS renew
     FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = $1 AND s.expires_at > now()`,
    [sha256(token), SESSION_RENEW_DAYS],
  );
  if (!rows[0]) return null;
  if (rows[0].renew) {
    await pool.query(
      'UPDATE sessions SET expires_at = now() + make_interval(days => $2) WHERE token_hash = $1',
      [rows[0].token_hash, SESSION_DAYS],
    );
    await setSessionCookie(token, SESSION_DAYS * 86400);
  }
  return userRow(rows[0]);
}

export async function clientIp() {
  const h = await headers();
  return h.get('cf-connecting-ip') || h.get('x-forwarded-for')?.split(',')[0].trim() || '';
}

/* ---------- Гости ---------- */
const GUEST_NAME = 'Гость';
const GUESTS_PER_IP_PER_HOUR = 10;
const guestCreations = shared('diaryGuestCreations', () => new Map()); // ip → [время создания гостя]

// Для действий ученика без входа: создаёт гостевой профиль и сессию (один раз на устройство)
export async function ensureUser(ctx) {
  if (ctx.user) return;
  const ip = await clientIp();
  const now = Date.now();
  const recent = (guestCreations.get(ip) || []).filter((t) => now - t < 3600_000);
  if (recent.length >= GUESTS_PER_IP_PER_HOUR) throw new HttpError(429, 'Слишком много новых гостей с этого адреса. Попробуйте позже');
  guestCreations.set(ip, [...recent, now]);

  const { rows } = await pool.query(
    `INSERT INTO users (username, name, password_hash, role, is_guest)
     VALUES ($1, $2, '!', 'student', TRUE) RETURNING *`,
    ['guest-' + crypto.randomBytes(6).toString('hex'), GUEST_NAME],
  );
  await createSession(rows[0].id);
  ctx.user = userRow(rows[0]);
}

/* ---------- Вход с защитой от перебора паролей ---------- */
const FAIL_WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILS = 8;
const fails = shared('diaryLoginFails', () => new Map()); // ключ (ip или логин) → [время неудачных попыток]

// Хеш-пустышка: при неизвестном логине тратим столько же времени, сколько при проверке пароля
const DUMMY_HASH = hashPassword(crypto.randomBytes(16).toString('hex'));

function recentFails(key) {
  const now = Date.now();
  const list = (fails.get(key) || []).filter((t) => now - t < FAIL_WINDOW_MS);
  if (list.length) fails.set(key, list);
  else fails.delete(key);
  return list;
}

export async function login(username, password) {
  const keys = ['ip:' + (await clientIp()), 'user:' + username.toLowerCase()];
  if (keys.some((k) => recentFails(k).length >= MAX_FAILS)) {
    throw new HttpError(429, 'Слишком много попыток. Подождите 15 минут');
  }
  const { rows } = await pool.query('SELECT * FROM users WHERE lower(username) = lower($1)', [username.trim()]);
  const user = rows[0];
  let ok = false;
  if (user) ok = await verifyPassword(password, user.password_hash);
  else await verifyPassword(password, await DUMMY_HASH);
  if (!ok) {
    for (const k of keys) fails.set(k, [...recentFails(k), Date.now()]);
    throw new HttpError(401, 'Неверный логин или пароль');
  }
  keys.forEach((k) => fails.delete(k));
  await createSession(user.id);
  return userRow(user);
}
