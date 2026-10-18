import { pool } from '@server/db.js';
import { readJson } from '@server/http.js';
import { route } from '@server/route.js';
import { createUser, userRow } from '@server/users.js';

// Гостей не показываем — их может быть много; их запросы видны в списке запросов
export const GET = route(async () => {
  const { rows } = await pool.query('SELECT * FROM users WHERE NOT is_guest ORDER BY role, lower(name)');
  return Response.json(rows.map(userRow));
}, { access: 'admin' });

export const POST = route(async ({ request }) => {
  const { username, name, password, role = 'student' } = await readJson(request);
  const user = await createUser({ username: String(username || '').trim(), name, password, role });
  return Response.json(user, { status: 201 });
}, { access: 'admin' });
