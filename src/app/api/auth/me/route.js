import { route } from '@server/route.js';

export const GET = route(async ({ user }) => Response.json(user)); // null — не вошёл
