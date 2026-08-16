# dsh-moyuu

**Brand** feature package of the [dsh-moyuu](https://github.com/suica/dsh-moyuu) monorepo — a client plugin for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (`dsh`).

**Respects the original DeepSeek brand** — keeps the whale logo and the "DeepSeek" vector wordmark — but replaces the trailing **"Harness"** with **"MOYUU"**, so the top-left wordmark reads **DeepSeek MOYUU**.

> Monorepo rule: one feature = one independently-loadable package. See [docs/PLUGIN-PACKAGE-RULES.zh.md](../../docs/PLUGIN-PACKAGE-RULES.zh.md).

## What it does

The DeepSeek Harness web shell draws its product wordmark as a hardcoded inline SVG (`viewBox="0 0 182 24"`) in the sidebar — there is no configurable slot for it. This package is a small **client plugin** (`dsh.client`, platform `web`) that:

1. grabs the live wordmark SVG at runtime,
2. removes only the "Harness" glyph paths (identified by their first x-coordinate ≥ 125) and appends a `<text>MOYUU</text>` in their place,
3. bakes the result into a data-URI and renders it as the brand button's `::after` background while hiding the original SVG.

Because the baked wordmark is a stable CSS background it survives React re-renders, works in both light and dark themes (the `currentColor` fill inherits the button color), and touches no compiled build artifacts — it ships as a normal npm package and is picked up at runtime by `dsh-client-modules`.

## Install & activate (independently)

```jsonc
// in ~/.dsh/profiles/web/package.json — this feature only
"dependencies": {
  "dsh-moyuu": "link:/path/to/dsh-moyuu/packages/dsh-moyuu"
}
```

```yaml
# in ~/.dsh/profiles/web/cordis.patch.yml
- insert:
    - id: dsh-moyuu
      name: 'dsh-moyuu'
```

Refresh the web UI. The wordmark becomes **DeepSeek MOYUU**. Removing this row + dependency leaves every other feature untouched.

## How it works

- `index.js` — the **node half**: an empty `apply()` so the package activates as a Loader entry.
- `client.js` — the **browser half**: registers via `window.__ModuleLoader__.load({ id, factory })`. On activation it grabs the live wordmark SVG, clones it, drops the "Harness" glyph paths (first x-coordinate ≥ 125), appends `<text>MOYUU</text>`, serializes that to a data-URI, and injects a `<style>` that hides the original SVG and shows the baked wordmark as the brand button's `::after` background.

The `dsh` manifest:

```json
"dsh": {
  "client": {
    "platform": "web",
    "inject": [],
    "immediately": true
  }
}
```

## Customize

To change the replacement text (default `MOYUU`), font size, weight, or position, edit `client.js` — the `<text>` element built in `buildReplacement()` (`x`, `y`, `font-size`, and `textContent`).

## License

[MIT](LICENSE)
