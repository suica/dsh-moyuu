# dsh-moyuu-cmdk-new-session

**Feature: keyboard shortcut — press Mod+K (Cmd+K on macOS, Ctrl+K elsewhere) to open a New Session in the web UI.**

## What it does

The web UI's sidebar already has a "New Session" button. This package makes the
same action available from the keyboard: press `Cmd+K` (macOS) / `Ctrl+K`
(Windows/Linux) anywhere in the page and a new session opens.

The shortcut reuses the exact same flow as the sidebar button
(`ctx.workspaces.startSession()`), so the behavior is identical — with a
current/recent workspace it connects that workspace's blank session and
navigates there; with no workspace it clears into the New Session view.

Details:

- Capture-phase listener, so it fires even when focus is in the composer or an
  input (a global command, not an edit action).
- `preventDefault()` stops the browser's own Mod+K binding (e.g. Ctrl+K
  focus-address-bar in some browsers).
- `Mod+Shift+K` / `Mod+Alt+K` are left alone — only the bare modifier + `K`
  triggers.
- Registered via `ctx.effect`, so HMR/unload removes the handler: no duplicate
  shortcuts after a reload, no leaked listeners.

## Install & activate

Add the package as a profile dependency and enable its `dsh.client` row (this
is a client plugin, activated like the brand/example packages — a
`cordis.patch.yml` row, not a bundle):

```jsonc
// ~/.dsh/profiles/web/package.json
"dependencies": {
  "dsh-moyuu-cmdk-new-session": "link:/path/to/dsh-moyuu/packages/dsh-moyuu-cmdk-new-session"
}
```

```yaml
# ~/.dsh/profiles/web/cordis.patch.yml
- insert:
    - id: dsh-moyuu-cmdk-new-session
      name: 'dsh-moyuu-cmdk-new-session'
```

Refresh the web UI. Removing the row + dependency deactivates the feature.

> Local monorepo development uses `link:` (as above). Because this package
> declares `dsh.client` only (no `dsh.bundle`), `dsh plugin add` treats it as a
> plain dependency — enable it through the `cordis.patch.yml` row.

## How to verify

1. Install + activate, then refresh the web UI.
2. Press `Cmd+K` (macOS) or `Ctrl+K` (elsewhere) with focus anywhere (composer,
   sidebar, an input).
3. A new session opens — same result as clicking the sidebar "New Session"
   button. If you already had a workspace, you land in its blank session.
4. No `Mod+Shift+K` behavior change; after a client reload the shortcut still
   fires exactly once per keypress.

Runtime smoke test while developing:

```sh
node --check client.js
node --check index.js
```

## How it's wired

- Client half (`client.js`) declares `exports.inject = ["workspaces"]` — the
  Loader gates activation on the `workspaces` service (provided by
  `@deepseek-ai/dsh-client-runtime`, listed in the manifest's
  `dsh.client.inject`) and grants `ctx.workspaces.startSession()`.
- Node half (`index.js`) is an empty `apply` so the package is an activatable
  Loader entry, per the one-feature-per-package rule.

## License

[MIT](../../LICENSE)
