import { pool } from '@server/db.js';
import { HttpError, check, readJson } from '@server/http.js';
import { route } from '@server/route.js';
import { endOtherSessions } from '@server/session.js';
import { MIN_PASSWORD, hashPassword, isPassword, verifyPassword } from '@server/users.js';

// Смена своего пароля; остальные сессии этого пользователя завершаются
export const POST = route(async ({ request, user }) => {
  const { current, password } = await readJson(request);
  check(isPassword(password), `Пароль: минимум ${MIN_PASSWORD} символов`);
  const { rows } = await pool.query('SELECT password_hash FROM users WHERE id = $1', [user.id]);
  if (!(await verifyPassword(String(current || ''), rows[0].password_hash))) throw new HttpError(400, 'Текущий пароль неверен');
  await pool.query('UPDATE users SET password_hash = $2 WHERE id = $1', [user.id, await hashPassword(password)]);
  await endOtherSessions(user.id);
}, { access: 'user' });
