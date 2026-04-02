# Hono Integration Patterns

## Remult Mount

**Pattern:** The standard setup from this project.
```typescript
import { remultApi } from 'remult/remult-hono';
import { Task } from '@workspace/shared-domain';

const api = remultApi({
  entities: [Task],
  getUser: async (c) => {
    const token = c.req.header('Authorization')?.replace('Bearer ', '');
    if (!token) return undefined;
    const payload = await verifyJwt(token);
    return { id: payload.sub, name: payload.name, roles: payload.roles ?? [] };
  },
});

const app = new Hono();
app.use(logger());
app.route('/', api);

Bun.serve({ port: 3000, fetch: app.fetch });
```

---

## getUser Pattern

`getUser` extracts user from request context and returns a Remult `UserInfo`:
```typescript
getUser: async (c) => {
  const jwtPayload = c.get('jwtPayload');  // If using hono/jwt middleware
  if (!jwtPayload) return undefined;
  return {
    id: jwtPayload.sub,
    name: jwtPayload.name,
    roles: jwtPayload.roles || [],
  };
}
```

---

## withRemult — Remult Context in Non-Remult Routes

**Pattern:** Access Remult (entities, repos, user context) from a custom Hono route.
```typescript
app.post('/custom-endpoint', async (c) => {
  return api.withRemult(c, async () => {
    const user = remult.user;
    const tasks = await remult.repo(Task).find({ where: { createdBy: user?.id } });
    return c.json(tasks);
  });
});
```

---

## Type-Safe Middleware

**Pattern:** Use `createMiddleware` for typed context variables.
```typescript
import { createMiddleware } from 'hono/factory';

const authMiddleware = createMiddleware<{
  Variables: { userId: string; userRoles: string[] };
}>(async (c, next) => {
  const token = c.req.header('Authorization')?.replace('Bearer ', '');
  if (!token) {
    throw new HTTPException(401, { message: 'Missing token' });
  }
  const payload = await verifyJwt(token);
  c.set('userId', payload.sub);
  c.set('userRoles', payload.roles ?? []);
  await next();
});

// Variables from all middleware merge automatically
app.use(authMiddleware);
// c.var.userId and c.var.userRoles now typed
```

---

## CORS

```typescript
import { cors } from 'hono/cors';

app.use(cors({
  origin: ['http://localhost:4200'],
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
  maxAge: 3600,
}));
```

---

## JWT Middleware

```typescript
import { jwt } from 'hono/jwt';

// Required authentication
app.use('/api/*', jwt({ secret: process.env.JWT_SECRET!, alg: 'HS256' }));

// Optional authentication (allow anonymous)
app.use('/api/*', jwt({ secret: process.env.JWT_SECRET!, alg: 'HS256', allow_anon: true }));

// Access payload
app.get('/api/me', (c) => {
  const payload = c.get('jwtPayload');
  return c.json(payload);
});
```

---

## Error Handling

**Pattern:** Global error handler + HTTPException for structured errors.
```typescript
import { HTTPException } from 'hono/http-exception';

app.onError((err, c) => {
  if (err instanceof HTTPException) {
    return c.json({ error: err.message }, err.status);
  }
  console.error(err);
  return c.json({ error: 'Internal server error' }, 500);
});
```

---

## Sub-Router Pattern

**Pattern:** Organise non-Remult routes in separate files.
```typescript
// routes/auth.ts
import { Hono } from 'hono';
const authRoutes = new Hono();
authRoutes.post('/callback/github', (c) => { /* OAuth callback */ });
authRoutes.post('/logout', (c) => { /* Logout */ });
export { authRoutes };

// main.ts
import { authRoutes } from './routes/auth';
app.route('/auth', authRoutes);
```

---

## Middleware Execution Order (Onion Model)

```
Request →  logger (pre)  →  cors (pre)  →  auth (pre)  →  handler
                                                            ↓
Response ← logger (post) ← cors (post) ← auth (post) ← response
```

Register global middleware BEFORE specific paths. Register Remult route last.
