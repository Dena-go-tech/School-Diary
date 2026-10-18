import { pool } from '@server/db.js';
import { canEdit, canSee } from '@server/homework.js';
import { HttpError } from '@server/http.js';
import { route } from '@server/route.js';

export const GET = route(async ({ params, user }) => {
  const { rows } = await pool.query(
    `SELECT p.mime, p.data, h.status, h.created_by
     FROM homework_photos p JOIN homework h ON h.id = p.homework_id WHERE p.id = $1`,
    [params.id],
  );
  if (!rows[0] || !canSee(user, rows[0])) throw new HttpError(404, 'photo not found');
  // id фото не меняется, поэтому кешируем навсегда (private — только в браузере пользователя)
  return new Response(rows[0].data, {
    headers: { 'Content-Type': rows[0].mime, 'Cache-Control': 'private, max-age=31536000, immutable' },
  });
});

export const DELETE = route(async ({ params, user }) => {
  const { rows } = await pool.query(
    `SELECT h.status, h.created_by FROM homework_photos p JOIN homework h ON h.id = p.homework_id WHERE p.id = $1`,
    [params.id],
  );
  if (rows[0]) {
    if (!canEdit(user, rows[0])) throw new HttpError(403, 'Нет прав на изменение этого ДЗ');
    await pool.query('DELETE FROM homework_photos WHERE id = $1', [params.id]);
  }
}, { access: 'user' });
