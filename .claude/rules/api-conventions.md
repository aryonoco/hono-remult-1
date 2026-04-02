---
paths: ["apps/api/**/*.ts"]
---

# API Conventions

## Philosophy
The API app is a **thin shell** — it mounts Remult and handles platform concerns only. Business logic belongs on entities in `libs/shared/domain/`, not here.

## Remult Mount
- `remultApi({ entities, getUser, dataProvider })` is the central configuration
- All entities must be registered in the `entities` array
- `getUser` extracts user from request context (JWT header → `UserInfo`)
- `admin` should be role-gated, not `true`, in production

## Middleware Ordering
Hono uses an onion model — first registered middleware runs first (pre-next), last (post-next):
1. `logger()` — request logging
2. CORS — `cors()` from `hono/cors`
3. Auth — JWT verification middleware
4. Remult — `app.route('/', api)` last

## Non-Remult Routes
Only for things Remult cannot handle such as OAuth callbacks, webhooks, file uploads.
- Place in `apps/api/src/routes/` as separate files
- Export `new Hono()` sub-router, mount with `app.route('/path', router)`
- Use `api.withRemult(c, async () => { ... })` when the route needs Remult context

## Type Safety
- Type context variables: `new Hono<{ Variables: { userId: string } }>()`
- Use `createMiddleware<{ Variables: {...} }>()` from `hono/factory` for type-safe middleware
- Error handling: `app.onError()` global handler + `HTTPException` for structured errors

## Server
- `Bun.serve({ port, fetch: app.fetch })` — direct Bun runtime
- Dev: `bun --watch` for hot-reload

## Module Boundary
- `scope:api` cannot import from `@angular/*`
- Can import from `remult`, `hono`, `hono/*`, and `@workspace/shared-domain`
