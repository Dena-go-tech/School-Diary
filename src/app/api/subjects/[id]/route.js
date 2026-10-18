import { pool } from '@server/db.js';
import { COLOR_RE, subjectRow } from '@server/homework.js';
import { HttpError, check, readJson, str } from '@server/http.js';
import { route } from '@server/route.js';

export const PATCH = route(async ({ request, params }) => {
  const { name, color, deleted } = await readJson(request);
  check(name === undefined || str(name, 40), 'name');
  check(color === undefined || COLOR_RE.test(color), 'color');
  check(deleted === undefined || typeof deleted === 'boolean', 'deleted');
  const { rows } = await pool.query(
    `UPDATE subjects SET name = coalesce($2, name), color = coalesce($3, color), deleted = coalesce($4, deleted)
     WHERE id = $1 RETURNING *`,
    [params.id, name?.trim(), color, deleted],
  );
  if (!rows[0]) throw new HttpError(404, 'subject not found');
  return Response.json(subjectRow(rows[0]));
}, { access: 'admin' });
