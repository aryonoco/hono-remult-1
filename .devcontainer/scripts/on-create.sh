#!/usr/bin/env bash
set -euo pipefail

# Named volumes inherit ownership from the underlying mountpoint in the
# image — the Dockerfile pre-creates these dirs as vscode:vscode, so this
# chown is a no-op on the happy path and a silent best-effort fallback if
# anything ends up root-owned. No sudo: cap_drop ALL + no-new-privileges
# blocks setuid escalation, but as vscode we can already chown things we own.
chown -R vscode:vscode \
  /home/vscode/.bun \
  /home/vscode/.local/share/mise \
  /home/vscode/.config/gh \
  /workspaces/hono-remult-1/node_modules \
  /workspaces/hono-remult-1/.nx \
  /workspaces/hono-remult-1/.angular 2>/dev/null || true

mkdir -p /home/vscode/.local/share/mise/state /home/vscode/.local/bin

chmod 700 /home/vscode/.ssh 2>/dev/null || true
chmod 700 /home/vscode/.config/gh 2>/dev/null || true
