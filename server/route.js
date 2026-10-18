// Обёртка для Route Handlers: пользователь из cookie, проверка прав, ошибки → JSON { error }.
//   export const GET = route(async (ctx) => Response.json(...), { access: 'admin' })
// ctx: { request, params, user } — user равен null у посетителя без входа.
// Обработчик может ничего не возвращать — тогда ответ 204.
import { HttpError } from './http.js';
import { loadUser } from './session.js';

export function route(handler, { access } = {}) {
  return async (request, { params } = {}) => {
    try {
      const ctx = { request, params: (await params) || {}, user: await loadUser() };
      if (access && !ctx.user) throw new HttpError(401, 'Нужно войти');
      if (access === 'admin' && ctx.user.role !== 'admin') throw new HttpError(403, 'Только для администратора');
      return (await handler(ctx)) ?? new Response(null, { status: 204 });
    } catch (e) {
      if (!e.status) console.error(e);
      return Response.json({ error: e.status ? e.message : 'internal error' }, { status: e.status || 500 });
    }
  };
}
