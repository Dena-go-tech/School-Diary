// Авторизация: пароли (scrypt), сессии в cookie, роли admin/student, управление пользователями
import crypto from 'node:crypto';
import { promisify } from 'node:util';
import express from 'express';
import { pool } from './db.js';
import { HttpError, check, str } from './http.js';

const scrypt = promisify(crypto.scrypt);
const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };
const COOKIE = 'diary_session';
const SESSION_DAYS = 60;
const SESSION_RENEW_DAYS = 30; // при входе в приложение продлеваем сессию, если осталось меньше
export const ROLES = ['admin', 'student'];
export const USERNAME_RE = /^[a-zA-Z0-9._-]{3,32}$/;
export const MIN_PASSWORD = 6;

/* ---------- Пароли ---------- */
export async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(password, salt, SCRYPT.keylen, SCRYPT);
  return ['scrypt', SCRYPT.N, SCRYPT.r, SCRYPT.p, salt.toString('base64'), key.toString('base64')].join('$');
}

export async function verifyPassword(password, stored) {
  const [algo, N, r, p, salt, hash] = String(stored).split('$');
  if (algo !== 'scrypt') return false;
  const expected = Buffer.from(hash, 'base64');
  const key = await scrypt(password, Buffer.from(salt, 'base64'), expected.length, { N: +N, r: +r, p: +p });
  return crypto.timingSafeEqual(key, expected);
}

// Хеш-пустышка: при неизвестном логине тратим столько же времени, сколько при проверке пароля
const DUMMY_HASH = hashPassword(crypto.randomBytes(16).toString('hex'));

/* ---------- Сессии ---------- */
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

