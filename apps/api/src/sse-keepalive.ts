import type { Context, MiddlewareHandler, Next } from 'hono';

// 0 disables Bun's per-request idle timeout — the stream then stays open
// between sporadic SSE events instead of being closed after the default 10s.
const NO_IDLE_TIMEOUT = 0;

// When mounted with raw `Bun.serve({ fetch: app.fetch })`, Hono exposes the
// Bun server as `c.env` (Bun passes it as fetch's second argument). The only
// member we need is `timeout`, used to keep idle SSE streams alive.
export type BunServer = Pick<ReturnType<typeof Bun.serve>, 'timeout'>;

/**
 * Hono middleware that keeps Remult's liveQuery SSE channel open.
 *
 * Bun.serve closes a connection after 10s of inactivity by default
 * (idleTimeout), but Remult's keep-alive only fires every 45s — so an idle
 * stream is torn down mid-response before the first keep-alive, surfacing as
 * ERR_INCOMPLETE_CHUNKED_ENCODING in the browser. EventSource then reconnects
 * with a fresh connectionId, orphaning the channel the live query subscribed
 * to, so change events never arrive. Disabling the per-request idle timeout
 * lets the stream stay open between events. `X-Accel-Buffering: no`
 * additionally tells any buffering reverse proxy to flush each SSE frame
 * immediately rather than coalescing them.
 */
export function sseKeepAlive(): MiddlewareHandler {
  return (c: Context, next: Next): Promise<void> => {
    const server: BunServer = c.env;
    server.timeout(c.req.raw, NO_IDLE_TIMEOUT);
    c.header('X-Accel-Buffering', 'no');
    return next();
  };
}
