-- Runs once when the postgres data volume is empty.
-- POSTGRES_DB / POSTGRES_USER / POSTGRES_PASSWORD env vars have already
-- created database `hono_remult_dev` owned by `hrm_app`. This script then
-- runs as hrm_app, connected to hono_remult_dev.

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

CREATE SCHEMA IF NOT EXISTS app AUTHORIZATION hrm_app;

-- No-DDL runtime role. Switch DATABASE_URL to this once Remult's
-- ensureSchema is replaced by explicit migrations.
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'hrm_runtime') THEN
    CREATE ROLE hrm_runtime LOGIN PASSWORD 'hrm_runtime_password';
  END IF;
END
$$;

GRANT CONNECT ON DATABASE hono_remult_dev TO hrm_runtime;
GRANT USAGE ON SCHEMA app TO hrm_runtime;
ALTER DEFAULT PRIVILEGES IN SCHEMA app
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO hrm_runtime;
ALTER DEFAULT PRIVILEGES IN SCHEMA app
  GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO hrm_runtime;

ALTER ROLE hrm_app     SET search_path = app, public;
ALTER ROLE hrm_runtime SET search_path = app, public;

REVOKE CREATE ON SCHEMA public FROM PUBLIC;

ALTER DATABASE hono_remult_dev SET timezone TO 'UTC';

-- Scratch databases used by Atlas's schema diff engine. atlas_desired
-- holds the desired state (populated by Remult's ensureSchema before
-- each diff); atlas_dev is the throwaway DB Atlas uses to replay the
-- migration history and compute the current state. Both are local-only
-- — production / CI will use ephemeral containers instead.
CREATE DATABASE atlas_desired OWNER hrm_app;
CREATE DATABASE atlas_dev     OWNER hrm_app;

-- Both scratch DBs need the app schema pre-created. atlas_desired is
-- repopulated by sync-to-desired.ts before each diff. atlas_dev must
-- have the schema exist (but empty) so Atlas can take a clean snapshot
-- before replaying the migrations directory.
\connect atlas_desired
CREATE SCHEMA IF NOT EXISTS app AUTHORIZATION hrm_app;

\connect atlas_dev
CREATE SCHEMA IF NOT EXISTS app AUTHORIZATION hrm_app;
