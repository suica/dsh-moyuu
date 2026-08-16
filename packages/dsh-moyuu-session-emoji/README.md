# dsh-moyuu-session-emoji

**Feature: session-title provider plugin that names each session with a topic-emoji prefix.**

At session-naming time (the first user message), this plugin emits a session title of the form `💻 写一个 LRU 缓存`, `🐛 修复登录态丢失`, `🚀 deploy to production` — a **topic emoji chosen by the LLM**, followed by a short title — so the sidebar is scannable at a glance.

## What it does

DSH derives session titles through the `sessionTitle` service (`@deepseek-ai/dsh-session-title`), which appends a `session/title` log event that is persisted. The default profile's `session-title-llm` row summarizes the first prompt with an LLM.

This package registers the **sole** session-title provider as a **first-prompt model-backed provider**: it runs the same auxiliary-LLM title pipeline as `session-title-llm`, but with a custom system prompt that instructs the model to return a concise title **prefixed with one fitting topic emoji**. The emoji is decided by the model from the message topic, so title quality stays at LLM level — there are no brittle keyword rules to maintain, and the title is always in the message's language.

> **Important**: `sessionTitle.register()` accepts **exactly one** provider, so enabling this feature **requires disabling the default `session-title-llm` row** (see below). This is a swap of the title *provider*, not an addition — the title pipeline (route, timeout, byte budget) is unchanged from the default.

### Transient-failure retry

The title LLM call is bounded to two attempts (one retry). A transient failure — a timeout, a network error, or an adapter failure — is retried once before giving up: the session-title service commits a plain-text fallback title *before* the provider runs, and this first-prompt provider is never re-triggered by later messages, so without the retry a single flaky title call would leave the session permanently named by the plain fallback (no emoji). Cancellation (a disposed session) is never retried and fails the title generation as before; if both attempts fail, the error propagates and the plain fallback title stays.

## Configuration

The provider uses the same model-title config keys as the default `session-title-llm` row (its `Config` schema reuses `SessionTitleLlmConfigFields`):

| Key | Default | Meaning |
|---|---|---|
| `targetWords` | `5` | Target words for non-CJK titles (excluding the emoji) |
| `targetCjkCharacters` | `10` | Target CJK characters for CJK titles (excluding the emoji) |
| `maxInputBytes` | `4096` | Upper bound on the framed input |
| `maxOutputTokens` | `64` | Upper bound on the title response |
| `timeoutMs` | `60000` | Auxiliary-call timeout |
| `provider` / `model` | *(omitted)* | Optional explicit route; when omitted the exact logged main-request route is used |

## Install & activate

Add the package to a profile dependency, then **disable the default LLM title provider** and insert this plugin (with its config) in `cordis.patch.yml`:

```json
{
  "dependencies": {
    "dsh-moyuu-session-emoji": "link:../dsh-moyuu/packages/dsh-moyuu-session-emoji"
  }
}
```

```yaml
# cordis.patch.yml — swap out the default LLM title provider (only one may register)
- id: session-title-llm
  disabled: true

- insert:
    - id: dsh-moyuu-session-emoji
      name: 'dsh-moyuu-session-emoji'
      config:
        targetWords: 5
        targetCjkCharacters: 10
        maxInputBytes: 4096
        maxOutputTokens: 64
        timeoutMs: 60000
```

Then run `pnpm install` in the profile directory and restart the profile. Removing the dependency plus both blocks above disables the feature and restores the default LLM titles.

> For local monorepo development use `link:` (above). For releases use `dsh plugin --profile <name> add dsh-moyuu-session-emoji`.

## Verify

1. Activate as above and restart the profile.
2. Start a new session with a first message such as "fix the login page bug".
3. Once naming completes (after the first message is accepted), the sidebar title should read something like `🐛 fix the login page bug` (the exact emoji is model-chosen).
4. A first message in Chinese, e.g. 「写一个 LRU 缓存」, should produce something like `💻 写一个 LRU 缓存`.

Smoke test (development):

```sh
node --check index.js
node test/retry.mjs   # bounded-retry policy (transient failure → retry → emoji title)
```

## Peer dependencies

Declared as `peerDependencies`, resolved at runtime through the profile's module fallback to the installed harness version:

- `@deepseek-ai/dsh-session-title` (the `sessionTitle` service and provider contract)
- `@deepseek-ai/dsh-session-title-llm` (shared config validation and timeout policy)
- `@deepseek-ai/dsh-llm` (LLM stream + block assembly)
- `@deepseek-ai/dsh-timeout` (deadline)
- `@deepseek-ai/schemastery` (loader config schema)
- `@deepseek-ai/cordis`

During local development the profile consumes this package through a `link:`
dependency, and Node resolves ESM imports from the **package's own location**
(the monorepo worktree) — not from the profile's `node_modules`. The peers are
therefore also listed as `devDependencies` (pinned to the harness versions the
profile runs), and **`pnpm install` must be run in the monorepo worktree** so
they are present there:

```sh
# from the monorepo root / worktree
pnpm install
```

Without this, the loader fails with `ERR_MODULE_NOT_FOUND: Cannot find package
'@deepseek-ai/schemastery'` (the same prerequisite as
`dsh-moyuu-session-write-lock`). Published installs
(`dsh plugin --profile <name> add …`) install the package into the profile's
store, where its peers are resolved normally.

## License

[MIT](../../LICENSE)
