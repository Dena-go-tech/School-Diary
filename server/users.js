// Пользователи: пароли (scrypt), роли admin/student, создание. Без привязки к HTTP — используется и скриптами
import crypto from 'node:crypto';
import { promisify } from 'node:util';
import { pool } from './db.js';
import { HttpError, check, str } from './http.js';

const scrypt = promisify(crypto.scrypt);
const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };
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

export const isPassword = (v) => typeof v === 'string' && v.length >= MIN_PASSWORD && v.length <= 200;

export const userRow = (r) => ({
  id: r.id, username: r.username, name: r.name, role: r.role, isGuest: r.is_guest, createdAt: r.created_at,
});

/* ---------- Создание пользователя (API и скрипт) ---------- */
export function validateNewUser({ username, name, password, role }) {
  check(typeof username === 'string' && USERNAME_RE.test(username), 'Логин: 3–32 символа, латиница, цифры, . _ -');
  check(str(name, 60), 'Укажите имя (до 60 символов)');
  check(isPassword(password), `Пароль: минимум ${MIN_PASSWORD} символов`);
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

// Не даём убрать последнего администратора — иначе управлять приложением станет некому
export async function ensureAnotherAdmin(userId) {
  const { rows } = await pool.query(
    `SELECT (SELECT role FROM users WHERE id = $1) AS role,
            (SELECT count(*)::int FROM users WHERE role = 'admin' AND id <> $1) AS others`,
    [userId],
  );
  if (rows[0].role === 'admin' && rows[0].others === 0) throw new HttpError(400, 'Должен остаться хотя бы один администратор');
}
