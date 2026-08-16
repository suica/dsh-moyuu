#!/usr/bin/env bash
#
# install-moyu-profile.sh — install the ready-made "moyu" DSH profile
# **directly from GitHub**, without cloning the repo yourself or editing any file.
#
# Usage (one command):
#   curl -fsSL https://raw.githubusercontent.com/suica/dsh-moyuu/main/scripts/install-moyu-profile.sh | bash
#
# What it does:
#   1. keeps a managed shallow checkout of dsh-moyuu (on main) at
#      $DSH_MOYUU_DIR (default ~/.local/share/dsh-moyuu); clones on first run,
#      pulls on later runs;
#   2. runs the repo's scripts/setup-moyu-profile.sh, which writes the profile
#      files (package.json / cordis.patch.yml / pnpm-workspace.yaml) and runs
#      `pnpm install`.
#
# Optional env:
#   DSH_MOYUU_DIR        where to keep the managed checkout (default ~/.local/share/dsh-moyuu)
#   DSH_MOYUU_REPO       git repo URL to install from (default https://github.com/suica/dsh-moyuu.git)
#   MOYU_AGENT_MODEL     passed through to setup: set 0 to skip the cliproxy model row
#
# Requires: git + pnpm on PATH; dsh to launch the profile afterwards.

set -euo pipefail

REPO_URL="${DSH_MOYUU_REPO:-https://github.com/suica/dsh-moyuu.git}"
MANAGED_DIR="${DSH_MOYUU_DIR:-${XDG_DATA_HOME:-$HOME/.local/share}/dsh-moyuu}"

for bin in git pnpm; do
  command -v "$bin" >/dev/null 2>&1 || { echo "error: '$bin' not found on PATH" >&2; exit 1; }
done

if [ -d "$MANAGED_DIR/.git" ]; then
  echo "==> updating managed dsh-moyuu checkout at $MANAGED_DIR"
  git -C "$MANAGED_DIR" fetch --depth 1 origin main >/dev/null
  git -C "$MANAGED_DIR" reset --hard FETCH_HEAD >/dev/null
else
  echo "==> cloning dsh-moyuu into $MANAGED_DIR"
  git clone --depth 1 --branch main "$REPO_URL" "$MANAGED_DIR"
fi

# Materialize the peer dependencies of the node-side plugins
# (dsh-moyuu-session-emoji / dsh-moyuu-session-write-lock): with `link:`
# installs, Node resolves peers from the package's own location (this checkout),
# not from the profile's node_modules, so the checkout needs its own pnpm install.
echo "==> installing dsh-moyuu workspace deps (node-plugin peers)"
(cd "$MANAGED_DIR" && pnpm install)

exec bash "$MANAGED_DIR/scripts/setup-moyu-profile.sh" "$@"
