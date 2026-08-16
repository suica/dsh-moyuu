# dsh-moyuu

[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（`dsh`）的 **MOYUU 品牌插件套件**。

本仓库是 **pnpm monorepo**：**一个功能 = 一个 package，每个 package 都可以独立加载 / 移除**。
分包强制规则见 [docs/PLUGIN-PACKAGE-RULES.zh.md](docs/PLUGIN-PACKAGE-RULES.zh.md)。

## 功能包列表

| Package | 功能 |
|---|---|
| [packages/dsh-moyuu](packages/dsh-moyuu) | 品牌：Web 左上角标识 “Harness” → “MOYUU” |
| [packages/dsh-moyuu-tab-in-textbox](packages/dsh-moyuu-tab-in-textbox) | 键盘：文本框内 Tab 插入制表符，不再跳转焦点 |
| [packages/dsh-moyuu-example](packages/dsh-moyuu-example) | 示例：最小可独立加载的客户端插件（新功能的模板） |
| [packages/dsh-moyuu-cmdk-new-session](packages/dsh-moyuu-cmdk-new-session) | 快捷键：Mod+K（Cmd+K / Ctrl+K）在 Web 界面新建会话 |
| [packages/dsh-moyuu-new-session-tooltip](packages/dsh-moyuu-new-session-tooltip) | 悬停 tooltip：新会话按钮显示文案与 ⌘K / Ctrl+K 快捷键提示 |

## 为什么用 monorepo

DSH 官方本身就是“每功能一包”（`@deepseek-ai/dsh-tool-*`、`dsh-client-ui-*`…）。功能包可以各自独立加入 / 移除：每个功能 = 一条依赖 + 一行 `cordis.patch.yml`。清单契约与加载路径见规则文档。

## 开发

```sh
pnpm install
node --check packages/dsh-moyuu/client.js
node --check packages/dsh-moyuu-tab-in-textbox/client.js
node --check packages/dsh-moyuu-example/client.js
node --check packages/dsh-moyuu-cmdk-new-session/client.js
node --check packages/dsh-moyuu-new-session-tooltip/client.js
```

## 安装 / 激活（以 web profile 为例）

每个功能独立安装、独立激活。开发时用 `link:` 指向本仓库内的包：

```jsonc
// ~/.dsh/profiles/web/package.json
"dependencies": {
  "dsh-moyuu": "link:/path/to/dsh-moyuu/packages/dsh-moyuu",
  "dsh-moyuu-example": "link:/path/to/dsh-moyuu/packages/dsh-moyuu-example"
}
```

```yaml
# ~/.dsh/profiles/web/cordis.patch.yml —— 只启用你想要的功能
- insert:
    - id: dsh-moyuu
      name: 'dsh-moyuu'
    - id: dsh-moyuu-example
      name: 'dsh-moyuu-example'
```

刷新 Web 界面生效。删掉某一行，就只停用那一个功能。

## License

[MIT](LICENSE)
