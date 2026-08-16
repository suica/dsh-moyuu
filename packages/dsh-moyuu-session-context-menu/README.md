# dsh-moyuu-session-context-menu

**Session context menu** feature package of the [dsh-moyuu](https://github.com/suica/dsh-moyuu) monorepo — a **client plugin** for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (`dsh`).

**Right-clicking a session in the sidebar now opens that session's "⋯" (More) menu at the cursor** — exactly as if you clicked the More button on the row (Rename / Fork / Archive), but expanded at the right-click point like a native context menu. No more hunting for the tiny ellipsis.

> Monorepo rule: one feature = one independently-loadable package. See [docs/PLUGIN-PACKAGE-RULES.zh.md](../../docs/PLUGIN-PACKAGE-RULES.zh.md).

## What it does

The sidebar's session list draws each session as a row whose trailing "⋯" trigger opens a portalled Menu (Rename / Fork / Archive). This plugin makes a right-click on any session row open that same menu **at the pointer position**:

- it finds the row's More button and clicks it, so the **app's own menu** opens — nothing is re-implemented;
- the menu is **anchored at the right-click point** (the trigger's wrapper is held there while the app's Menu measures it, then restored), so it expands from the cursor like a native context menu;
- the **native browser context menu is suppressed** for session rows only (elsewhere it is untouched);
- right-clicking a second row closes the first row's menu (the app's own pointerdown-based close logic handles that);
- right-clicking does **not** open the session — identical to clicking the More button.

It is a pure DOM enhancement: a single `document`-level `contextmenu` listener, no build-time edits, locale-independent (rows are matched by ARIA role/attributes and the ellipsis icon, not by label text).

## Install & activate (independently)

```jsonc
// in ~/.dsh/profiles/web/package.json — this feature only
"dependencies": {
  "dsh-moyuu-session-context-menu": "link:/path/to/dsh-moyuu/packages/dsh-moyuu-session-context-menu"
}
```

```yaml
# in ~/.dsh/profiles/web/cordis.patch.yml
- insert:
    - id: dsh-moyuu-session-context-menu
      name: 'dsh-moyuu-session-context-menu'
```

Refresh the web UI, then right-click a session in the sidebar — its "⋯" menu opens. Removing this row + dependency stops the feature while every other feature keeps working.

## How it works

- `index.js` — the **node half**: an empty `apply()` so the package activates as a Loader entry.
- `client.js` — the **browser half**: registers via `window.__ModuleLoader__.load({ id, factory })`. On activation it adds one capture-phase `contextmenu` listener on `document`. For each event it:

  1. walks up to the session row: `div[role="treeitem"][aria-selected]` (workspace header rows carry `aria-expanded`, search rows are `<button>`s — neither matches);
  2. finds the row's More trigger via the 16×16 ellipsis icon (`IconEllipsisOutline16`);
  3. `preventDefault()`s the native menu, then clicks the trigger **while its wrapper is held at the pointer**: the app's `Menu` measures the wrapper in a layout effect, so its own `fixedPos` lands on the cursor and stays there across later re-renders; the wrapper (and the ⋯ icon) is restored as soon as the menu has been placed.

The listener lives on `document`, so it survives React re-renders of the session list; an `initialized` guard keeps re-activation (e.g. HMR) from registering it twice.

## Verify

```js
// after activation, right-click a sidebar session row, then:
const menu = document.querySelector('[role="menu"]');
menu !== null;                                    // => true (the app's More menu)
// the menu's top-left sits at the right-click point:
menu.getBoundingClientRect().left === <cursorX>;  // => true
```

## License

[MIT](LICENSE)
