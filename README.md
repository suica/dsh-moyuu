# dsh-moyuu

MOYUU-brand plugin **suite** for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (`dsh`).

This repository is a **pnpm monorepo**: **one feature = one package, each independently loadable / removable**. The mandatory rule set lives in [docs/PLUGIN-PACKAGE-RULES.zh.md](docs/PLUGIN-PACKAGE-RULES.zh.md).

## Packages

| Package | Feature |
|---|---|
| [packages/dsh-moyuu](packages/dsh-moyuu) | Brand — replaces "Harness" with "MOYUU" in the web wordmark |
| [packages/dsh-moyuu-example](packages/dsh-moyuu-example) | Example — minimal independently-loadable client plugin (template for new features) |
| [packages/dsh-moyuu-session-context-menu](packages/dsh-moyuu-session-context-menu) | Session context menu — right-clicking a session opens its "⋯" (More) menu at the cursor |
| [packages/dsh-moyuu-session-write-lock](packages/dsh-moyuu-session-write-lock) | Node bundle — cross-process session write-lock so concurrent profiles never corrupt shared sessions |

## Why monorepo

DSH is itself built as one-feature-per-package (`@deepseek-ai/dsh-tool-*`, `dsh-client-ui-*`, …). Feature packages are added/removed independently: a dependency plus a `cordis.patch.yml` row per feature. See the rules doc for the exact manifest contract and loading paths.

## Development

```sh
pnpm install
node --check packages/dsh-moyuu/client.js
node --check packages/dsh-moyuu-example/client.js
node --check packages/dsh-moyuu-session-write-lock/index.js
```

## Install & activate (web profile example)

Each feature is installed and activated on its own. During development use `link:` into this repo:

```jsonc
// ~/.dsh/profiles/web/package.json
"dependencies": {
  "dsh-moyuu": "link:/path/to/dsh-moyuu/packages/dsh-moyuu",
  "dsh-moyuu-example": "link:/path/to/dsh-moyuu/packages/dsh-moyuu-example"
}
```

```yaml
# ~/.dsh/profiles/web/cordis.patch.yml — enable only the features you want
- insert:
    - id: dsh-moyuu
      name: 'dsh-moyuu'
    - id: dsh-moyuu-example
      name: 'dsh-moyuu-example'
```

Refresh the web UI. Removing one row stops exactly that feature.

### Node bundles (server-side features)

A bundle (e.g. `dsh-moyuu-session-write-lock`) is wired through `dsh.profile.bundles`
instead of a `cordis.patch.yml` row — its `dsh.bundle.patch` applies its own row
changes automatically:

```jsonc
// ~/.dsh/profiles/web/package.json
"dependencies": {
  "dsh-moyuu-session-write-lock": "link:/path/to/dsh-moyuu/packages/dsh-moyuu-session-write-lock"
},
"dsh": {
  "profile": {
    "bundles": ["@deepseek-ai/dsh-base", "@deepseek-ai/dsh-web-app", "dsh-moyuu-session-write-lock"]
  }
}
```

See the package README for what it fixes and how to verify.

## License

[MIT](LICENSE)
