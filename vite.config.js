import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// В режиме разработки API работает прямо внутри dev-сервера Vite (нужна запущенная база: npm run db)
const apiPlugin = {
  name: 'diary-api',
  apply: 'serve',
  async configureServer(server) {
    const { migrate } = await import('./server/db.js');
    const { createApi } = await import('./server/app.js');
    await migrate();
    server.middlewares.use(createApi());
  },
};

export default defineConfig({
  plugins: [react(), apiPlugin],
  server: { host: true },
});
