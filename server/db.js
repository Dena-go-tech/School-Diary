import pg from 'pg';

// DATE возвращаем строкой 'YYYY-MM-DD', а не объектом Date (иначе сдвиг из-за часового пояса)
pg.types.setTypeParser(pg.types.builtins.DATE, (v) => v);
pg.types.setTypeParser(pg.types.builtins.INT8, (v) => Number(v));

export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://diary:diary@localhost:5432/diary',
});

const SCHEMA = `
CREATE TABLE IF NOT EXISTS subjects (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  color      TEXT NOT NULL,
  position   INTEGER NOT NULL DEFAULT 0,
  deleted    BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Версия расписания действует с effective_from до следующей версии
CREATE TABLE IF NOT EXISTS schedule_versions (
  effective_from DATE PRIMARY KEY,
  bells          JSONB NOT NULL,  -- [{ "start": "08:00", "end": "08:45" }, ...]
  days           JSONB NOT NULL,  -- { "1": ["subjectId" | null, ...], ..., "7": [...] }
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ДЗ, заданное на уроке (from_date, from_idx); урок, к которому оно, вычисляется по расписанию
CREATE TABLE IF NOT EXISTS homework (
  id         TEXT PRIMARY KEY,
  subject_id TEXT NOT NULL REFERENCES subjects(id),
  from_date  DATE NOT NULL,
  from_idx   INTEGER NOT NULL,
  text       TEXT NOT NULL,
  done       BOOLEAN NOT NULL DEFAULT FALSE,
  created_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS homework_subject_idx ON homework (subject_id, from_date);

-- Фото к ДЗ (уже сжатые на клиенте); удаляются вместе с ДЗ
CREATE TABLE IF NOT EXISTS homework_photos (
  id          TEXT PRIMARY KEY,
  homework_id TEXT NOT NULL REFERENCES homework(id) ON DELETE CASCADE,
  mime        TEXT NOT NULL,
  data        BYTEA NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS homework_photos_hw_idx ON homework_photos (homework_id, created_at);
-- Порядок фото внутри ДЗ (колонка добавлена позже — для существующих баз)
ALTER TABLE homework_photos ADD COLUMN IF NOT EXISTS position INTEGER NOT NULL DEFAULT 0;
`;

const DEFAULT_SUBJECTS = [
  ['Русский язык', '#e5484d'], ['Литература', '#d6409f'], ['Математика', '#4f7cff'],
  ['Алгебра', '#3e63dd'], ['Геометрия', '#0091ff'], ['Английский язык', '#8e4ec6'],
  ['История', '#ad7f58'], ['Обществознание', '#978365'], ['География', '#12a594'],
  ['Биология', '#30a46c'], ['Физика', '#0d74ce'], ['Химия', '#f76b15'],
  ['Информатика', '#5b5bd6'], ['Физкультура', '#46a758'], ['Музыка', '#e93d82'],
  ['ИЗО', '#ffb224'], ['Технология', '#6e6e6e'], ['ОБЖ', '#c2410c'],
];

export async function migrate(retries = 20) {
  for (let i = 1; ; i++) {
    try {
      await pool.query('SELECT 1');
      break;
    } catch (e) {
      if (i >= retries) throw e;
      console.log(`Жду базу данных… (${e.code || e.message})`);
      await new Promise((r) => setTimeout(r, 1500));
    }
  }

  await pool.query(SCHEMA);
  const { rows } = await pool.query('SELECT count(*)::int AS n FROM subjects');
  if (rows[0].n === 0) {
    const values = DEFAULT_SUBJECTS.map((_, i) => `($${i * 4 + 1}, $${i * 4 + 2}, $${i * 4 + 3}, $${i * 4 + 4})`).join(',');
    const params = DEFAULT_SUBJECTS.flatMap(([name, color], i) => ['s' + i, name, color, i]);
    await pool.query(`INSERT INTO subjects (id, name, color, position) VALUES ${values}`, params);
  }
}
