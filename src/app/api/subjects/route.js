import { pool } from '@server/db.js';
import { COLOR_RE, subjectRow } from '@server/homework.js';
import { check, readJson, str } from '@server/http.js';
import { route } from '@server/route.js';

export const POST = route(async ({ request }) => {
  const { id, name, color } = await readJson(request);
  check(str(id, 64) && str(name, 40) && COLOR_RE.test(color), 'invalid subject');
  const { rows } = await pool.query(
    `INSERT INTO subjects (id, name, color, position)
     VALUES ($1, $2, $3, (SELECT coalesce(max(position), 0) + 1 FROM subjects))
     RETURNING *`,
    [id, name.trim(), color],
  );
  return Response.json(subjectRow(rows[0]), { status: 201 });
}, { access: 'admin' });
