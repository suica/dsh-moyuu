# dsh-moyuu-session-write-lock

**Feature: cross-process session write-lock persistence backend.**

Prevents permanently corrupted sessions when two dsh profiles (e.g. `moyu` +
`web`) run at the same time and share the same `~/.dsh/sessions` root.

## What it does

The stock JSONL session-persistence backend (`@deepseek-ai/dsh-session-persistence-jsonl`)
serializes writers only *inside one process*. When two profiles run together they
are two independent writers with separate in-process sequence counters, so
concurrent appends to the **same** `session.jsonl.zstd` interleave frames with
duplicate `seq`s, and a torn-tail "crash repair" in one process can `truncate`
frames another process just committed — permanently corrupting the session.

This package is a subclass of that backend that wraps every physical write in a
per-log cross-process **file lock** (`<log>.lock`, `wx` exclusive create, stale
lock reclaimed by PID liveness) and, before appending, **convergently
reconciles** the batch against the durable committed tail (re-read under the
lock, compared event by event):

- a batch that continues the durable tail appends normally;
- a batch whose leading events are **already committed by another process** —
  identical content, or the same turn-closing event (`step/end` / `turn/end` /
  `session/end-seed`) closing the same interrupted turn (a live writer records
  the real abort/error `reason`, a cold repairer records the synthetic
  `interrupted`; the turn is closed on disk either way) — is **skipped**
  idempotently, so **talking to an existing session while another profile has
  it open no longer errors** (fixes the "modified by another process; reload"
  failure);
- a batch whose prefix is committed and whose suffix is not appends only the
  missing suffix (idempotent convergence);
- a genuinely NEW event that races a committed one — e.g. a fresh user turn
  sent while another profile's repair advanced the log — is **re-sequenced**
  after the durable tail and written there, so nothing is dropped and the log
  stays contiguous. A stale writer **converges instead of failing**: no
  `SESSION_ADVANCED`, no silent data loss, and its cursor tracks its own
  session so subsequent appends keep flowing.

Crash repair is reconciled the same way under the lock: the torn tail is
truncated only while it is still torn at the exact boundary this caller
observed, so one process never truncates frames another process just committed.

Result: sessions stay **shared across profiles** (no per-profile isolation), and
concurrent access is safe — the same session can be opened/read from any number
of profiles, and a stale writer converges with the latest durable state
automatically (no manual reload).

## Install & activate

Add the package as a profile dependency and to `dsh.profile.bundles` (as the
last bundle). Its `dsh.bundle.patch` (`cordis.patch.yml`) disables the stock
`session-persistence-jsonl` row and inserts this locking backend:

```json
{
  "dependencies": {
    "dsh-moyuu-session-write-lock": "link:../dsh-moyuu/packages/dsh-moyuu-session-write-lock"
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
```

Then `pnpm install` in the profile directory and restart the profile. Removing
the dependency + bundle line deactivates the feature and restores the stock
backend.

> Local monorepo development uses `link:` (as above). Published installs use
> `dsh plugin --profile <name> add dsh-moyuu-session-write-lock`, which adds the
> dependency and reconciles the bundle list.

## How to verify

1. Start two web profiles (`dsh --profile moyu --port 3080`, `dsh --profile web --port 3090`).
2. Open the same workspace in both; create/continue a session in one.
3. Confirm the other profile can open the same session **without** `SESSION_ADVANCED`,
   and that **talking to an existing session while both are open does not error**:
   the two profiles' closing events reconcile idempotently (the later writer
   skips its redundant closers), and any genuinely new turn is re-sequenced
   after the durable log instead of rejected.
4. The session log stays structurally valid (no duplicate/out-of-order `seq`)
   and no user message is dropped, even when the other profile's repair advanced
   the log between a stale writer's reads.

Runtime smoke tests while developing:

```sh
node --check index.js
node test/converge.mjs
node test/reproduce.mjs
```

## Peer dependencies

The package subclasses the harness's own persistence backend, so it declares
the harness packages as `peerDependencies` (the running `dsh` provides them at
runtime):

- `@deepseek-ai/dsh-session-persistence-jsonl`
- `@deepseek-ai/dsh-session`

During local development the profile consumes this package through a `link:`
dependency, and Node resolves ESM imports from the **package's own location**
(the monorepo worktree) — not from the profile's `node_modules`. The peers are
therefore also listed as `devDependencies` (pinned to the harness versions the
profile runs), and **`pnpm install` must be run in the monorepo worktree** so
they are present there:

```sh
# from the worktree root
pnpm install
```

Without this, the loader fails with `ERR_MODULE_NOT_FOUND: Cannot find package
'@deepseek-ai/dsh-session-persistence-jsonl'`. Published installs
(`dsh plugin --profile <name> add …`) install the package into the profile's
store, where its peers are resolved normally.

## License

[MIT](../../LICENSE)
