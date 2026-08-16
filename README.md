# dsh-moyuu

[English](README.en.md) | 简体中文

本仓库是 **pnpm monorepo**：**一个功能 = 一个 package，每个 package 都可以独立加载 / 移除**。
分包强制规则见 [docs/PLUGIN-PACKAGE-RULES.zh.md](docs/PLUGIN-PACKAGE-RULES.zh.md)。

## 功能包列表

| Package | 功能 |
|---|---|
| [packages/dsh-moyuu-brand](packages/dsh-moyuu-brand) | 品牌：Web 左上角标识 “Harness” → “MOYUU” |
| [packages/dsh-moyuu-tab-in-textbox](packages/dsh-moyuu-tab-in-textbox) | 键盘：文本框内 Tab 插入制表符，不再跳转焦点 |
| [packages/dsh-moyuu-example](packages/dsh-moyuu-example) | 示例：最小可独立加载的客户端插件（新功能的模板） |
| [packages/dsh-moyuu-session-context-menu](packages/dsh-moyuu-session-context-menu) | 会话右键菜单：右键会话时在光标处打开其 “⋯”（更多）菜单 |
| [packages/dsh-moyuu-session-write-lock](packages/dsh-moyuu-session-write-lock) | Node 层包：跨进程会话写锁，并发 profile 不会损坏共享会话 |
| [packages/dsh-moyuu-cmdk-new-session](packages/dsh-moyuu-cmdk-new-session) | 快捷键：Mod+K（Cmd+K / Ctrl+K）在 Web 界面新建会话 |
| [packages/dsh-moyuu-new-session-tooltip](packages/dsh-moyuu-new-session-tooltip) | 悬停 tooltip：新会话按钮显示文案与 ⌘K / Ctrl+K 快捷键提示 |
| [packages/dsh-moyuu-session-emoji](packages/dsh-moyuu-session-emoji) | Node 插件：会话标题 provider，用 LLM 挑选的 emoji 前缀为每个会话命名（替换默认 LLM 标题 provider） |

## 为什么用 monorepo

DSH 官方本身就是“每功能一包”（`@deepseek-ai/dsh-tool-*`、`dsh-client-ui-*`…）。功能包可以各自独立加入 / 移除：每个功能 = 一条依赖 + 一行 `cordis.patch.yml`。清单契约与加载路径见规则文档。

## 开发

```sh
pnpm install
node --check packages/dsh-moyuu-brand/client.js
node --check packages/dsh-moyuu-tab-in-textbox/client.js
node --check packages/dsh-moyuu-example/client.js
node --check packages/dsh-moyuu-session-write-lock/index.js
node --check packages/dsh-moyuu-cmdk-new-session/client.js
node --check packages/dsh-moyuu-new-session-tooltip/client.js
node --check packages/dsh-moyuu-session-emoji/index.js
```

## 安装 / 激活（以 web profile 为例）

每个功能独立安装、独立激活。开发时用 `link:` 指向本仓库内的包：

```jsonc
// ~/.dsh/profiles/web/package.json
"dependencies": {
  "dsh-moyuu-brand": "link:/path/to/dsh-moyuu/packages/dsh-moyuu-brand",
  "dsh-moyuu-example": "link:/path/to/dsh-moyuu/packages/dsh-moyuu-example"
}
```

```yaml
# ~/.dsh/profiles/web/cordis.patch.yml —— 只启用你想要的功能
- insert:
    - id: dsh-moyuu-brand
      name: 'dsh-moyuu-brand'
    - id: dsh-moyuu-example
      name: 'dsh-moyuu-example'
```

刷新 Web 界面生效。删掉某一行，就只停用那一个功能。

### Node 层包（服务端功能）

层包（如 `dsh-moyuu-session-write-lock`）通过 `dsh.profile.bundles` 接入，而不是
`cordis.patch.yml` 的一行 —— 它的 `dsh.bundle.patch` 会自动应用自己的 patch 行变更：

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

它修复什么问题、如何验证，见对应包的 README。

### Node 插件（通过 patch 行的服务端功能）

服务端功能（如 `dsh-moyuu-session-emoji`）是普通包，其 `index.js` 导出 `apply`；
通过在 `cordis.patch.yml` 里插入一行激活（无需 `dsh.bundle`）：

```yaml
# ~/.dsh/profiles/web/cordis.patch.yml —— 只启用你想要的功能
- insert:
    - id: dsh-moyuu-session-emoji
      name: 'dsh-moyuu-session-emoji'
      config:
        targetWords: 5
        targetCjkCharacters: 10
        maxInputBytes: 4096
        maxOutputTokens: 64
        timeoutMs: 60000
```

`dsh-moyuu-session-emoji` 还会 **替换默认的 LLM 标题 provider**（同一时刻只允许注册一个
会话标题 provider），因此它同时会停用 `session-title-llm` 那一行 —— 详见其包 README。
移除依赖 + 移除对应行，就只停用那一个功能。

## License

[MIT](LICENSE)
