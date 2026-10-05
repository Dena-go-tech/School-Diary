#!/usr/bin/env node
// Применить миграции вручную (сервер делает это сам при запуске): npm run migrate
import { pool, migrate } from '../db.js';

migrate()
  .then(() => console.log('Миграции применены'))
  .catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
