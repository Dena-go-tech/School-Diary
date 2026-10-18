import { pool } from '@server/db.js';
import { MAX_PHOTOS, PHOTO_TYPES, homeworkFor } from '@server/homework.js';
import { HttpError, check, readFile, str } from '@server/http.js';
import { route } from '@server/route.js';

// Тело запроса — сам файл; id фото генерирует клиент (?id=...)
export const POST = route(async (ctx) => {
  const id = ctx.request.nextUrl.searchParams.get('id');
  const mime = ctx.request.headers.get('content-type');
  check(str(id, 64) && /^[\w-]+$/.test(id), 'photo id');
  check(PHOTO_TYPES.includes(mime), 'invalid photo');
  const data = await readFile(ctx.request, 8 * 1024 * 1024);
  check(data.length > 0, 'invalid photo');
  await homeworkFor(ctx, { edit: true });
  const { rows } = await pool.query(
    `INSERT INTO homework_photos (id, homework_id, mime, data, position)
     SELECT $1, $2, $3, $4, (SELECT coalesce(max(position), -1) + 1 FROM homework_photos WHERE homework_id = $2)
     WHERE (SELECT count(*) FROM homework_photos WHERE homework_id = $2) < $5
     RETURNING id`,
    [id, ctx.params.id, mime, data, MAX_PHOTOS],
  );
  if (!rows[0]) throw new HttpError(400, `Не больше ${MAX_PHOTOS} фото`);
  return Response.json({ id }, { status: 201 });
}, { access: 'user' });
