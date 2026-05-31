FROM mcr.microsoft.com/devcontainers/base:2-trixie

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y --no-install-recommends \
      build-essential curl wget vim nano \
      jq yq ripgrep fd-find tree htop \
      shellcheck shfmt \
      fzf bat eza \
      ca-certificates \
      postgresql-client \
      tar gzip zip unzip xz-utils \
      netcat-openbsd file less procps \
      nodejs npm \
    && ln -sf /usr/bin/fdfind /usr/local/bin/fd \
    && ln -sf /usr/bin/batcat /usr/local/bin/bat \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# Antidote zsh plugin manager pinned for reproducibility
RUN git clone --depth=1 --branch v2.0.3 https://github.com/mattmc3/antidote.git /home/vscode/.antidote \
    && chown -R vscode:vscode /home/vscode/.antidote

# just-lsp — language server for the `just` task runner, used by the VS Code Just extension.
# Pre-built binary from GitHub releases; cross-arch via `uname -m` -> rust target triple.
ARG JUST_LSP_VERSION=0.4.5
RUN set -eux; \
    case "$(uname -m)" in \
      x86_64)  TRIPLE=x86_64-unknown-linux-gnu ;; \
      aarch64) TRIPLE=aarch64-unknown-linux-gnu ;; \
      *) echo "Unsupported arch: $(uname -m)" >&2; exit 1 ;; \
    esac; \
    curl -fsSL "https://github.com/terror/just-lsp/releases/download/${JUST_LSP_VERSION}/just-lsp-${JUST_LSP_VERSION}-${TRIPLE}.tar.gz" \
      | tar -xz -C /usr/local/bin ./just-lsp \
    && chmod +x /usr/local/bin/just-lsp \
    && just-lsp --version

# Pre-create dirs that will be mounted as named volumes so they inherit
# vscode:vscode ownership rather than root:root when the volume is created.
RUN mkdir -p \
      /home/vscode/.bun/install/cache \
      /home/vscode/.bun/bin \
      /home/vscode/.local/bin \
      /home/vscode/.local/share/mise/state \
      /home/vscode/.config/gh \
      /workspaces/hono-remult-1/node_modules \
      /workspaces/hono-remult-1/.nx \
      /workspaces/hono-remult-1/.angular \
    && chown -R vscode:vscode /home/vscode /workspaces/hono-remult-1

ENV PATH="/home/vscode/.local/bin:/home/vscode/.local/share/mise/shims:/home/vscode/.bun/bin:${PATH}"
ENV SHELL=/usr/bin/zsh

# --- Headless browser for the MCP servers (baked at build time, run by vscode) ---
# Both browser MCPs (playwright + chrome-devtools) share Playwright's bundled Chromium.
# It is the only Chromium with native amd64 AND arm64 Linux builds: Chrome-for-Testing
# has no arm64 Linux build, and Google Chrome's arm64 .deb is not dependably available yet.
# Installed as root into a world-readable path OUTSIDE $HOME and outside the node_modules
# named volume, so it survives rebuilds and isn't shadowed by a runtime mount. Build-time
# Node comes from the apt `nodejs npm` above; at runtime the mise shims still win via PATH
# precedence, so apt Node is build-only.
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
    PLAYWRIGHT_SKIP_BROWSER_GC=1
RUN mkdir -p /ms-playwright \
    && apt-get update \
    # Playwright's Chromium + ALL OS shared libs (skip the headless-shell variant):
    && npx -y playwright@latest install --with-deps --no-shell chromium \
    # Arch- and version-independent symlink for .mcp.json (the `chrome-linux` folder name
    # is identical on amd64 and arm64; glob `chromium-*` excludes the `ffmpeg-*` dir):
    && ln -sf "$(ls -d /ms-playwright/chromium-*/chrome-linux/chrome | head -n1)" \
              /ms-playwright/chromium-stable \
    && chmod -R a+rX /ms-playwright \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

WORKDIR /workspaces/hono-remult-1
USER vscode
