# dsh-moyuu-new-session-tooltip

**Feature: hover tooltip for the sidebar's New Session button — its localized label plus the keyboard-shortcut hint (⌘K on macOS / Ctrl+K elsewhere), styled like the built-in tooltip.**

## What it does

The DSH web UI's sidebar gives the collapse/toggle button a tooltip but not the
New Session button, so when the sidebar is **collapsed** (icon-only) the button
is unlabeled on hover. This package shows a tooltip on hover with the button's
own localized label (e.g. "新建会话" / "New session") plus the shortcut hint —
and shows it in **both** collapsed and wide states, mirroring the built-in
`Tooltip` (same design tokens, right side, vertical centering, edge clamping,
500ms delay).

Details:

- Matches the button **structurally** (`aria-label` is a New Session label AND
  it carries the 16×16 chat icon), so it is locale-independent and survives
  CSS-module re-hashes / React re-renders.
- Document-level capture listeners (delegation) — no per-button listeners, no
  leak after reload; the bubble is re-created per hover.
- The label is read from the button's own `aria-label`, so localization is
  automatic; only the shortcut hint is added by this plugin.
- The visual matches the built-in bubble: `--dsw-alias-tooltip-bg` background,
  `--dsw-static-neutral-bluish-00` text, 8px radius, `translateY(-50%)` for
  vertical centering.
- Injected style + node carry `data-plugin` / `data-plugin-css` so HMR can
  unload them.

## Install & activate

Add the package as a profile dependency and enable its `dsh.client` row (a
client plugin, activated like the other web features — a `cordis.patch.yml`
row, not a bundle):

```jsonc
// ~/.dsh/profiles/web/package.json
"dependencies": {
  "dsh-moyuu-new-session-tooltip": "link:/path/to/dsh-moyuu/packages/dsh-moyuu-new-session-tooltip"
}
```

```yaml
# ~/.dsh/profiles/web/cordis.patch.yml
- insert:
    - id: dsh-moyuu-new-session-tooltip
      name: 'dsh-moyuu-new-session-tooltip'
```

Refresh the web UI. Removing the row + dependency deactivates the feature.

## How to verify

1. Install + activate, then refresh the web UI.
2. Hover the sidebar's New Session button (chat icon) — a tooltip appears after
   ~500ms showing its label plus the shortcut hint ("新建会话 ⌘K" on macOS,
   "New session Ctrl+K" elsewhere), in both collapsed and wide sidebar states.
3. Moving off the button hides it; clicking it starts a new session and the
   tooltip is dismissed.
4. The brand wordmark button (which shares the aria-label but has no 16×16 chat
   icon) and the collapse/toggle button show **no** tooltip.

Runtime smoke test while developing:

```sh
node --check client.js
node --check index.js
```

## How it's wired

- Client half (`client.js`) matches the New Session button structurally, shows
  the tooltip after a 500ms delay, and hides on leave/click. `exports.inject`
  is `[]` — no runtime service is needed.
- Node half (`index.js`) is an empty `apply` so the package is an activatable
  Loader entry, per the one-feature-per-package rule.

## License

[MIT](../../LICENSE)