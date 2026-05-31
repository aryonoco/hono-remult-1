import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';

import { type BunServer, sseKeepAlive } from './sse-keepalive';

// The middleware reads the Bun server off `c.env` (Bun passes the server as
// fetch's second argument, which Hono surfaces as the request environment).
// In a test we hand-roll that environment so no real Bun.serve is needed.
function buildApp(): Hono {
  const app = new Hono();
  app.use('/api/stream', sseKeepAlive());
  app.get('/api/stream', (c) => c.text('stream'));
  return app;
}

function fakeServer(): BunServer {
  return { timeout: vi.fn<BunServer['timeout']>() };
}

describe('sseKeepAlive', () => {
  it('disables the Bun idle timeout for the streamed request', async () => {
    const server = fakeServer();
    const app = buildApp();

    const request = new Request('http://localhost/api/stream');
    await app.fetch(request, server);

    expect(server.timeout).toHaveBeenCalledTimes(1);
    // Second argument 0 means "no idle timeout" so the quiet SSE stream is
    // never torn down between sporadic change events.
    expect(server.timeout).toHaveBeenCalledWith(request, 0);
  });

  it('sets X-Accel-Buffering: no so proxies flush each SSE frame', async () => {
    const server = fakeServer();
    const app = buildApp();

    const response = await app.fetch(new Request('http://localhost/api/stream'), server);

    expect(response.headers.get('X-Accel-Buffering')).toBe('no');
  });

  it('passes control to the downstream handler', async () => {
    const server = fakeServer();
    const app = buildApp();

    const response = await app.fetch(new Request('http://localhost/api/stream'), server);

    expect(response.status).toBe(200);
    expect(await response.text()).toBe('stream');
  });
});
