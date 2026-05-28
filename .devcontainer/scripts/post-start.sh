#!/usr/bin/env bash
set -euo pipefail

export PATH="/home/vscode/.local/bin:/home/vscode/.local/share/mise/shims:/home/vscode/.bun/bin:${PATH}"

printf "%-12s %s\n" "bun"        "$(bun --version)"
printf "%-12s %s\n" "node"       "$(node --version)"
printf "%-12s %s\n" "just"       "$(just --version)"
printf "%-12s %s\n" "pre-commit" "$(pre-commit --version)"
printf "%-12s %s\n" "cspell"     "$(cspell --version 2>/dev/null || echo not-found)"

if pg_isready -h postgres -U hrm_app -d hono_remult_dev >/dev/null 2>&1; then
  echo "postgres     up at postgres:5432"
else
  echo "postgres     unreachable (check: docker compose ps)"
fi

if command -v gh >/dev/null 2>&1; then
  gh auth status 2>&1 | sed 's/^/gh: /' || true
fi
