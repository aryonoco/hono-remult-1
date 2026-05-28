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
    && ln -sf /usr/bin/fdfind /usr/local/bin/fd \
    && ln -sf /usr/bin/batcat /usr/local/bin/bat \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# Antidote zsh plugin manager pinned for reproducibility
RUN git clone --depth=1 --branch v2.0.3 https://github.com/mattmc3/antidote.git /home/vscode/.antidote \
    && chown -R vscode:vscode /home/vscode/.antidote

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

WORKDIR /workspaces/hono-remult-1
USER vscode
