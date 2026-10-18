// Next вызывает register() один раз при старте сервера (и в dev, и в production) — применяем миграции.
// При сборке (next build) база не нужна
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs' && process.env.NEXT_PHASE !== 'phase-production-build') {
    const { migrate } = await import('@server/db.js');
    await migrate();
  }
}
