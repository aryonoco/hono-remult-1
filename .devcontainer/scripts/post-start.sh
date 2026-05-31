#!/usr/bin/env bash
set -euo pipefail

export PATH="/home/vscode/.local/bin:/home/vscode/.local/share/mise/shims:/home/vscode/.bun/bin:${PATH}"

# Capture each version separately so a failing tool surfaces rather than being
# masked by printf's exit status (shellcheck SC2312).
bun_version="$(bun --version)"
node_version="$(node --version)"
just_version="$(just --version)"
precommit_version="$(pre-commit --version)"
cspell_version="$(cspell --version 2>/dev/null || echo not-found)"
printf "%-12s %s\n" "bun"        "${bun_version}"
printf "%-12s %s\n" "node"       "${node_version}"
printf "%-12s %s\n" "just"       "${just_version}"
printf "%-12s %s\n" "pre-commit" "${precommit_version}"
printf "%-12s %s\n" "cspell"     "${cspell_version}"

if pg_isready -h postgres -U hrm_app -d hono_remult_dev >/dev/null 2>&1; then
  echo "postgres     up at postgres:5432"
else
  echo "postgres     unreachable (check: docker compose ps)"
fi

if command -v gh >/dev/null 2>&1; then
  gh auth status 2>&1 | sed 's/^/gh: /' || true
fi
