// Общие помощники для обработчиков API

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function check(cond, message) {
  if (!cond) throw new HttpError(400, message);
}

export const str = (v, max) => typeof v === 'string' && v.trim().length > 0 && v.length <= max;

// Состояние процесса (лимиты попыток и т. п.): в dev Next перезагружает модули, а данные должны жить
export const shared = (key, init) => (globalThis[key] ??= init());

// Тело запроса: не больше limit байт (по Content-Length и по факту)
async function readBody(request, limit) {
  if (Number(request.headers.get('content-length')) > limit) throw new HttpError(413, 'Файл слишком большой');
  const buf = Buffer.from(await request.arrayBuffer());
  if (buf.length > limit) throw new HttpError(413, 'Файл слишком большой');
  return buf;
}

// JSON-тело; пустое тело — {}
export async function readJson(request, limit = 1024 * 1024) {
  const buf = await readBody(request, limit);
  if (!buf.length) return {};
  try {
    return JSON.parse(buf.toString('utf8')) ?? {};
  } catch {
    throw new HttpError(400, 'invalid json');
  }
}

export const readFile = readBody;
