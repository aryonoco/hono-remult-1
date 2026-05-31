import { type CurrentUser, DEV_USERS, Roles } from '@workspace/shared-domain';
import { type Context, Hono } from 'hono';
import { logger } from 'hono/logger';
import type { SqlDatabase, UserInfo } from 'remult';
import { remult } from 'remult';
import { createPostgresDataProvider } from 'remult/postgres';
import { type RemultHonoServer, remultApi } from 'remult/remult-hono';

import { entities, SCHEMA, STREAM_PATH } from './config';
import { DATABASE_URL } from './env';
import { sseKeepAlive } from './sse-keepalive';

// Connects as the DML-only role (hrm_runtime in dev). DDL runs through
// Atlas using DATABASE_URL_MIGRATIONS; ensureSchema is deliberately off
// so a leaked connection cannot mutate the schema.
const dataProvider: Promise<SqlDatabase> = createPostgresDataProvider({
  connectionString: DATABASE_URL,
  schema: SCHEMA,
});

const api: RemultHonoServer = remultApi({
  admin: (): boolean => remult.isAllowed(Roles.admin),
  dataProvider,
  ensureSchema: false,
  entities,
  getUser: (c: Context): Promise<UserInfo | undefined> => {
    const userId: string | undefined = c.req.header('X-Dev-User');
    if (!userId) {
      return Promise.resolve(undefined);
    }
    return Promise.resolve(DEV_USERS.find((u: CurrentUser) => u.id === userId));
  },
});

const app: Hono = new Hono();
app.use(logger());

// Keep Remult's liveQuery SSE channel open past Bun's idle timeout so live
// change events reach already-open browsers (see sse-keepalive.ts).
app.use(STREAM_PATH, sseKeepAlive());

app.route('/', api);

Bun.serve({
  port: 3000,
  fetch: app.fetch,
});
