import { pool } from '@server/db.js';
import { HOMEWORK_SELECT, homeworkRow, isAdmin, subjectRow, versionRow } from '@server/homework.js';
import { route } from '@server/route.js';

// Смотреть может любой посетитель. Действия ученика (запрос на ДЗ, отметка) без входа
// создают гостевой профиль (ensureUser), остальные изменения — только с правами (access)
export const GET = route(async ({ user }) => {
  const [s, v, h] = await Promise.all([
    pool.query('SELECT * FROM subjects ORDER BY position, created_at'),
    pool.query('SELECT * FROM schedule_versions ORDER BY effective_from'),
    pool.query(
      `${HOMEWORK_SELECT} WHERE h.status = 'approved' OR $2 OR h.created_by = $1 ORDER BY h.created_at`,
      [user?.id ?? 0, isAdmin(user)],
    ),
  ]);
  return Response.json({
    me: user, // null — посетитель без входа
    subjects: s.rows.map(subjectRow),
    versions: v.rows.map(versionRow),
    homework: h.rows.map(homeworkRow),
  });
});
