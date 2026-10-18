import { check, readJson } from '@server/http.js';
import { route } from '@server/route.js';
import { login } from '@server/session.js';

export const POST = route(async ({ request }) => {
  const { username, password } = await readJson(request);
  check(typeof username === 'string' && typeof password === 'string', 'Введите логин и пароль');
  return Response.json(await login(username, password));
});
