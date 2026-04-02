import { DEV_USERS, Roles, Task } from '@workspace/shared-domain';
import { type Context, Hono } from 'hono';
import { logger } from 'hono/logger';
import type { UserInfo } from 'remult';
import { remult } from 'remult';
import { type RemultHonoServer, remultApi } from 'remult/remult-hono';

const api: RemultHonoServer = remultApi({
  admin: () => remult.isAllowed(Roles.admin),
  entities: [Task],
  getUser: (c: Context): Promise<UserInfo | undefined> => {
    const userId: string | undefined = c.req.header('X-Dev-User');
    if (!userId) {
      return Promise.resolve(undefined);
    }
    return Promise.resolve(DEV_USERS.find((u: UserInfo) => u.id === userId));
  },
});

const app: Hono = new Hono();
app.use(logger());
app.route('/', api);

Bun.serve({
  port: 3000,
  fetch: app.fetch,
});
