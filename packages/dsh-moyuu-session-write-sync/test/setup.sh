#!/usr/bin/env bash
# Create the local node_modules symlinks the smoke test needs to resolve the
# monorepo's dsh-moyuu-session-write-lock and the harness's @deepseek-ai/*.
#
# node_modules/ is gitignored, so this is dev-only setup, not committed output.
# The harness packages live inside the installed @deepseek-ai/dsh checkout;
# point DSH_PACKAGES at its node_modules/@deepseek-ai scope when it differs.
set -euo pipefail

cd "$(dirname "$0")/.."   # worktree root

DSH_PACKAGES="${DSH_PACKAGES:-}"
if [[ -z "$DSH_PACKAGES" ]]; then
  DSH_PACKAGES="$(node -e 'process.stdout.write(require.resolve("@deepseek-ai/dsh/package.json", { paths: [require("node:path").join(process.env.HOME, ".local/share/fnm/node-versions")] }).replace(/package\.json$/, "node_modules/@deepseek-ai"))' 2>/dev/null || true)"
fi
if [[ -z "$DSH_PACKAGES" || ! -d "$DSH_PACKAGES/dsh-session" ]]; then
  echo "error: could not locate the harness @deepseek-ai packages (set DSH_PACKAGES)" >&2
  exit 1
fi

mkdir -p node_modules
ln -sfn ../packages/dsh-moyuu-session-write-lock node_modules/dsh-moyuu-session-write-lock
ln -sfn "$DSH_PACKAGES" node_modules/@deepseek-ai

echo "node_modules symlinks ready:"
ls -la node_modules
