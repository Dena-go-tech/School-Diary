// REST API дневника. Используется и production-сервером, и dev-сервером Vite
import express from 'express';
import { pool } from './db.js';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const COLOR_RE = /^#[0-9a-f]{6}$/i;
const TIME_RE = /^\d{2}:\d{2}$/;
const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_PHOTOS = 10;

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function check(cond, message) {
  if (!cond) throw new HttpError(400, message);
}

const str = (v, max) => typeof v === 'string' && v.trim().length > 0 && v.length <= max;
const isHwText = (v) => typeof v === 'string' && v.length <= 4000; // текст ДЗ может быть пустым, если есть фото

const subjectRow = (r) => ({ id: r.id, name: r.name, color: r.color, deleted: r.deleted });
const versionRow = (r) => ({ effectiveFrom: r.effective_from, bells: r.bells, days: r.days });
const homeworkRow = (r) => ({
  id: r.id, subjectId: r.subject_id, fromDate: r.from_date, fromIdx: r.from_idx,
  text: r.text, done: r.done, createdAt: r.created_at, photos: r.photos || [],
});

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
  const api = express.Router();
  api.use(express.json({ limit: '1mb' }));

  api.get('/state', async (req, res) => {
    const [s, v, h] = await Promise.all([
      pool.query('SELECT * FROM subjects ORDER BY position, created_at'),
      pool.query('SELECT * FROM schedule_versions ORDER BY effective_from'),
      pool.query(`
        SELECT h.*, coalesce(
          (SELECT json_agg(p.id ORDER BY p.position, p.created_at) FROM homework_photos p WHERE p.homework_id = h.id), '[]'
        ) AS photos
        FROM homework h ORDER BY h.created_at`),
    ]);
    res.json({ subjects: s.rows.map(subjectRow), versions: v.rows.map(versionRow), homework: h.rows.map(homeworkRow) });
  });

  /* ---------- Предметы ---------- */
  api.post('/subjects', async (req, res) => {
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

  api.patch('/subjects/:id', async (req, res) => {
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

  /* ---------- Расписание ---------- */
  // Новая версия заменяет все версии, начинающиеся с той же даты или позже.
  // Дату вступления в силу считает клиент: правило «до 8:00» — по местному времени пользователя.
  api.put('/versions', async (req, res) => {
    const v = validateVersion(req.body);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM schedule_versions WHERE effective_from >= $1', [v.effectiveFrom]);
      await client.query(
        'INSERT INTO schedule_versions (effective_from, bells, days) VALUES ($1, $2, $3)',
        [v.effectiveFrom, JSON.stringify(v.bells), JSON.stringify(v.days)],
      );
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
    res.json(v);
  });

  /* ---------- Домашние задания ---------- */
  api.post('/homework', async (req, res) => {
    const { id, subjectId, fromDate, fromIdx, text, createdAt } = req.body;
    check(str(id, 64) && str(subjectId, 64) && DATE_RE.test(fromDate), 'invalid homework');
    check(Number.isInteger(fromIdx) && fromIdx >= 0 && isHwText(text), 'invalid homework');
    const { rows } = await pool.query(
      `INSERT INTO homework (id, subject_id, from_date, from_idx, text, created_at)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [id, subjectId, fromDate, fromIdx, text.trim(), Number.isFinite(createdAt) ? createdAt : Date.now()],
    );
    res.status(201).json(homeworkRow(rows[0]));
  });

  api.patch('/homework/:id', async (req, res) => {
    const { text, done } = req.body;
    check(text === undefined || isHwText(text), 'text');
    check(done === undefined || typeof done === 'boolean', 'done');
    const { rows } = await pool.query(
      'UPDATE homework SET text = coalesce($2, text), done = coalesce($3, done) WHERE id = $1 RETURNING *',
      [req.params.id, text?.trim(), done],
    );
    if (!rows[0]) throw new HttpError(404, 'homework not found');
    res.json(homeworkRow(rows[0]));
  });

  /* ---------- Фото к ДЗ ---------- */
  // Тело запроса — сам файл; id фото генерирует клиент (?id=...)
  api.post('/homework/:id/photos', express.raw({ type: PHOTO_TYPES, limit: '8mb' }), async (req, res) => {
    const id = req.query.id;
    const mime = req.get('Content-Type');
    check(str(id, 64) && /^[\w-]+$/.test(id), 'photo id');
    check(PHOTO_TYPES.includes(mime) && Buffer.isBuffer(req.body) && req.body.length > 0, 'invalid photo');
    const { rows } = await pool.query(
      `INSERT INTO homework_photos (id, homework_id, mime, data, position)
       SELECT $1, h.id, $3, $4,
              (SELECT coalesce(max(position), -1) + 1 FROM homework_photos WHERE homework_id = h.id)
       FROM homework h
       WHERE h.id = $2 AND (SELECT count(*) FROM homework_photos WHERE homework_id = h.id) < $5
       RETURNING id`,
      [id, req.params.id, mime, req.body, MAX_PHOTOS],
    );
    if (!rows[0]) throw new HttpError(400, `homework not found or more than ${MAX_PHOTOS} photos`);
    res.status(201).json({ id });
  });

  // Новый порядок фото: ids — все фото ДЗ в нужном порядке
  api.put('/homework/:id/photos/order', async (req, res) => {
    const { ids } = req.body;
    check(Array.isArray(ids) && ids.length <= MAX_PHOTOS && ids.every((x) => str(x, 64)), 'ids');
    await pool.query(
      `UPDATE homework_photos p SET position = x.ord
       FROM unnest($2::text[]) WITH ORDINALITY AS x(id, ord)
       WHERE p.id = x.id AND p.homework_id = $1`,
      [req.params.id, ids],
    );
    res.json({ ids });
  });

  api.get('/photos/:id', async (req, res) => {
    const { rows } = await pool.query('SELECT mime, data FROM homework_photos WHERE id = $1', [req.params.id]);
    if (!rows[0]) throw new HttpError(404, 'photo not found');
    // id фото не меняется, поэтому кешируем навсегда
    res.set({ 'Content-Type': rows[0].mime, 'Cache-Control': 'private, max-age=31536000, immutable' });
    res.send(rows[0].data);
  });

  api.delete('/photos/:id', async (req, res) => {
    await pool.query('DELETE FROM homework_photos WHERE id = $1', [req.params.id]);
    res.status(204).end();
  });

  api.delete('/homework/:id', async (req, res) => {
    await pool.query('DELETE FROM homework WHERE id = $1', [req.params.id]);
    res.status(204).end();
  });

  api.use((req, res) => res.status(404).json({ error: 'not found' }));
  api.use((err, req, res, _next) => {
    if (!err.status) console.error(err);
    res.status(err.status || 500).json({ error: err.status ? err.message : 'internal error' });
  });

  app.use('/api', api);
  return app;
}
