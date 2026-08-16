# dsh-moyuu-input-history

**Composer** feature package of the [dsh-moyuu](https://github.com/suica/dsh-moyuu) monorepo — a **client plugin** for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (`dsh`) that adds per-conversation prompt history to the chat input.

> Monorepo rule: one feature = one independently-loadable package. See [docs/PLUGIN-PACKAGE-RULES.zh.md](../../docs/PLUGIN-PACKAGE-RULES.zh.md).

## What it does

In the DeepSeek Harness web UI, each conversation keeps an in-memory list of the prompts that were **actually sent** in *that* conversation. With the caret on the **first line** of the composer, press **ArrowUp / ArrowDown** to open a small **历史记录** (history) dropdown and recall a previous prompt:

| Key / action | Behavior |
|---|---|
| `↑` / `↓` (popup closed, caret on first line) | open the history dropdown (highlight moves over the entries) |
| `↑` | highlight the next-newer prompt (up the list) |
| `↓` | highlight the next-older prompt (down the list) |
| `Enter` | fill the highlighted prompt into the composer and close |
| `Esc` | close, leaving your current text untouched |
| any other key | collapse the dropdown; the key proceeds normally into your current text |
| click an entry / click outside | fill it in / dismiss |

Design decisions:

- **Per-conversation**: history is keyed by session id, so each conversation only ever recalls prompts sent in *that* conversation; switching conversations shows that conversation's own history.
- **Only real sends are recorded**: an `Enter` on a non-empty draft or a click of the **send** button. Manual deletes, IME composition artifacts, and draft resets on session/workspace switches are **not** recorded — stray single characters never leak into the history.
- **In-memory only**: nothing is persisted; a page reload clears it.
- No direct writes into the controlled textarea: the dropdown is registered into the app's own `conversation.input.overlay` slot and fills the draft through `inputActions.setDraft`.

## Install & activate (independently)

```jsonc
// in ~/.dsh/profiles/web/package.json — this feature only
"dependencies": {
  "dsh-moyuu-input-history": "link:/path/to/dsh-moyuu/packages/dsh-moyuu-input-history"
}
```

```yaml
# in ~/.dsh/profiles/web/cordis.patch.yml
- insert:
    - id: dsh-moyuu-input-history
      name: 'dsh-moyuu-input-history'
```

Refresh the web UI, then:

1. send a couple of messages in a conversation (they are recorded),
2. put the caret on the first line of the composer and press `↑` (or `↓`) — the history dropdown opens with only that conversation's prompts,
3. `Enter` recalls a prompt; `Esc` or any other key collapses it.

Removing the row + dependency stops this feature while the rest of the UI keeps working.

## How it works

- `index.js` — **node half**: empty `apply()`, so the package is an activatable Loader entry.
- `client.js` — **browser half**: registers via `window.__ModuleLoader__.load({ id, factory })`. On activation it registers a React component into the app's `conversation.input.overlay` slot (reusing the composer's standard `useInput` / `inputActions` / `sessionId` props) and installs a **capture-phase `keydown` listener on `document`** that handles the recall keys before the InputBar's own handler. A `click` listener recognizes the send button by its locale-safe label to mark a send intent, and the draft-clear is recorded only when that intent is set. IME composition (`isComposing` / `keyCode 229`) is always left untouched.

`dsh` manifest:

```json
"dsh": {
  "client": {
    "platform": "web",
    "inject": ["@deepseek-ai/dsh-client-runtime"],
    "immediately": true
  }
}
```

## License

[MIT](LICENSE)
