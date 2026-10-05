-- Гости: посетители без аккаунта. Профиль создаётся при первом действии (запрос на ДЗ, отметка «выполнено»),
-- войти под ним по паролю нельзя (password_hash = '!'), он живёт только в cookie сессии.
ALTER TABLE users ADD COLUMN is_guest BOOLEAN NOT NULL DEFAULT FALSE;
CREATE INDEX users_guest_idx ON users (is_guest);
