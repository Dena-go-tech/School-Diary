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
