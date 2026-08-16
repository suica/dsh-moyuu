# dsh-moyuu

MOYUU-brand plugin for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (`dsh`).

**Respects the original DeepSeek brand** — keeps the whale logo and the "DeepSeek" vector wordmark — but replaces the trailing **"Harness"** with **"MOYUU"**, so the top-left wordmark reads **DeepSeek MOYUU**.

![dsh](https://img.shields.io/badge/dsh-plugin-2a7de1) ![MIT](https://img.shields.io/badge/license-MIT-green)

## What it does

The DeepSeek Harness web shell draws its product wordmark as a hardcoded inline SVG (`viewBox="0 0 182 24"`) in the sidebar — there is no configurable slot for it. This plugin is a small **client plugin** (`dsh.client`, platform `web`) that:

1. grabs the live wordmark SVG at runtime,
2. removes only the "Harness" glyph paths (identified by their first x-coordinate ≥ 125) and appends a `<text>MOYUU</text>` in their place,
3. bakes the result into a data-URI and renders it as the brand button's `::after` background while hiding the original SVG.

Because the baked wordmark is a stable CSS background it survives React re-renders, works in both light and dark themes (the `currentColor` fill inherits the button color), and touches no compiled build artifacts — it ships as a normal npm package and is picked up at runtime by `dsh-client-modules`.

## Install

Add the package and activate the plugin row:

```sh
# 1. install the package into your profile (from this git repo)
dsh plugin --profile web add git+https://github.com/suica/dsh-moyuu.git

# 2. activate it in your profile patch (~/.dsh/profiles/web/cordis.patch.yml)
```

```yaml
# cordis.patch.yml
- insert:
    - id: dsh-moyuu
      name: 'dsh-moyuu'
```

Then refresh the web UI. The wordmark becomes **MOYU Harness**.

> If you're building your own profile instead of patching `web`, add the package and the same row to `~/.dsh/profiles/<name>/cordis.patch.yml` and start it with `dsh --profile <name> --port <port>`.

## Usage

Nothing to configure — install and it works. To point the plugin at a local checkout during development, depend on it by `link:` in your profile's `package.json`:

```json
"dependencies": {
  "dsh-moyuu": "link:/path/to/dsh-moyuu"
}
```

## How it works

- `index.js` — the **node half**: an empty `apply()` so the package activates as a Loader entry.
- `client.js` — the **browser half**: registers via `window.__ModuleLoader__.load({ id, factory })`. On activation it grabs the live wordmark SVG, clones it, drops the "Harness" glyph paths (first x-coordinate ≥ 125), appends `<text>MOYUU</text>`, serializes that to a data-URI, and injects a `<style>` that hides the original SVG and shows the baked wordmark as the brand button's `::after` background:

```css
svg[viewBox="0 0 182 24"] { display: none !important; }
button:has(> svg[viewBox="0 0 182 24"])::after {
  content: "";
  width: 182px; height: 24px;
  background: url("data:image/svg+xml,...") no-repeat center / contain;
}
```

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

To change the replacement text (default `MOYUU`), font size, weight, or position, edit `client.js` — the `<text>` element built in `buildReplacement()` (`x`, `y`, `font-size`, and `textContent`). You can also restyle the collapsed-rail fish logo there if you like.

## License

[MIT](LICENSE)
