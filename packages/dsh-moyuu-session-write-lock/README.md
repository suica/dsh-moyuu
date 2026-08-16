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
lock reclaimed by PID liveness) and, before appending, **idempotently
reconciles** the batch against the durable committed tail (re-read under the
lock, compared event by event):

- a batch that continues the durable tail appends normally;
- a batch whose events are **already committed by another process with the same
  seqs and same content** — most commonly the deterministic closers
  (`step/end` / `turn/end` / `session/end-seed`) that two profiles both generate
  for the same interrupted turn — is **skipped** instead of rejected, so
  **opening the same session from another profile no longer errors** (fixes the
  "reload doesn't help" symptom);
- a batch whose prefix is committed and whose suffix is not appends only the
  missing suffix (idempotent convergence);
- only a genuinely divergent write — different content at a seq another process
  already committed — is rejected with `SESSION_ADVANCED` ("modified by another
  process; reload").

Crash repair is reconciled the same way under the lock: the torn tail is
truncated only while it is still torn at the exact boundary this caller
observed, so one process never truncates frames another process just committed.

Result: sessions stay **shared across profiles** (no per-profile isolation), and
concurrent access is safe — the same session can be opened/read from any number
of profiles, and a second profile opening it converges with the latest durable
state automatically (no manual reload).

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
3. Confirm the other profile can open the same session **without** `SESSION_ADVANCED`:
   the two profiles' deterministic closing events reconcile idempotently (the
   later writer skips), so the log is not duplicated or corrupted.
4. The session log stays structurally valid (no duplicate/out-of-order `seq`);
   only a genuine concurrent divergence (different content racing for one `seq`)
   is rejected with `SESSION_ADVANCED`.

Runtime smoke test while developing:

```sh
node --check index.js
```

## Peer dependencies

Declared as `peerDependencies` on the host harness packages; at runtime they
resolve through the profile module fallback to the installed harness versions:

- `@deepseek-ai/dsh-session-persistence-jsonl`
- `@deepseek-ai/dsh-session`

## License

[MIT](../../LICENSE)
