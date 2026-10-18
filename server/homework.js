// Общее для API: строки ответов, ДЗ с правами доступа, проверка расписания
import { pool } from './db.js';
import { HttpError, check, str } from './http.js';

export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export const COLOR_RE = /^#[0-9a-f]{6}$/i;
const TIME_RE = /^\d{2}:\d{2}$/;
export const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const MAX_PHOTOS = 10;
export const MAX_PENDING_PER_STUDENT = 30;
export const MAX_PENDING_PER_GUEST = 10;
export const MAX_PENDING_ALL_GUESTS = 200; // защита от спама: гостем может стать любой посетитель сайта

export const isHwText = (v) => typeof v === 'string' && v.length <= 4000; // текст ДЗ может быть пустым, если есть фото
export const isAdmin = (user) => user?.role === 'admin';

export const subjectRow = (r) => ({ id: r.id, name: r.name, color: r.color, deleted: r.deleted });
export const versionRow = (r) => ({ effectiveFrom: r.effective_from, bells: r.bells, days: r.days });
export const homeworkRow = (r) => ({
  id: r.id, subjectId: r.subject_id, fromDate: r.from_date, fromIdx: r.from_idx,
  text: r.text, createdAt: r.created_at, photos: r.photos || [],
  status: r.status, createdBy: r.created_by, authorName: r.author_name || null, done: !!r.done,
});

// ДЗ с фото, автором и личной отметкой «выполнено» для пользователя $1
export const HOMEWORK_SELECT = `
  SELECT h.*, u.name AS author_name,
    coalesce((SELECT json_agg(p.id ORDER BY p.position, p.created_at) FROM homework_photos p WHERE p.homework_id = h.id), '[]') AS photos,
    EXISTS (SELECT 1 FROM homework_done d WHERE d.homework_id = h.id AND d.user_id = $1) AS done
  FROM homework h LEFT JOIN users u ON u.id = h.created_by`;

export async function getHomework(id, userId) {
  const { rows } = await pool.query(`${HOMEWORK_SELECT} WHERE h.id = $2`, [userId, id]);
  return rows[0];
}

// Видеть ДЗ: одобренное — все (и без входа), запрос — админ и автор
export const canSee = (user, hw) => hw.status === 'approved' || isAdmin(user) || (!!user && hw.created_by === user.id);
// Менять ДЗ: админ — любое, ученик или гость — только свой запрос, пока его не приняли
export const canEdit = (user, hw) => isAdmin(user) || (!!user && hw.status === 'pending' && hw.created_by === user.id);

// Гость может подписать запрос именем — его увидит админ
export async function setGuestName(user, name) {
  if (!user.isGuest || !str(name, 60)) return;
  await pool.query('UPDATE users SET name = $2 WHERE id = $1 AND is_guest', [user.id, name.trim()]);
}

// ДЗ из params.id, доступное пользователю (для edit — с правом изменения)
export async function homeworkFor({ params, user }, { edit = false } = {}) {
  const hw = await getHomework(params.id, user?.id ?? 0);
  if (!hw || !canSee(user, hw)) throw new HttpError(404, 'ДЗ не найдено');
  if (edit && !canEdit(user, hw)) throw new HttpError(403, 'Нет прав на изменение этого ДЗ');
  return hw;
}

export function validateVersion(v) {
  check(v && DATE_RE.test(v.effectiveFrom), 'effectiveFrom');
  check(Array.isArray(v.bells) && v.bells.length <= 20, 'bells');
  for (const b of v.bells) check(TIME_RE.test(b?.start) && TIME_RE.test(b?.end), 'bell time');
  check(v.days && typeof v.days === 'object', 'days');
  const days = {};
  for (let d = 1; d <= 7; d++) {
    const list = v.days[d] || [];
    check(Array.isArray(list) && list.length <= 20, 'day list');
    for (const id of list) check(id === null || typeof id === 'string', 'subject id');
    days[d] = list;
  }
  return { effectiveFrom: v.effectiveFrom, bells: v.bells.map(({ start, end }) => ({ start, end })), days };
}
