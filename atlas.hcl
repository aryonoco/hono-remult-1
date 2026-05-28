# Atlas configuration — schema-as-code for hono-remult-1.
#
# Atlas owns all DDL execution. The migrations/ directory is the
# committed history; main.ts runs with ensureSchema:false so the Hono
# process never executes CREATE/ALTER/DROP. See docs/00-plan.md.
#
# All credentials live in .env (via getenv); no secrets in this file.
#
# Today: one env (local). Tomorrow (Azure + GitHub Actions + Terraform)
# adds an `env "azure"` block — existing files do not change.
#
# Note on schema scoping: every URL carries `search_path=app` so Atlas's
# inspector sees only the `app` schema in each DB. Using the `schemas =`
# attribute in the env block does NOT restrict the dev DB inspection in
# Atlas v1.2.0, which results in spurious DROP SCHEMA public migrations.

variable "url" {
  type    = string
  default = getenv("DATABASE_URL_MIGRATIONS")
}

variable "desired_url" {
  type    = string
  default = getenv("ATLAS_DESIRED_URL")
}

variable "dev_url" {
  type    = string
  default = getenv("ATLAS_DEV_URL")
}

env "local" {
  # Desired schema state — populated by apps/api/src/db/sync-to-desired.ts
  # immediately before each `atlas migrate diff` invocation.
  src = var.desired_url

  # Target DB (migrations apply here).
  url = var.url

  # Scratch DB Atlas uses to replay the migrations dir and compute
  # current state. Atlas owns this DB end-to-end — never store data here.
  dev = var.dev_url

  migration {
    dir = "file://apps/api/src/migrations"
  }
}

lint {
  destructive {
    error = true
  }
  data_depend {
    error = true
  }
  naming {
    error = true
  }
}
