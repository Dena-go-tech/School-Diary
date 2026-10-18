import { pool } from '@server/db.js';
import {
  DATE_RE, MAX_PENDING_ALL_GUESTS, MAX_PENDING_PER_GUEST, MAX_PENDING_PER_STUDENT,
  getHomework, homeworkRow, isAdmin, isHwText, setGuestName,
} from '@server/homework.js';
import { HttpError, check, readJson, str } from '@server/http.js';
import { route } from '@server/route.js';
import { ensureUser } from '@server/session.js';

// Админ задаёт ДЗ сразу (одно на урок), ученик — отправляет запрос на проверку
export const POST = route(async (ctx) => {
  const { id, subjectId, fromDate, fromIdx, text, createdAt, authorName } = await readJson(ctx.request);
  check(str(id, 64) && str(subjectId, 64) && DATE_RE.test(fromDate), 'invalid homework');
  check(Number.isInteger(fromIdx) && fromIdx >= 0 && isHwText(text), 'invalid homework');
  await ensureUser(ctx); // гость — только для корректного запроса
  const { user } = ctx;
  const admin = isAdmin(user);

  if (admin) {
    const { rows } = await pool.query(
      `SELECT 1 FROM homework WHERE status = 'approved' AND subject_id = $1 AND from_date = $2 AND from_idx = $3`,
      [subjectId, fromDate, fromIdx],
    );
    if (rows[0]) throw new HttpError(409, 'К этому уроку ДЗ уже задано — обновите страницу');
  } else {
    const { rows: [n] } = await pool.query(
      `SELECT count(*) FILTER (WHERE h.created_by = $1)::int AS mine,
              count(*) FILTER (WHERE u.is_guest)::int AS guests
       FROM homework h JOIN users u ON u.id = h.created_by WHERE h.status = 'pending'`,
      [user.id],
    );
    const limit = user.isGuest ? MAX_PENDING_PER_GUEST : MAX_PENDING_PER_STUDENT;
    if (n.mine >= limit) throw new HttpError(429, 'Слишком много ваших запросов ждут проверки');
    if (user.isGuest && n.guests >= MAX_PENDING_ALL_GUESTS) {
      throw new HttpError(429, 'Сейчас слишком много непроверенных запросов. Попробуйте позже');
    }
    await setGuestName(user, authorName);
  }

  await pool.query(
    `INSERT INTO homework (id, subject_id, from_date, from_idx, text, created_at, status, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [id, subjectId, fromDate, fromIdx, text.trim(), Number.isFinite(createdAt) ? createdAt : Date.now(),
      admin ? 'approved' : 'pending', user.id],
  );
  return Response.json(homeworkRow(await getHomework(id, user.id)), { status: 201 });
});
