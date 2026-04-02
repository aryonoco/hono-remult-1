import { Task } from '@workspace/shared-domain';
import { Hono } from 'hono';
import { logger } from 'hono/logger';
import { type RemultHonoServer, remultApi } from 'remult/remult-hono';

const api: RemultHonoServer = remultApi({
  admin: true,
  entities: [Task],
});

const app: Hono = new Hono();
app.use(logger());
app.route('/', api);

Bun.serve({
  port: 3000,
  fetch: app.fetch,
});
