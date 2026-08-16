# dsh-moyuu-session-write-sync

**Feature: session write-sync — the consumer half of the cross-process session write-lock.**

Turns the locking backend's silent rejection into a visible, contract-driven
conflict signal, so two concurrently-running dsh profiles (e.g. `moyu` + `web`)
that share the same `~/.dsh/sessions` root never silently lose or corrupt
writes.

## What it does

The locking backend (`dsh-moyuu-session-write-lock`) serializes concurrent
writers across processes and rejects a stale append with a distinct
`SESSION_ADVANCED` error instead of corrupting the shared log. But a bare
rejection is invisible to the loser process: the coordinator's background
write-behind reports any failure through `reportBackgroundFailure`, which only
logs a warning and retains the stale events in a paused buffer.

This package stacks on the locking backend and adds the **consumer layer** at
the physical-write boundary (`appendBatch`):

- **`SESSION_ADVANCED`** (another process advanced the log — a real conflict):
  emits a structured, one-shot-per-session `session/sync-conflict` event on the
  backend's `ctx` and logs a clear warning. The write still fails — the durable
  log already carries the winner's events and is never touched.
- **`SESSION_LOCK_TIMEOUT`** (transient lock contention — NOT a conflict):
  logs a distinct "contention" note but does **not** emit
  `session/sync-conflict`, so consumers don't trigger a pointless reload.
- Anything else passes through untouched.

Result: the durable log stays intact (the winner's events are the history), the
loser's stale buffer stays paused (existing coordinator retention), and the
conflict is surfaced for the UI / other plugins to act on — the "reload" the
locking README promises becomes a concrete, observable contract.

## Install & activate

Add **both** packages as profile dependencies and to `dsh.profile.bundles`
(sync AFTER lock):

```json
{
  "dependencies": {
    "dsh-moyuu-session-write-lock": "link:../dsh-moyuu/packages/dsh-moyuu-session-write-lock",
    "dsh-moyuu-session-write-sync": "link:../dsh-moyuu/packages/dsh-moyuu-session-write-sync"
  },
  "dsh": {
    "profile": {
      "bundles": [
        "@deepseek-ai/dsh-base",
        "@deepseek-ai/dsh-web-app",
        "dsh-moyuu-session-write-lock",
        "dsh-moyuu-session-write-sync"
      ]
    }
  }
}
```

Then `pnpm install` in the profile directory and restart the profile. Removing
the sync dependency + bundle line restores the plain locking backend; removing
both restores the stock backend.

> `dsh-moyuu-session-write-sync` extends `dsh-moyuu-session-write-lock`, so the
> lock package is its agreed shared base (monorepo rule: cross-feature
> collaboration via contract, not sibling imports — the lock bundle is a base
> primitive, not a feature).

## Event contract

Emitted on the backend's `ctx` (node side):

```
ctx.on("session/sync-conflict", (detail) => { ... })
// detail = { id, code: "SESSION_ADVANCED", message, at }
```

- Emitted at most **once per session id** until the session is (re)created in
  this profile (the `session/created` reset — i.e. after a reload).
- A future client-half (web banner) can bridge this event to the browser to
  show "this session was modified by another process — reload to continue".

## How to verify

1. Start two web profiles (`dsh --profile moyu --port 3080`, `dsh --profile web --port 3090`).
2. Open the same workspace in both; create/continue a session in one.
3. Confirm the other profile's write to the same session is rejected with
   `SESSION_ADVANCED`, the `session/sync-conflict` event fires, and the session
   log stays structurally valid (no duplicate/out-of-order `seq`).

Automated smoke test (no dsh boot needed — drives two backend instances against
one temp log through the real coordinator + lock + sync stack). First create the
gitignored `node_modules` symlinks the test needs:

```sh
./test/setup.sh      # local dev only; sets up the node_modules symlinks
node --check index.js
node test/smoke.mjs
```

## Known limitation (follow-up)

The loser's in-memory **view** is not rewritten in place: this profile stops
writing that session and the user reloads it to continue from the winner's
state. A true in-place cursor rebase of a live session needs a coordinator-level
primitive in dsh core and is intentionally out of scope for this bundle.

## Peer dependencies

Declared as `peerDependencies` on the host harness packages (resolved through
the profile module fallback at runtime) plus the agreed shared base:

- `dsh-moyuu-session-write-lock`
- `@deepseek-ai/dsh-session-persistence-jsonl`
- `@deepseek-ai/dsh-session`

## License

[MIT](../../LICENSE)
