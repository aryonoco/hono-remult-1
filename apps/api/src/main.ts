import { Hono } from 'hono';

const app: Hono = new Hono();

app.get('/', (c) => c.json({ message: 'Hello, World!' }));

Bun.serve({
  port: 3000,
  fetch: app.fetch,
});
