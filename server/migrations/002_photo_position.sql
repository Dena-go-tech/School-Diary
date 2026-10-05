-- Порядок фото внутри ДЗ
ALTER TABLE homework_photos ADD COLUMN IF NOT EXISTS position INTEGER NOT NULL DEFAULT 0;
