import { pool } from '@server/db.js';
import { homeworkFor } from '@server/homework.js';
import { check, readJson } from '@server/http.js';
import { route } from '@server/route.js';
import { ensureUser } from '@server/session.js';

// Личная отметка «выполнено»
export const PUT = route(async (ctx) => {
  const { done } = await readJson(ctx.request);
  check(typeof done === 'boolean', 'done');
  await homeworkFor(ctx);
  await ensureUser(ctx);
  if (done) {
    await pool.query('INSERT INTO homework_done (homework_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [ctx.params.id, ctx.user.id]);
  } else {
    await pool.query('DELETE FROM homework_done WHERE homework_id = $1 AND user_id = $2', [ctx.params.id, ctx.user.id]);
  }
  return Response.json({ done });
});
