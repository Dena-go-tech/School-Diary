// Production-сервер: API + собранный фронтенд из dist/
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { createApi } from './app.js';
import { migrate, pool } from './db.js';

const PORT = process.env.PORT || 3000;
const DIST_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');

if (!fs.existsSync(path.join(DIST_DIR, 'index.html'))) {
  console.error('Фронтенд не собран. Выполните: npm run build');
  process.exit(1);
}

await migrate();

const app = createApi();
app.use(express.static(DIST_DIR, { index: false, maxAge: '1h' }));
app.use((req, res) => res.sendFile(path.join(DIST_DIR, 'index.html')));

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`Дневник запущен: http://localhost:${PORT}`);
  for (const list of Object.values(os.networkInterfaces())) {
    for (const i of list || []) {
      if (i.family === 'IPv4' && !i.internal) console.log(`  в локальной сети: http://${i.address}:${PORT}`);
    }
  }
});

for (const sig of ['SIGTERM', 'SIGINT']) {
  process.on(sig, () => server.close(() => pool.end().then(() => process.exit(0))));
}
