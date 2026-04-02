---
name: hono
description: "Hono v4 web framework — middleware, routing, context, and Remult integration for apps/api/. Use when writing or modifying Hono routes and middleware."
user-invocable: false
---

# Hono API Reference

Hono is the thin API shell in this architecture. Remult handles all entity CRUD
automatically — Hono only provides middleware, auth, and non-Remult routes.

## References

- [Integration patterns](integration-patterns.md) — Remult mount, withRemult, auth, CORS, sub-routers
- [Full Hono docs](llms-full.txt) — 14K-line official documentation (section index below)

## Section Index (llms-full.txt)

| Section | Lines |
|---------|-------|
| Overview & Quick Start | 1–210 |
| Routing | 212–515 |
| App API (Hono class) | 516–760 |
| HTTPException | 758–840 |
| Presets | 856–920 |
| HonoRequest | 920–1200 |
| Context | 1200–1600 |
| Middleware (CORS, JWT, Auth, Logger, etc.) | 1600–3500 |
| Helpers (streaming, factory, testing, WebSocket, cookie) | 3500–5500 |
| Guides (best practices, RPC, validation, middleware authoring) | 5500–7000 |
| Getting Started by platform (Bun, Node, Deno, etc.) | 7000–end |

## Decision Trees

### Where does the endpoint go?

| Type | Location |
|------|----------|
| Entity CRUD | On the entity (`@Entity`, `@BackendMethod`) — never a Hono route |
| Non-CRUD (OAuth, webhooks, uploads) | Route file in `apps/api/src/routes/` |
| Custom endpoint needing Remult context | Use `api.withRemult(c, async () => { ... })` |

### Middleware

| Need | Pattern |
|------|---------|
| Add middleware | `app.use(path, middleware)` before `app.route('/', api)` |
| Type-safe middleware | `createMiddleware<{ Variables: {...} }>()` from `hono/factory` |
| Auth (required) | `jwt({ secret, alg })` from `hono/jwt` |
| Auth (optional) | `jwt({ secret, alg, allow_anon: true })` |
| CORS | `cors({ origin, credentials })` from `hono/cors` |
| Error handling | `app.onError()` + `HTTPException` |

### Route organisation

| Pattern | When |
|---------|------|
| `app.route('/', api)` | Mount Remult (always) |
| `app.route('/auth', authRoutes)` | Group non-Remult routes |
| Sub-router: `new Hono()` | Separate file per route group |
