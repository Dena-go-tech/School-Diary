import { transaction } from '@server/db.js';
import { validateVersion } from '@server/homework.js';
import { readJson } from '@server/http.js';
import { route } from '@server/route.js';

// Новая версия заменяет все версии, начинающиеся с той же даты или позже.
// Дату вступления в силу считает клиент: правило «до 8:00» — по местному времени пользователя.
export const PUT = route(async ({ request }) => {
  const v = validateVersion(await readJson(request));
  await transaction(async (c) => {
    await c.query('DELETE FROM schedule_versions WHERE effective_from >= $1', [v.effectiveFrom]);
    await c.query(
      'INSERT INTO schedule_versions (effective_from, bells, days) VALUES ($1, $2, $3)',
      [v.effectiveFrom, JSON.stringify(v.bells), JSON.stringify(v.days)],
    );
  });
  return Response.json(v);
}, { access: 'admin' });
