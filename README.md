# dsh-moyuu

[English](README.en.md) | 简体中文

本仓库是 **pnpm monorepo**：**一个功能 = 一个 package，每个 package 都可以独立加载 / 移除**。
分包强制规则见 [docs/PLUGIN-PACKAGE-RULES.zh.md](docs/PLUGIN-PACKAGE-RULES.zh.md)。

📖 想直接用？先读 [使用指南](docs/USAGE.zh.md)——把它合并进你自己的 profile（挑着装），或直接用我们配好的 `moyu` profile（开箱即用）。

## 快速开始（Quick start）

**方式一：直接用我们的 `moyu` profile（全部功能开箱即用，一条命令）**

```sh
curl -fsSL https://raw.githubusercontent.com/suica/dsh-moyuu/main/scripts/install-moyu-profile.sh | bash
dsh --profile moyu --port 3080       # 浏览器打开 http://127.0.0.1:3080
```

脚本会从 GitHub clone 一份 dsh-moyuu 到 `~/.local/share/dsh-moyuu`（已存在则更新），
写好 profile 文件并执行 `pnpm install`。想自己先 clone 仓库再装也行：
`git clone https://github.com/suica/dsh-moyuu.git && cd dsh-moyuu && bash scripts/setup-moyu-profile.sh`。

**方式二：合并进你自己的 profile（只加想要的功能）**

```sh
# 在 ~/.dsh/profiles/web 安装依赖（自动写入 package.json；client 包提示 "no dsh.bundle" 属预期）
dsh plugin --profile web add link:/path/to/dsh-moyuu/packages/dsh-moyuu-brand
```

再给 `~/.dsh/profiles/web/cordis.patch.yml` 加一行激活：

```yaml
- insert:
    - id: dsh-moyuu-brand
      name: 'dsh-moyuu-brand'
```

客户端功能**刷新页面**即生效；服务端功能**重启 profile**。完整的两条路径、逐功能激活 / 验证 / 移除与 FAQ 见 [使用指南](docs/USAGE.zh.md)。

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

## 自迭代开发工作流（先动态迭代，再静态固化）

给 profile 加插件是**静态组合**改动（依赖 + `cordis.patch.yml` 行），静态组合只在启动时读取，
所以**每次改动都要重启 profile**——而重启会终止当前会话，agent 一旦依赖重启就无法自迭代。

因此拆成两条回路：

1. **热迭代回路（不重启）**：先用 DSH 的**动态插件**机制把功能在活进程里做出来、调通
   （定义 → 激活 → 看诊断 → 修 → 再激活，出错在同一插件上修复、可回滚）。
   动态插件是临时的，进程重启即消失，只负责迭代、不负责持久。
2. **固化回路（每个功能只做一次）**：功能稳定后新建 `packages/dsh-moyuu-<feature>/`、
   加 profile 依赖 + `cordis.patch.yml` 行，然后**重启 profile 一次**（node 插件）
   或**刷新页面**（纯 client 插件）。

于是“重启 profile”从“每次迭代”变成“每个功能只做一次”。详细规则见
[docs/PLUGIN-PACKAGE-RULES.zh.md](docs/PLUGIN-PACKAGE-RULES.zh.md) 第 9 节。

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
