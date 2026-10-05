-- Пользователи, сессии, запросы учеников на ДЗ и личные отметки «выполнено»

CREATE TABLE users (
  id            SERIAL PRIMARY KEY,
  username      TEXT NOT NULL,
  name          TEXT NOT NULL,
  password_hash TEXT NOT NULL,       -- scrypt$N$r$p$соль$хеш
  role          TEXT NOT NULL CHECK (role IN ('admin', 'student')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX users_username_idx ON users (lower(username));

-- В cookie — случайный токен, в базе — только его SHA-256
CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX sessions_user_idx ON sessions (user_id);

-- approved — ДЗ видно всем; pending — запрос ученика, ждёт решения админа
ALTER TABLE homework ADD COLUMN status TEXT NOT NULL DEFAULT 'approved' CHECK (status IN ('approved', 'pending'));
ALTER TABLE homework ADD COLUMN created_by INTEGER REFERENCES users(id) ON DELETE SET NULL;
CREATE INDEX homework_status_idx ON homework (status);

-- «Выполнено» теперь у каждого пользователя своё
CREATE TABLE homework_done (
  homework_id TEXT NOT NULL REFERENCES homework(id) ON DELETE CASCADE,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (homework_id, user_id)
);
ALTER TABLE homework DROP COLUMN done;
