import { pool } from '@server/db.js';
import { HttpError, check, readJson, str } from '@server/http.js';
import { route } from '@server/route.js';
import { MIN_PASSWORD, ROLES, ensureAnotherAdmin, hashPassword, isPassword, userRow } from '@server/users.js';

export const PATCH = route(async ({ request, params, user }) => {
  const id = Number(params.id);
  const { name, password, role } = await readJson(request);
  check(name === undefined || str(name, 60), 'Имя');
  check(password === undefined || isPassword(password), `Пароль: минимум ${MIN_PASSWORD} символов`);
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
  if (hash && id !== user.id) await pool.query('DELETE FROM sessions WHERE user_id = $1', [id]);
  return Response.json(userRow(rows[0]));
}, { access: 'admin' });

export const DELETE = route(async ({ params, user }) => {
  const id = Number(params.id);
  check(id !== user.id, 'Нельзя удалить самого себя');
  await ensureAnotherAdmin(id);
  await pool.query('DELETE FROM users WHERE id = $1', [id]);
}, { access: 'admin' });
