#!/usr/bin/env bash
set -euo pipefail

export PATH="/home/vscode/.local/bin:/home/vscode/.local/share/mise/shims:/home/vscode/.bun/bin:${PATH}"

WORKSPACE_DIR="/workspaces/hono-remult-1"
cd "${WORKSPACE_DIR}"

echo "Configuring shell..."
cp "${WORKSPACE_DIR}/.devcontainer/config/zshrc"           /home/vscode/.zshrc
cp "${WORKSPACE_DIR}/.devcontainer/config/zsh_plugins.txt" /home/vscode/.zsh_plugins.txt
cp "${WORKSPACE_DIR}/.devcontainer/config/p10k.zsh"        /home/vscode/.p10k.zsh

echo "Installing tools via mise..."
mise install --yes
mise reshim

echo "Configuring mise PATH for non-interactive shells..."
MISE_PROFILE_DIR="/home/vscode/.local/share/mise/profile.d"
mkdir -p "${MISE_PROFILE_DIR}"
cat > "${MISE_PROFILE_DIR}/mise-path.sh" << 'MISE_EOF'
export PATH="/home/vscode/.local/bin:/home/vscode/.local/share/mise/shims:/home/vscode/.bun/bin:${PATH}"
MISE_EOF
if ! grep -q 'mise/profile.d/mise-path.sh' /home/vscode/.profile 2>/dev/null; then
  echo '[ -f /home/vscode/.local/share/mise/profile.d/mise-path.sh ] && . /home/vscode/.local/share/mise/profile.d/mise-path.sh' >> /home/vscode/.profile
fi

echo "Installing project dependencies..."
bun install --frozen-lockfile

echo "Installing pre-commit hooks..."
pre-commit install --install-hooks

if [[ ! -f "${WORKSPACE_DIR}/.env" ]]; then
  cp "${WORKSPACE_DIR}/.env.example" "${WORKSPACE_DIR}/.env"
fi

echo "Waiting for Postgres..."
for _ in $(seq 1 30); do
  if pg_isready -h postgres -U hrm_app -d hono_remult_dev >/dev/null 2>&1; then
    echo "Postgres is up."
    break
  fi
  sleep 2
done

# Bring the schema up to date and load the deterministic fixtures so a freshly
# built container comes up fully populated. Both steps are idempotent: Atlas
# skips already-applied migrations, and the seed truncates the fire tables
# before re-inserting, so a rebuild reproduces the exact same data.
echo "Applying database migrations..."
bun run migrate:apply

echo "Seeding fixtures..."
bun run db:seed

cat <<'BANNER'

Setup complete.

  just --list        # all recipes
  just dev           # run api + web together
  just check         # Biome + ESLint (matches package.json check:ci)
  just test          # Vitest via Nx
  just db            # psql into hono_remult_dev
  just db-seed       # re-load the deterministic fixtures
  just db-reset      # drop, migrate and re-seed from scratch

BANNER
