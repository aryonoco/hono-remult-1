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

if [ ! -f "${WORKSPACE_DIR}/.env" ]; then
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

cat <<'BANNER'

Setup complete.

  just --list        # all recipes
  just dev           # run api + web together
  just check         # Biome + ESLint (matches package.json check:ci)
  just test          # Vitest via Nx
  just db            # psql into hono_remult_dev

BANNER
