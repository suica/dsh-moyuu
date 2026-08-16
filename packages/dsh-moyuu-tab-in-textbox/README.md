# dsh-moyuu-tab-in-textbox

**Keyboard** feature package of the [dsh-moyuu](https://github.com/suica/dsh-moyuu) monorepo — a **client plugin** for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (`dsh`) that changes the Tab key **inside text boxes**.

> Monorepo rule: one feature = one independently-loadable package. See [docs/PLUGIN-PACKAGE-RULES.zh.md](../../docs/PLUGIN-PACKAGE-RULES.zh.md).

## What it does

DeepSeek Harness's web shell keeps the browser's global accessibility behavior: **Tab moves keyboard focus between the page's focusable elements**. That's helpful on buttons and links, but inside a text box it's a trap — while composing a multi-line prompt in the chat composer (`<textarea>`) or editing any input / contenteditable field, pressing Tab yanks focus out of the field to the next focusable element, instead of letting you indent.

This plugin suppresses that global Tab behavior **only inside editable text boxes** (`textarea`, text-like `<input>`, contenteditable) and replaces it with the code-editor behavior:

| Inside a text box | Before | After |
|---|---|---|
| `Tab` | focus jumps to the next element | a literal tab character (`\t`) is inserted at the caret |
| `Shift+Tab` | focus jumps to the previous element | a literal tab character is inserted at the caret |

Outside text boxes (buttons, links, menus, …) the global Tab accessibility behavior is untouched, so keyboard navigation across the app still works. IME composition is never disturbed.

## Install & activate (independently)

```jsonc
// in ~/.dsh/profiles/web/package.json — this feature only
"dependencies": {
  "dsh-moyuu-tab-in-textbox": "link:/path/to/dsh-moyuu/packages/dsh-moyuu-tab-in-textbox"
}
```

```yaml
# in ~/.dsh/profiles/web/cordis.patch.yml
- insert:
    - id: dsh-moyuu-tab-in-textbox
      name: 'dsh-moyuu-tab-in-textbox'
```

Refresh the web UI. You should see:

```js
document.documentElement.dataset.dshMoyuuTabInTextbox; // => "active"
```

Then focus the composer (or any text input) and press `Tab` — a tab character is inserted and the focus stays in the field.

Removing the row + dependency stops this feature while the brand package and the rest of the UI keep working.

## How it works

- `index.js` — **node half**: empty `apply()`, so the package is an activatable Loader entry.
- `client.js` — **browser half**: registers via `window.__ModuleLoader__.load({ id, factory })`. On activation it installs one **capture-phase `keydown` listener on `document`**; when the key is `Tab` (no ctrl/meta/alt) and `document.activeElement` is an editable text box, it calls `preventDefault()` and inserts `"\t"` at the caret:
  - `<input>`/`<textarea>`: `setRangeText("\t", start, end, "end")` + a synthetic bubbling `input` event, so React controlled fields (like the composer textarea) keep their draft state in sync.
  - contenteditable: `document.execCommand("insertText", false, "\t")`, which fires the native input events the editor already listens to.
  - IME composition (`isComposing` / `keyCode 229`) is skipped, so Chinese/Japanese/Korean input is never disturbed.

`dsh` manifest:

```json
"dsh": {
  "client": {
    "platform": "web",
    "inject": [],
    "immediately": true
  }
}
```

## License

[MIT](LICENSE)
