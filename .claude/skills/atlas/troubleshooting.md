# Atlas troubleshooting

Issues encountered during the initial Postgres + Atlas wiring. Each entry shows the symptom (verbatim error), root
cause, and fix.

## "sql/sqlclient: missing driver"

**Symptom:**

```console
$ bun run migrate:apply
Error: sql/sqlclient: missing driver. See: https://atlasgo.io/url
error: script "migrate:apply" exited with code 1
```

**Cause:** Atlas didn't receive `DATABASE_URL_MIGRATIONS` in its env. The URL Atlas constructed was empty (no scheme),
so it couldn't pick a driver.

`bun run <script>` loads `.env` into Bun's own process env but does NOT propagate to package-script subprocesses (Atlas
is a Go binary spawned by bun). The fix is mise's `_.file = ".env"` directive in `.mise.toml`, which loads `.env` into
the *shell* env. Both Bun and Atlas then inherit it.

**Diagnostics:**

```bash
# Should print all four DB URLs
env | grep -E "DATABASE|ATLAS"

# If empty, mise activation didn't run — re-activate:
eval "$(mise env -s bash)"
```

**Permanent fix:** ensure `.mise.toml` contains:

```toml
[env]
_.file = ".env"
```

## "schema 'app' was not found"

**Symptom (during `migrate:generate`):**

```text
Error: sql/migrate: taking database snapshot: postgres: schema "app" was not found
```

**Cause:** Atlas needs the `app` schema to **exist** (empty is fine) in `atlas_dev` so it can take a baseline snapshot
before replaying the migrations directory. The schema gets dropped if you `DROP SCHEMA app CASCADE` and forget to
recreate it.

**Fix:**

```bash
PGPASSWORD=hrm_dev_password psql -h postgres -U hrm_app -d atlas_dev \
  -c "CREATE SCHEMA IF NOT EXISTS app AUTHORIZATION hrm_app;"
```

`postgres-init/00-init.sql` creates this on container init, so a `docker compose up --force-recreate postgres` also
recovers.

## "connected database is not clean: found schema 'app'"

**Symptom (during `migrate:generate`):**

```text
Error: sql/migrate: taking database snapshot: sql/migrate: connected database is not clean: found schema "app"
```

**Cause:** The opposite of the above — Atlas expects `atlas_dev` to be **empty** of non-Atlas content. If something
other than Atlas created tables in `app`, Atlas refuses to proceed because it can't safely diff against a known
baseline.

**Fix:**

```bash
PGPASSWORD=hrm_dev_password psql -h postgres -U hrm_app -d atlas_dev \
  -c "DROP SCHEMA IF EXISTS app CASCADE; CREATE SCHEMA app AUTHORIZATION hrm_app;"
```

## Migration includes `DROP SCHEMA "public" CASCADE`

**Symptom:** Generated migration contains:

```sql
-- Drop schema named "public"
DROP SCHEMA "public" CASCADE;
```

**Cause:** `atlas.hcl` used `schemas = ["app"]` to restrict scope. In Atlas v1.2.0 this filter applies asymmetrically —
the `src` DB (atlas_desired) gets filtered to `[app]`, but the `dev` DB (atlas_dev) is inspected with all schemas
including `public`. Atlas then sees `public` as "in current, not in desired" and emits a destructive drop.

**Fix:** Scope at the connection layer instead, via `search_path=app` in every URL. `atlas.hcl` should NOT have a
`schemas = [...]` attribute:

```hcl
env "local" {
  src = var.desired_url  # URL ends in ?search_path=app
  url = var.url          # URL ends in ?search_path=app
  dev = var.dev_url      # URL ends in ?search_path=app
  migration { dir = "file://apps/api/src/migrations" }
}
```

Already encoded in this project's `.env.example` — every DB URL has `?sslmode=disable&search_path=app`.

## "Abort: 'atlas migrate lint' is available only to Atlas Pro users"

**Symptom:**

```text
Abort: Starting with v0.38, 'atlas migrate lint' is available only to Atlas Pro users.
```

**Cause:** Running the default EULA-licensed Atlas binary instead of the Community Edition.

**Diagnostics:**

```bash
atlas version
# Community looks like: "atlas community community version v1.2.0"
# Pro/EULA looks like:  "atlas version v1.2.0"
```

**Fix:** Ensure `.mise.toml` uses `atlas-community` (not `atlas`):

```toml
[tools]
atlas-community = "1.2.0"
```

Then `mise uninstall atlas; mise install`.

## Banner: "You're running the community build of Atlas, which differs from the official version"

**Symptom:** Stderr banner appearing on `migrate:lint` / `schema:inspect`:

```text
You're running the community build of Atlas, which differs from the official version.
```

**Cause:** Informational notice from the Community binary. Not an error.

**Fix:** Ignore. This is the price of the Apache 2.0 license — and it's the right binary for this project.

## `atlas.sum` mismatch after editing a migration

**Symptom:**

```text
Error: checksum mismatch
```

**Cause:** A migration `.sql` file was edited after generation. Atlas detects the change via `atlas.sum` (an integrity
hash file).

**Fix:** If the edit is intentional (e.g., switching auto-generated drop+add into a `RENAME COLUMN`), regenerate the
hash:

```bash
just migrate-hash
git add apps/api/src/migrations/atlas.sum
```

If the edit is unintentional, restore the file from git.

## `bun run migrate:apply` exits with "No migration files to execute"

Not an error — this means the target DB is at HEAD. Verify with:

```bash
just migrate-status
# Migration Status: OK
# -- Current Version: <latest>
# -- Next Version:    Already at latest version
```

## "permission denied for schema app" when starting the API

**Symptom:**

```text
PostgresError: permission denied for schema app
```

**Cause:** The API connected as `hrm_runtime` but tried to run DDL. Either:

- `ensureSchema: true` is set in `main.ts` (must be `false` for the two-role design)
- A migration is needed and hasn't been applied (`just migrate-apply`)
- The wrong role is in `DATABASE_URL` (should be `hrm_runtime`, not `hrm_app`)

**Fix:** Verify `main.ts` has `ensureSchema: false`, run `just migrate-status`, and check `.env` has the correct role in
`DATABASE_URL`.

## Port 3000 already in use when starting API

**Symptom:**

```text
error: Failed to start server. Is port 3000 in use?
```

**Cause:** A previous Bun/Hono process is still running (common after `bun --watch` is killed without proper cleanup).

**Fix:**

```bash
ss -tlnp | grep 3000     # find the PID
kill <pid>
```
