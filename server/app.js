// REST API дневника. Используется и production-сервером, и dev-сервером Vite
import express from 'express';
import { pool, transaction } from './db.js';
import { HttpError, check, str } from './http.js';
import { authRoutes, ensureUser, loadUser, requireAdmin, requireUser } from './auth.js';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const COLOR_RE = /^#[0-9a-f]{6}$/i;
const TIME_RE = /^\d{2}:\d{2}$/;
const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_PHOTOS = 10;
const MAX_PENDING_PER_STUDENT = 30;
const MAX_PENDING_PER_GUEST = 10;
const MAX_PENDING_ALL_GUESTS = 200; // защита от спама: гостем может стать любой посетитель сайта

const isHwText = (v) => typeof v === 'string' && v.length <= 4000; // текст ДЗ может быть пустым, если есть фото
const isAdmin = (user) => user?.role === 'admin';

const subjectRow = (r) => ({ id: r.id, name: r.name, color: r.color, deleted: r.deleted });
const versionRow = (r) => ({ effectiveFrom: r.effective_from, bells: r.bells, days: r.days });
const homeworkRow = (r) => ({
  id: r.id, subjectId: r.subject_id, fromDate: r.from_date, fromIdx: r.from_idx,
  text: r.text, createdAt: r.created_at, photos: r.photos || [],
  status: r.status, createdBy: r.created_by, authorName: r.author_name || null, done: !!r.done,
});

// ДЗ с фото, автором и личной отметкой «выполнено» для пользователя $1
const HOMEWORK_SELECT = `
  SELECT h.*, u.name AS author_name,
    coalesce((SELECT json_agg(p.id ORDER BY p.position, p.created_at) FROM homework_photos p WHERE p.homework_id = h.id), '[]') AS photos,
    EXISTS (SELECT 1 FROM homework_done d WHERE d.homework_id = h.id AND d.user_id = $1) AS done
  FROM homework h LEFT JOIN users u ON u.id = h.created_by`;

async function getHomework(id, userId) {
  const { rows } = await pool.query(`${HOMEWORK_SELECT} WHERE h.id = $2`, [userId, id]);
  return rows[0];
}

// Видеть ДЗ: одобренное — все (и без входа), запрос — админ и автор
const canSee = (user, hw) => hw.status === 'approved' || isAdmin(user) || (!!user && hw.created_by === user.id);
// Менять ДЗ: админ — любое, ученик или гость — только свой запрос, пока его не приняли
const canEdit = (user, hw) => isAdmin(user) || (!!user && hw.status === 'pending' && hw.created_by === user.id);

// Гость может подписать запрос именем — его увидит админ
async function setGuestName(user, name) {
  if (!user.isGuest || !str(name, 60)) return;
  await pool.query('UPDATE users SET name = $2 WHERE id = $1 AND is_guest', [user.id, name.trim()]);
}

async function homeworkFor(req, { edit = false } = {}) {
  const hw = await getHomework(req.params.id, req.user?.id ?? 0);
  if (!hw || !canSee(req.user, hw)) throw new HttpError(404, 'ДЗ не найдено');
  if (edit && !canEdit(req.user, hw)) throw new HttpError(403, 'Нет прав на изменение этого ДЗ');
  return hw;
}

