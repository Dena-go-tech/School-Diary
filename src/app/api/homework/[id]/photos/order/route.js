import { pool } from '@server/db.js';
import { MAX_PHOTOS, homeworkFor } from '@server/homework.js';
import { check, readJson, str } from '@server/http.js';
import { route } from '@server/route.js';

// Новый порядок фото: ids — все фото ДЗ в нужном порядке
export const PUT = route(async (ctx) => {
  const { ids } = await readJson(ctx.request);
  check(Array.isArray(ids) && ids.length <= MAX_PHOTOS && ids.every((x) => str(x, 64)), 'ids');
  await homeworkFor(ctx, { edit: true });
  await pool.query(
    `UPDATE homework_photos p SET position = x.ord
     FROM unnest($2::text[]) WITH ORDINALITY AS x(id, ord)
     WHERE p.id = x.id AND p.homework_id = $1`,
    [ctx.params.id, ids],
  );
  return Response.json({ ids });
}, { access: 'user' });
