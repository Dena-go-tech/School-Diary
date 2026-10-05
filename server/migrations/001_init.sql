-- Базовая схема. IF NOT EXISTS — чтобы миграция безопасно прошла на базах,
-- созданных до появления системы миграций.

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

-- Стандартные предметы — только в пустую базу
INSERT INTO subjects (id, name, color, position)
SELECT 's' || (n - 1), name, color, n - 1
FROM (VALUES
  (1, 'Русский язык', '#e5484d'), (2, 'Литература', '#d6409f'), (3, 'Математика', '#4f7cff'),
  (4, 'Алгебра', '#3e63dd'), (5, 'Геометрия', '#0091ff'), (6, 'Английский язык', '#8e4ec6'),
  (7, 'История', '#ad7f58'), (8, 'Обществознание', '#978365'), (9, 'География', '#12a594'),
  (10, 'Биология', '#30a46c'), (11, 'Физика', '#0d74ce'), (12, 'Химия', '#f76b15'),
  (13, 'Информатика', '#5b5bd6'), (14, 'Физкультура', '#46a758'), (15, 'Музыка', '#e93d82'),
  (16, 'ИЗО', '#ffb224'), (17, 'Технология', '#6e6e6e'), (18, 'ОБЖ', '#c2410c')
) AS d(n, name, color)
WHERE NOT EXISTS (SELECT 1 FROM subjects);
