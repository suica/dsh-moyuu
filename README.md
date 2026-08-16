# dsh-moyuu

MOYU Harness brand plugin for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (`dsh`).

Replaces the top-left **DeepSeek** wordmark in the `dsh` web UI with **MOYU Harness** — the CSS-only way to give your own instance its own identity.

![dsh](https://img.shields.io/badge/dsh-plugin-2a7de1) ![MIT](https://img.shields.io/badge/license-MIT-green)

## What it does

The DeepSeek Harness web shell draws its product wordmark as a hardcoded inline SVG (`viewBox="0 0 182 24"`) in the sidebar — there is no configurable slot for it. This plugin is a small **client plugin** (`dsh.client`, platform `web`) that:

1. hides the original DeepSeek wordmark SVG via CSS, and
2. renders **MOYU Harness** text in its place.

Because it's a pure CSS override it survives React re-renders, works in both light and dark themes (it inherits `currentColor`), and touches no compiled build artifacts — it ships as a normal npm package and is picked up at runtime by `dsh-client-modules`.

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
- `client.js` — the **browser half**: registers via `window.__ModuleLoader__.load({ id, factory })` and injects a `<style>` in `apply()` with the brand override:

```css
svg[viewBox="0 0 182 24"] { display: none !important; }
button:has(> svg[viewBox="0 0 182 24"])::after {
  content: "MOYU Harness";
  font-weight: 600;
  /* inherits surrounding color/weight */
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

Edit `client.js`'s `STYLE` string to change the text, font size, weight, or to also restyle the collapsed-rail fish logo.

## License

[MIT](LICENSE)