function parseCookies(header = '') {
  const out = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

// Secure-cookie только по HTTPS (через Cloudflare), иначе вход по http://localhost не работал бы.
// req.secure учитывает X-Forwarded-Proto от cloudflared (см. trust proxy в app.js)
const isHttps = (req) => req.secure;

function setSessionCookie(req, res, token, maxAgeSec) {
  const parts = [`${COOKIE}=${token}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${maxAgeSec}`];
  if (isHttps(req)) parts.push('Secure');
  res.append('Set-Cookie', parts.join('; '));
}

export async function createSession(req, res, userId) {
  const token = crypto.randomBytes(32).toString('base64url');
  await pool.query(
    `INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, now() + make_interval(days => $3))`,
    [sha256(token), userId, SESSION_DAYS],
  );
  setSessionCookie(req, res, token, SESSION_DAYS * 86400);
}

const userRow = (r) => ({
  id: r.id, username: r.username, name: r.name, role: r.role, isGuest: r.is_guest, createdAt: r.created_at,
});

// Подставляет req.user (или null) по cookie сессии
export async function loadUser(req, res, next) {
  req.user = null;
  const token = parseCookies(req.headers.cookie)[COOKIE];
  if (token) {
    const { rows } = await pool.query(
      `SELECT u.*, s.token_hash, s.expires_at < now() + make_interval(days => $2) AS renew
       FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = $1 AND s.expires_at > now()`,
      [sha256(token), SESSION_RENEW_DAYS],
    );
    if (rows[0]) {
      req.user = userRow(rows[0]);
      if (rows[0].renew) {
        await pool.query(
          'UPDATE sessions SET expires_at = now() + make_interval(days => $2) WHERE token_hash = $1',
          [rows[0].token_hash, SESSION_DAYS],
        );
        setSessionCookie(req, res, token, SESSION_DAYS * 86400);
      }
    }
  }
  next();
}

export function requireUser(req, res, next) {
  if (!req.user) throw new HttpError(401, 'Нужно войти');
  next();
}

/* ---------- Гости ---------- */
const GUEST_NAME = 'Гость';
const GUESTS_PER_IP_PER_HOUR = 10;
const guestCreations = new Map(); // ip → [время создания гостя]

// Для действий ученика без входа: создаёт гостевой профиль и сессию (один раз на устройство)
export async function ensureUser(req, res, next) {
  if (req.user) return next();
  const ip = clientIp(req);
  const now = Date.now();
  const recent = (guestCreations.get(ip) || []).filter((t) => now - t < 3600_000);
  if (recent.length >= GUESTS_PER_IP_PER_HOUR) throw new HttpError(429, 'Слишком много новых гостей с этого адреса. Попробуйте позже');
  guestCreations.set(ip, [...recent, now]);

  const { rows } = await pool.query(
    `INSERT INTO users (username, name, password_hash, role, is_guest)
     VALUES ($1, $2, '!', 'student', TRUE) RETURNING *`,
    ['guest-' + crypto.randomBytes(6).toString('hex'), GUEST_NAME],
  );
  await createSession(req, res, rows[0].id);
  req.user = userRow(rows[0]);
  next();
}

export function requireAdmin(req, res, next) {
  if (!req.user) throw new HttpError(401, 'Нужно войти');
  if (req.user.role !== 'admin') throw new HttpError(403, 'Только для администратора');
  next();
}

/* ---------- Защита от перебора паролей ---------- */
const FAIL_WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILS = 8;
const fails = new Map(); // ключ (ip или логин) → [время неудачных попыток]

export function clientIp(req) {
  return req.get('cf-connecting-ip') || req.socket.remoteAddress || '';
}

function recentFails(key) {
  const now = Date.now();
  const list = (fails.get(key) || []).filter((t) => now - t < FAIL_WINDOW_MS);
  if (list.length) fails.set(key, list);
  else fails.delete(key);
  return list;
}

/* ---------- Создание пользователя (API и скрипт) ---------- */
export function validateNewUser({ username, name, password, role }) {
  check(typeof username === 'string' && USERNAME_RE.test(username), 'Логин: 3–32 символа, латиница, цифры, . _ -');
  check(str(name, 60), 'Укажите имя (до 60 символов)');
  check(typeof password === 'string' && password.length >= MIN_PASSWORD && password.length <= 200, `Пароль: минимум ${MIN_PASSWORD} символов`);
  check(ROLES.includes(role), 'Роль: admin или student');
}

export async function createUser({ username, name, password, role }) {
  validateNewUser({ username, name, password, role });
  try {
    const { rows } = await pool.query(
      'INSERT INTO users (username, name, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING *',
      [username, name.trim(), await hashPassword(password), role],
    );
    return userRow(rows[0]);
  } catch (e) {
    if (e.code === '23505') throw new HttpError(409, 'Такой логин уже занят');
    throw e;
  }
}

/* ---------- Маршруты ---------- */
export function authRoutes() {
  const r = express.Router();

  r.post('/auth/login', async (req, res) => {
    const { username, password } = req.body || {};
    check(typeof username === 'string' && typeof password === 'string', 'Введите логин и пароль');
    const keys = ['ip:' + clientIp(req), 'user:' + username.toLowerCase()];
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
    await createSession(req, res, user.id);
    res.json(userRow(user));
  });

  r.post('/auth/logout', async (req, res) => {
    const token = parseCookies(req.headers.cookie)[COOKIE];
    if (token) await pool.query('DELETE FROM sessions WHERE token_hash = $1', [sha256(token)]);
    setSessionCookie(req, res, '', 0);
    res.status(204).end();
  });

  r.get('/auth/me', (req, res) => res.json(req.user)); // null — не вошёл

  // Смена своего пароля; остальные сессии этого пользователя завершаются
  r.post('/auth/password', requireUser, async (req, res) => {
    const { current, password } = req.body || {};
    check(typeof password === 'string' && password.length >= MIN_PASSWORD && password.length <= 200, `Пароль: минимум ${MIN_PASSWORD} символов`);
    const { rows } = await pool.query('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
    if (!(await verifyPassword(String(current || ''), rows[0].password_hash))) throw new HttpError(400, 'Текущий пароль неверен');
    await pool.query('UPDATE users SET password_hash = $2 WHERE id = $1', [req.user.id, await hashPassword(password)]);
    const token = parseCookies(req.headers.cookie)[COOKIE];
    await pool.query('DELETE FROM sessions WHERE user_id = $1 AND token_hash <> $2', [req.user.id, sha256(token)]);
    res.status(204).end();
  });

  /* Пользователи — только админ */
  r.get('/users', requireAdmin, async (req, res) => {
    // Гостей не показываем — их может быть много; их запросы видны в списке запросов
    const { rows } = await pool.query('SELECT * FROM users WHERE NOT is_guest ORDER BY role, lower(name)');
    res.json(rows.map(userRow));
  });

  r.post('/users', requireAdmin, async (req, res) => {
    const { username, name, password, role = 'student' } = req.body || {};
    res.status(201).json(await createUser({ username: String(username || '').trim(), name, password, role }));
  });

  r.patch('/users/:id', requireAdmin, async (req, res) => {
    const id = Number(req.params.id);
    const { name, password, role } = req.body || {};
    check(name === undefined || str(name, 60), 'Имя');
    check(password === undefined || (typeof password === 'string' && password.length >= MIN_PASSWORD && password.length <= 200), `Пароль: минимум ${MIN_PASSWORD} символов`);
    check(role === undefined || ROLES.includes(role), 'Роль');
    if (role === 'student') await ensureAnotherAdmin(id);
    const hash = password === undefined ? null : await hashPassword(password);
    const { rows } = await pool.query(
      `UPDATE users SET name = coalesce($2, name), role = coalesce($3, role), password_hash = coalesce($4, password_hash)
       WHERE id = $1 RETURNING *`,
      [id, name?.trim(), role, hash],
    );
    if (!rows[0]) throw new HttpError(404, 'Пользователь не найден');
    // Сменили пароль — выкидываем пользователя со всех устройств
    if (hash && id !== req.user.id) await pool.query('DELETE FROM sessions WHERE user_id = $1', [id]);
    res.json(userRow(rows[0]));
  });

  r.delete('/users/:id', requireAdmin, async (req, res) => {
    const id = Number(req.params.id);
    check(id !== req.user.id, 'Нельзя удалить самого себя');
    await ensureAnotherAdmin(id);
    await pool.query('DELETE FROM users WHERE id = $1', [id]);
    res.status(204).end();
  });

  return r;
}

// Не даём убрать последнего администратора — иначе управлять приложением станет некому
async function ensureAnotherAdmin(userId) {
  const { rows } = await pool.query(
    `SELECT (SELECT role FROM users WHERE id = $1) AS role,
            (SELECT count(*)::int FROM users WHERE role = 'admin' AND id <> $1) AS others`,
    [userId],
  );
  if (rows[0].role === 'admin' && rows[0].others === 0) throw new HttpError(400, 'Должен остаться хотя бы один администратор');
}
