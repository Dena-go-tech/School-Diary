import { transaction } from '@server/db.js';
import { MAX_PHOTOS } from '@server/homework.js';
import { HttpError } from '@server/http.js';
import { route } from '@server/route.js';

// Принять запрос ученика. Если к уроку ДЗ уже задано — текст и фото запроса дописываются к нему
export const POST = route(async ({ params }) => {
  const resultId = await transaction(async (c) => {
    const { rows: [reqHw] } = await c.query(`SELECT * FROM homework WHERE id = $1 AND status = 'pending' FOR UPDATE`, [params.id]);
    if (!reqHw) throw new HttpError(404, 'Запрос не найден — возможно, его уже рассмотрели');
    const { rows: [official] } = await c.query(
      `SELECT * FROM homework WHERE status = 'approved' AND subject_id = $1 AND from_date = $2 AND from_idx = $3 FOR UPDATE`,
      [reqHw.subject_id, reqHw.from_date, reqHw.from_idx],
    );
    if (!official) {
      await c.query(`UPDATE homework SET status = 'approved' WHERE id = $1`, [reqHw.id]);
      return reqHw.id;
    }
    await c.query(
      `UPDATE homework SET text = concat_ws(E'\\n', nullif(text, ''), nullif($2, '')) WHERE id = $1`,
      [official.id, reqHw.text],
    );
    // Фото запроса переносим в конец ДЗ (лишние сверх лимита удалятся вместе с запросом)
    await c.query(
      `WITH base AS (SELECT coalesce(max(position), -1) AS m, count(*) AS n FROM homework_photos WHERE homework_id = $1),
            moved AS (
              SELECT p.id, row_number() OVER (ORDER BY p.position, p.created_at) AS rn
              FROM homework_photos p WHERE p.homework_id = $2
            )
       UPDATE homework_photos p SET homework_id = $1, position = base.m + moved.rn
       FROM moved, base
       WHERE p.id = moved.id AND base.n + moved.rn <= $3`,
      [official.id, reqHw.id, MAX_PHOTOS],
    );
    await c.query('DELETE FROM homework WHERE id = $1', [reqHw.id]);
    return official.id;
  });
  return Response.json({ id: resultId });
}, { access: 'admin' });
