# dsh-moyuu-brand

**Brand** feature package of the [dsh-moyuu](https://github.com/suica/dsh-moyuu) monorepo — a client plugin for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (`dsh`).

**Respects the original DeepSeek brand** — keeps the whale logo and the "DeepSeek" vector wordmark — but replaces the trailing **"Harness"** with **"MOYUU"**, so the top-left wordmark reads **DeepSeek MOYUU**.

> Monorepo rule: one feature = one independently-loadable package. See [docs/PLUGIN-PACKAGE-RULES.zh.md](../../docs/PLUGIN-PACKAGE-RULES.zh.md).

## What it does

The DeepSeek Harness web shell draws its product wordmark as a hardcoded inline SVG (`viewBox="0 0 182 24"`) in the sidebar — there is no configurable slot for it. This package is a small **client plugin** (`dsh.client`, platform `web`) that patches the live SVG in place:

1. removes the "Harness" glyph group (`<g clip-path="url(#dsh-wordmark-badge-clip)">`),
2. keeps the rounded pill background and injects `<text>MOYUU</text>` centered inside it, filled with the app's inverted-label color,
3. marks the SVG and keeps a MutationObserver alive so the brand is re-applied whenever React re-creates the wordmark (sidebar collapse/expand, theme toggles, remounts).

Because the mutation lives in the live DOM, `currentColor` and CSS variables resolve natively — both light and dark themes work automatically with no re-baking — and it touches no compiled build artifacts: it ships as a normal npm package and is picked up at runtime by `dsh-client-modules`.

## Install & activate (independently)

```jsonc
// in ~/.dsh/profiles/web/package.json — this feature only
"dependencies": {
  "dsh-moyuu-brand": "link:/path/to/dsh-moyuu/packages/dsh-moyuu-brand"
}
```

```yaml
# in ~/.dsh/profiles/web/cordis.patch.yml
- insert:
    - id: dsh-moyuu-brand
      name: 'dsh-moyuu-brand'
```

Refresh the web UI. The wordmark becomes **DeepSeek MOYUU**. Removing this row + dependency leaves every other feature untouched.

## How it works

- `index.js` — the **node half**: an empty `apply()` so the package activates as a Loader entry.
- `client.js` — the **browser half**: registers via `window.__ModuleLoader__.load({ id, factory })`. On activation it finds the live wordmark SVG and rewrites it in place: drops the `Harness` glyph group, keeps the pill, and appends a centered `<text>MOYUU</text>` filled with `var(--dsw-alias-label-primary-inverted)`. A persistent `MutationObserver` re-applies the brand to any pristine wordmark React later mounts:

```js
// roughly what applyBrand(svg) does to the live SVG
svg.querySelector('g[clip-path*="dsh-wordmark-badge-clip"]').remove();
svg.appendChild(<text x="155.348" y="12.5" text-anchor="middle"
                   dominant-baseline="central" font-size="8"
                   fill="var(--dsw-alias-label-primary-inverted)">MOYUU</text>);
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

To change the replacement text (default `MOYUU`), font size, weight, or position, edit `client.js`'s `applyBrand()` — the `<text>` element it builds (`x`, `y`, `font-size`, and `textContent`).

## License

[MIT](LICENSE)