function validateVersion(v) {
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

export function createApi() {
  const app = express();
  app.set('trust proxy', 'loopback, uniquelocal'); // cloudflared в той же Docker-сети передаёт X-Forwarded-Proto
  const api = express.Router();
  api.use(express.json({ limit: '1mb' }));
  api.use(loadUser);
  api.use(authRoutes());
  // Смотреть может любой посетитель. Действия ученика (запрос на ДЗ, отметка) без входа
  // создают гостевой профиль (ensureUser), остальные изменения — только с правами (requireUser/requireAdmin)

  api.get('/state', async (req, res) => {
    const [s, v, h] = await Promise.all([
      pool.query('SELECT * FROM subjects ORDER BY position, created_at'),
      pool.query('SELECT * FROM schedule_versions ORDER BY effective_from'),
      pool.query(
        `${HOMEWORK_SELECT} WHERE h.status = 'approved' OR $2 OR h.created_by = $1 ORDER BY h.created_at`,
        [req.user?.id ?? 0, isAdmin(req.user)],
      ),
    ]);
    res.json({
      me: req.user, // null — посетитель без входа
      subjects: s.rows.map(subjectRow),
      versions: v.rows.map(versionRow),
      homework: h.rows.map(homeworkRow),
    });
  });

  /* ---------- Предметы (админ) ---------- */
  api.post('/subjects', requireAdmin, async (req, res) => {
    const { id, name, color } = req.body;
    check(str(id, 64) && str(name, 40) && COLOR_RE.test(color), 'invalid subject');
    const { rows } = await pool.query(
      `INSERT INTO subjects (id, name, color, position)
       VALUES ($1, $2, $3, (SELECT coalesce(max(position), 0) + 1 FROM subjects))
       RETURNING *`,
      [id, name.trim(), color],
    );
    res.status(201).json(subjectRow(rows[0]));
  });

  api.patch('/subjects/:id', requireAdmin, async (req, res) => {
    const { name, color, deleted } = req.body;
    check(name === undefined || str(name, 40), 'name');
    check(color === undefined || COLOR_RE.test(color), 'color');
    check(deleted === undefined || typeof deleted === 'boolean', 'deleted');
    const { rows } = await pool.query(
      `UPDATE subjects SET name = coalesce($2, name), color = coalesce($3, color), deleted = coalesce($4, deleted)
       WHERE id = $1 RETURNING *`,
      [req.params.id, name?.trim(), color, deleted],
    );
    if (!rows[0]) throw new HttpError(404, 'subject not found');
    res.json(subjectRow(rows[0]));
  });

  /* ---------- Расписание (админ) ---------- */
  // Новая версия заменяет все версии, начинающиеся с той же даты или позже.
  // Дату вступления в силу считает клиент: правило «до 8:00» — по местному времени пользователя.
  api.put('/versions', requireAdmin, async (req, res) => {
    const v = validateVersion(req.body);
    await transaction(async (c) => {
      await c.query('DELETE FROM schedule_versions WHERE effective_from >= $1', [v.effectiveFrom]);
      await c.query(
        'INSERT INTO schedule_versions (effective_from, bells, days) VALUES ($1, $2, $3)',
        [v.effectiveFrom, JSON.stringify(v.bells), JSON.stringify(v.days)],
      );
    });
    res.json(v);
  });

  /* ---------- Домашние задания ---------- */
  // Админ задаёт ДЗ сразу (одно на урок), ученик — отправляет запрос на проверку
  api.post('/homework', async (req, res) => {
    const { id, subjectId, fromDate, fromIdx, text, createdAt, authorName } = req.body;
    check(str(id, 64) && str(subjectId, 64) && DATE_RE.test(fromDate), 'invalid homework');
    check(Number.isInteger(fromIdx) && fromIdx >= 0 && isHwText(text), 'invalid homework');
    await ensureUser(req, res, () => {}); // гость — только для корректного запроса
    const admin = isAdmin(req.user);

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
        [req.user.id],
      );
      const limit = req.user.isGuest ? MAX_PENDING_PER_GUEST : MAX_PENDING_PER_STUDENT;
      if (n.mine >= limit) throw new HttpError(429, 'Слишком много ваших запросов ждут проверки');
      if (req.user.isGuest && n.guests >= MAX_PENDING_ALL_GUESTS) {
        throw new HttpError(429, 'Сейчас слишком много непроверенных запросов. Попробуйте позже');
      }
      await setGuestName(req.user, authorName);
    }

    await pool.query(
      `INSERT INTO homework (id, subject_id, from_date, from_idx, text, created_at, status, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [id, subjectId, fromDate, fromIdx, text.trim(), Number.isFinite(createdAt) ? createdAt : Date.now(),
        admin ? 'approved' : 'pending', req.user.id],
    );
    res.status(201).json(homeworkRow(await getHomework(id, req.user.id)));
  });

  api.patch('/homework/:id', requireUser, async (req, res) => {
    const { text, authorName } = req.body;
    check(isHwText(text), 'text');
    await homeworkFor(req, { edit: true });
    await pool.query('UPDATE homework SET text = $2 WHERE id = $1', [req.params.id, text.trim()]);
    await setGuestName(req.user, authorName);
    res.json(homeworkRow(await getHomework(req.params.id, req.user.id)));
  });

  // Личная отметка «выполнено»
  api.put('/homework/:id/done', async (req, res) => {
    const { done } = req.body;
    check(typeof done === 'boolean', 'done');
    await homeworkFor(req);
    await ensureUser(req, res, () => {});
    if (done) {
      await pool.query('INSERT INTO homework_done (homework_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [req.params.id, req.user.id]);
    } else {
      await pool.query('DELETE FROM homework_done WHERE homework_id = $1 AND user_id = $2', [req.params.id, req.user.id]);
    }
    res.json({ done });
  });

  // Принять запрос ученика. Если к уроку ДЗ уже задано — текст и фото запроса дописываются к нему
  api.post('/homework/:id/approve', requireAdmin, async (req, res) => {
    const resultId = await transaction(async (c) => {
      const { rows: [reqHw] } = await c.query(`SELECT * FROM homework WHERE id = $1 AND status = 'pending' FOR UPDATE`, [req.params.id]);
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
    res.json({ id: resultId });
  });

  // Удалить ДЗ (админ; для запроса это «отклонить») или отозвать свой запрос (ученик)
  api.delete('/homework/:id', requireUser, async (req, res) => {
    await homeworkFor(req, { edit: true });
    await pool.query('DELETE FROM homework WHERE id = $1', [req.params.id]);
    res.status(204).end();
  });

  /* ---------- Фото к ДЗ ---------- */
  // Тело запроса — сам файл; id фото генерирует клиент (?id=...)
  api.post('/homework/:id/photos', requireUser, express.raw({ type: PHOTO_TYPES, limit: '8mb' }), async (req, res) => {
    const id = req.query.id;
    const mime = req.get('Content-Type');
    check(str(id, 64) && /^[\w-]+$/.test(id), 'photo id');
    check(PHOTO_TYPES.includes(mime) && Buffer.isBuffer(req.body) && req.body.length > 0, 'invalid photo');
    await homeworkFor(req, { edit: true });
    const { rows } = await pool.query(
      `INSERT INTO homework_photos (id, homework_id, mime, data, position)
       SELECT $1, $2, $3, $4, (SELECT coalesce(max(position), -1) + 1 FROM homework_photos WHERE homework_id = $2)
       WHERE (SELECT count(*) FROM homework_photos WHERE homework_id = $2) < $5
       RETURNING id`,
      [id, req.params.id, mime, req.body, MAX_PHOTOS],
    );
    if (!rows[0]) throw new HttpError(400, `Не больше ${MAX_PHOTOS} фото`);
    res.status(201).json({ id });
  });

  // Новый порядок фото: ids — все фото ДЗ в нужном порядке
  api.put('/homework/:id/photos/order', requireUser, async (req, res) => {
    const { ids } = req.body;
    check(Array.isArray(ids) && ids.length <= MAX_PHOTOS && ids.every((x) => str(x, 64)), 'ids');
    await homeworkFor(req, { edit: true });
    await pool.query(
      `UPDATE homework_photos p SET position = x.ord
       FROM unnest($2::text[]) WITH ORDINALITY AS x(id, ord)
       WHERE p.id = x.id AND p.homework_id = $1`,
      [req.params.id, ids],
    );
    res.json({ ids });
  });

  api.get('/photos/:id', async (req, res) => {
    const { rows } = await pool.query(
      `SELECT p.mime, p.data, h.status, h.created_by
       FROM homework_photos p JOIN homework h ON h.id = p.homework_id WHERE p.id = $1`,
      [req.params.id],
    );
    if (!rows[0] || !canSee(req.user, rows[0])) throw new HttpError(404, 'photo not found');
    // id фото не меняется, поэтому кешируем навсегда (private — только в браузере пользователя)
    res.set({ 'Content-Type': rows[0].mime, 'Cache-Control': 'private, max-age=31536000, immutable' });
    res.send(rows[0].data);
  });

  api.delete('/photos/:id', requireUser, async (req, res) => {
    const { rows } = await pool.query(
      `SELECT h.status, h.created_by FROM homework_photos p JOIN homework h ON h.id = p.homework_id WHERE p.id = $1`,
      [req.params.id],
    );
    if (rows[0]) {
      if (!canEdit(req.user, rows[0])) throw new HttpError(403, 'Нет прав на изменение этого ДЗ');
      await pool.query('DELETE FROM homework_photos WHERE id = $1', [req.params.id]);
    }
    res.status(204).end();
  });

  api.use((req, res) => res.status(404).json({ error: 'not found' }));
  api.use((err, req, res, _next) => {
    if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Файл слишком большой' });
    if (!err.status) console.error(err);
    res.status(err.status || 500).json({ error: err.status ? err.message : 'internal error' });
  });

  app.use('/api', api);
  return app;
}
