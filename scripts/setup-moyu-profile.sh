#!/usr/bin/env bash
#
# setup-moyu-profile.sh — create a ready-to-use DSH "moyu" profile that enables
# every dsh-moyuu feature (brand, Tab-in-textbox, session context menu, Mod+K
# new session, tooltip, emoji titles, session write-lock) out of the box.
#
# Usage:
#   bash scripts/setup-moyu-profile.sh [PROFILE_NAME]
#
#   PROFILE_NAME   profile directory under $DSH_HOME/profiles (default: moyu)
#
# What it does:
#   1. writes the profile's package.json / cordis.patch.yml / pnpm-workspace.yaml,
#      with `link:` dependencies pointing at THIS checkout (no manual editing);
#   2. runs `pnpm install` inside the profile.
#
# Env overrides:
#   DSH_HOME           profiles root (default: ~/.dsh)
#   MOYU_AGENT_MODEL   set to 0 to skip the cliproxy `agent-default-model` row
#
# Prerequisites: pnpm on PATH; dsh (DeepSeek Harness CLI) to launch the profile.

set -euo pipefail

# --- locate this checkout (dsh-moyuu repo root) -----------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

PROFILE_NAME="${1:-moyu}"
DSH_HOME="${DSH_HOME:-$HOME/.dsh}"
PROFILE_DIR="$DSH_HOME/profiles/$PROFILE_NAME"

# --- sanity checks -----------------------------------------------------------
PACKAGES=(
  dsh-moyuu-brand
  dsh-moyuu-tab-in-textbox
  dsh-moyuu-session-context-menu
  dsh-moyuu-cmdk-new-session
  dsh-moyuu-new-session-tooltip
  dsh-moyuu-session-emoji
  dsh-moyuu-session-write-lock
)
for pkg in "${PACKAGES[@]}"; do
  if [ ! -f "$REPO_ROOT/packages/$pkg/package.json" ]; then
    echo "error: feature package not found: $REPO_ROOT/packages/$pkg" >&2
    exit 1
  fi
done

if ! command -v pnpm >/dev/null 2>&1; then
  echo "error: pnpm not found on PATH — install pnpm first" >&2
  exit 1
fi
if ! command -v dsh >/dev/null 2>&1; then
  echo "warning: dsh not found on PATH — install dsh first, or launch with its full path" >&2
fi

mkdir -p "$PROFILE_DIR"

# --- package.json ------------------------------------------------------------
cat > "$PROFILE_DIR/package.json" <<EOF
{
  "name": "dsh-profile-$PROFILE_NAME",
  "private": true,
  "dependencies": {
    "dsh-moyuu-brand": "link:$REPO_ROOT/packages/dsh-moyuu-brand",
    "dsh-moyuu-tab-in-textbox": "link:$REPO_ROOT/packages/dsh-moyuu-tab-in-textbox",
    "dsh-moyuu-session-context-menu": "link:$REPO_ROOT/packages/dsh-moyuu-session-context-menu",
    "dsh-moyuu-cmdk-new-session": "link:$REPO_ROOT/packages/dsh-moyuu-cmdk-new-session",
    "dsh-moyuu-new-session-tooltip": "link:$REPO_ROOT/packages/dsh-moyuu-new-session-tooltip",
    "dsh-moyuu-session-emoji": "link:$REPO_ROOT/packages/dsh-moyuu-session-emoji",
    "dsh-moyuu-session-write-lock": "link:$REPO_ROOT/packages/dsh-moyuu-session-write-lock"
  },
  "dsh": {
    "profile": {
      "bundles": [
        "@deepseek-ai/dsh-base",
        "@deepseek-ai/dsh-web-app",
        "dsh-moyuu-session-write-lock"
      ]
    }
  }
}
EOF

# --- cordis.patch.yml ---------------------------------------------------------
cat > "$PROFILE_DIR/cordis.patch.yml" <<'EOF'
# MOYU Harness profile patch layer — applied after every bundle layer.

# MOYU brand: 把左上角标识换成 "DeepSeek MOYUU"。
- insert:
    - id: dsh-moyuu-brand
      name: 'dsh-moyuu-brand'

# 会话右键菜单：右键会话在光标处打开其 "⋯"（更多）菜单。
- insert:
    - id: dsh-moyuu-session-context-menu
      name: 'dsh-moyuu-session-context-menu'

# Mod+K 新建会话：页面任意位置按 Cmd+K / Ctrl+K 打开 New Session。
- insert:
    - id: dsh-moyuu-cmdk-new-session
      name: 'dsh-moyuu-cmdk-new-session'

# "新会话"按钮悬停 tooltip：文案 + ⌘K/Ctrl+K 快捷键提示。
- insert:
    - id: dsh-moyuu-new-session-tooltip
      name: 'dsh-moyuu-new-session-tooltip'

# 文本框内 Tab 插入制表符；文本框外 Tab 仍走全局焦点导航。
- insert:
    - id: dsh-moyuu-tab-in-textbox
      name: 'dsh-moyuu-tab-in-textbox'

# emoji 会话标题：替换默认 LLM 标题 provider（标题 provider 只允许注册一个），
# 因此禁用默认 session-title-llm 行。
- id: session-title-llm
  disabled: true

- insert:
    - id: dsh-moyuu-session-emoji
      name: 'dsh-moyuu-session-emoji'
      config:
        targetWords: 5
        targetCjkCharacters: 10
        maxInputBytes: 4096
        # 宽松 token 预算：deepseek-v4-flash 在生成标题前会先思考，预算太小会被思考消耗掉、截断标题。
        maxOutputTokens: 192
        timeoutMs: 60000
EOF

if [ "${MOYU_AGENT_MODEL:-1}" = "1" ]; then
  cat >> "$PROFILE_DIR/cordis.patch.yml" <<'EOF'

# 默认 agent 模型：cliproxy provider（同 ~/.codex/config.toml 的
# [model_providers.cliproxy]）+ DeepSeek 模型。没有 cliproxy 就删掉这整段，
# 或重跑本脚本时加 MOYU_AGENT_MODEL=0。
- id: agent-default-model
  name: '@deepseek-ai/dsh-agent-default-model'
  config:
    provider: cliproxy
    model: deepseek-v4-flash
EOF
fi

# --- pnpm-workspace.yaml ------------------------------------------------------
cat > "$PROFILE_DIR/pnpm-workspace.yaml" <<'EOF'
packages:
  - .

nodeLinker: hoisted
autoInstallPeers: false
EOF

# --- install ------------------------------------------------------------------
echo "==> writing $PROFILE_NAME profile at $PROFILE_DIR"
echo "==> running pnpm install (this links the local dsh-moyuu feature packages)"
(cd "$PROFILE_DIR" && pnpm install)

echo
echo "==> done. Launch with:"
echo "    dsh --profile $PROFILE_NAME --port 3080"
echo "    then open http://127.0.0.1:3080"
