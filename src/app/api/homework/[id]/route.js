import { pool } from '@server/db.js';
import { getHomework, homeworkFor, homeworkRow, isHwText, setGuestName } from '@server/homework.js';
import { check, readJson } from '@server/http.js';
import { route } from '@server/route.js';

export const PATCH = route(async (ctx) => {
  const { text, authorName } = await readJson(ctx.request);
  check(isHwText(text), 'text');
  await homeworkFor(ctx, { edit: true });
  await pool.query('UPDATE homework SET text = $2 WHERE id = $1', [ctx.params.id, text.trim()]);
  await setGuestName(ctx.user, authorName);
  return Response.json(homeworkRow(await getHomework(ctx.params.id, ctx.user.id)));
}, { access: 'user' });

// Удалить ДЗ (админ; для запроса это «отклонить») или отозвать свой запрос (ученик)
export const DELETE = route(async (ctx) => {
  await homeworkFor(ctx, { edit: true });
  await pool.query('DELETE FROM homework WHERE id = $1', [ctx.params.id]);
}, { access: 'user' });
