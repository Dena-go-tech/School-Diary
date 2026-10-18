import { route } from '@server/route.js';
import { endSession } from '@server/session.js';

export const POST = route(async () => {
  await endSession();
});
