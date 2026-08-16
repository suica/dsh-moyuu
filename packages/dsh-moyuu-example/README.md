# dsh-moyuu-example

**Example** feature package of the [dsh-moyuu](https://github.com/suica/dsh-moyuu) monorepo — the smallest **client plugin** for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (`dsh`) that proves the packaging rule: **one feature = one package, each independently loadable / removable**.

> Monorepo rule: see [docs/PLUGIN-PACKAGE-RULES.zh.md](../../docs/PLUGIN-PACKAGE-RULES.zh.md).

## What it does

On activation it sets `data-moyuu-example="active"` on `<html>` and injects a single namespaced `<style>` (`dsh-moyuu-example/example.css`), which draws a small "MOYUU · example feature loaded" pill in the bottom-right corner. It depends on nothing and touches nothing owned by other packages.

Use it as a template: copy this directory to `packages/dsh-moyuu-<your-feature>/`, rename the package, and replace `client.js` with your feature.

## Install & activate (independently)

```jsonc
// in ~/.dsh/profiles/web/package.json — this feature only
"dependencies": {
  "dsh-moyuu-example": "link:/path/to/dsh-moyuu/packages/dsh-moyuu-example"
}
```

```yaml
# in ~/.dsh/profiles/web/cordis.patch.yml
- insert:
    - id: dsh-moyuu-example
      name: 'dsh-moyuu-example'
```

Refresh the web UI. You should see the example pill and:

```js
document.documentElement.dataset.moyuuExample; // => "active"
```

Removing the row + dependency stops this feature while the brand package and the rest of the UI keep working — that is the point.

## License

[MIT](LICENSE)
