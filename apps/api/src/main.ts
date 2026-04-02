import { Task } from '@workspace/shared-domain';
import { Hono } from 'hono';
import { type RemultHonoServer, remultApi } from 'remult/remult-hono';

const api: RemultHonoServer = remultApi({
  entities: [Task],
});

const app: Hono = new Hono();
app.route('', api);

Bun.serve({
  port: 3000,
  fetch: app.fetch,
});
