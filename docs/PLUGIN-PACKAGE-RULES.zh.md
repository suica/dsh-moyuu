# DSH 插件分包规则（Plugin Package Rules）

> **一句话：一个功能 = 一个 package，每个 package 都可以独立加载 / 卸载，互不影响。**
>
> 本文件是 dsh-moyuu 仓库所有 dsh 插件开发的强制规则。以中文为准，关键术语附英文对照。

## 0. 结论：可行（Feasibility — Yes）

DSH 官方本身就是“每功能一包、独立加载”的架构，本仓库只是沿用同一套机制，无需改动 DSH 本体：

- 官方生态里每个工具 / 命令 / UI 功能都是独立 npm 包：`@deepseek-ai/dsh-tool-*`、`@deepseek-ai/dsh-command-*`、`@deepseek-ai/dsh-client-ui-*`、`@deepseek-ai/dsh-compaction-*` 等。
- 一个 profile（如 `web`）由若干 patch 层叠加而成：`dsh.profile.bundles` 按序组合各 bundle，再叠加用户 `cordis.patch.yml`（见 `@deepseek-ai/dsh`）。
- 一个包通过 package.json 声明自己是哪类插件：
  - `dsh.bundle`（node 端）→ 装包后自动成为 profile 的配置层，进入 `dsh.profile.bundles`。
  - `dsh.client`（`platform: "web"`）→ 浏览器端插件，由 `dsh-client-modules` 自动扫描 `exports["./client"]` 发现、构建，并在 `/plugins` 下提供给浏览器。
- 客户端插件 bundle 通过 `window.__ModuleLoader__.load({ id, factory })` 注册，factory 惰性物化，加载顺序无需外部编排。
- 因此：**加入一个依赖（或一行 patch）＝ 激活一个功能；移除 ＝ 停用该功能**，各功能互不耦合。

## 1. 粒度（Granularity）

1. 每个 package 只做一个功能 / 关注点（brand、theme、某个工具、某条命令、某块 UI 面板…）。
2. 一个功能必须能够独立激活、停用、移除，且不影响其它功能。
3. 判断标准：把某个包整体移除后，其它功能既不报错、也不缺失行为。
4. 禁止把多个不相关功能塞进同一个包；新增功能 = 新建包。

## 2. 包的三种形态（Package shapes）

| 形态 | package.json 声明 | 作用端 | 如何被加载 |
|---|---|---|---|
| 客户端插件（client plugin） | `dsh.client` | 浏览器 | 被 profile 依赖并启用后，由 `dsh-client-modules` 扫描 `exports["./client"]` 注入 |
| 服务端插件（node plugin） | 无；`index.js` 导出 `apply` | Node | 在 `cordis.patch.yml` 插入一行 `- insert: - id: <包名>` |
| 层包（bundle） | `dsh.bundle.patch` | Node（配置层） | `dsh plugin add` 后自动进入 `dsh.profile.bundles` |

- 一个包可以同时含 node + client 两个 half（如品牌包：`index.js` 空 `apply` + `client.js` 浏览器逻辑）。

## 3. package.json 清单（Manifest contract）

```json
{
  "name": "dsh-moyuu-<feature>",
  "version": "0.1.0",
  "type": "module",
  "main": "index.js",
  "exports": {
    ".": "./index.js",
    "./client": "./client.js",
    "./package.json": "./package.json"
  },
  "dsh": {
    "client": {
      "platform": "web",
      "inject": [],
      "immediately": true
    }
  }
}
```

硬性规则：

- `name`：`dsh-moyuu-<feature>`（kebab-case 小写），且必须与激活 id、`__ModuleLoader__.load` 的 `id` 完全一致。
- 客户端功能必须有 `exports["./client"]` 并声明 `dsh.client`；`platform` 固定 `"web"`。
- `dsh.client.inject`：需要先于本包加载的其它插件 id 列表；无依赖填 `[]`。
- `dsh.client.immediately`：`true` = 激活时立即执行 `apply`。
- 层包追加 `"dsh": { "bundle": { "patch": "./cordis.patch.yml" } }` 并在 exports 中提供该文件。
- `index.js` 导出 `apply`（服务端 half；纯客户端功能可为空实现，见品牌包）。
- `client.js` 用 `window.__ModuleLoader__.load({ id, factory })` 注册；`factory` 返回 `module.exports = { apply, inject }`。

## 4. 独立加载（Independent loading）

浏览器端功能（`dsh.client`）：

1. 把包加入 profile 依赖（本地 monorepo 开发用 `link:` 指向 `packages/<feature>`）：
   ```json
   "dependencies": {
     "dsh-moyuu-<feature>": "link:/path/to/dsh-moyuu/packages/dsh-moyuu-<feature>"
   }
   ```
2. 在 `~/.dsh/profiles/<name>/cordis.patch.yml` 激活：
   ```yaml
   - insert:
       - id: dsh-moyuu-<feature>
         name: 'dsh-moyuu-<feature>'
   ```
3. 刷新 Web UI → 该功能生效；删除这一行并移除依赖 → 功能停用，其余功能不受影响。

层包（`dsh.bundle`）：

```sh
dsh plugin --profile <name> add git+https://github.com/suica/dsh-moyuu.git
```

装包后自动写入 `dsh.profile.bundles`；移除依赖即移除该配置层。

> 注意：只声明 `dsh.client`（没有 `dsh.bundle`）的包，`dsh plugin` 会提示 `declares no dsh.bundle` 并当作普通依赖安装——这是预期行为，浏览器功能走上面的 patch 行激活路径，不需要成为 bundle 层。

## 5. 依赖规则（Dependency rules）

1. 功能包只依赖平台 / 核心包（`@deepseek-ai/dsh-*`、`@deepseek-ai/cordis` 等）或 monorepo 内明确约定的共享基础包；**禁止依赖其它功能包**。
2. 跨功能协作走契约（service / event / settings），不直接 import 兄弟功能包。
3. 版本：monorepo 用单一 lockfile；依赖与 peerDependencies 显式声明。
4. `dsh.client.inject` 只用于声明加载顺序，不构成功能耦合。

## 6. 仓库结构（Monorepo layout）

```
dsh-moyuu/
├── pnpm-workspace.yaml                  # packages/*
├── package.json                         # 私有 workspace 根（本身不是插件）
├── docs/
│   └── PLUGIN-PACKAGE-RULES.zh.md       # 本规则
└── packages/
    ├── dsh-moyuu/                       # 功能：品牌（wordmark）
    └── dsh-moyuu-example/               # 功能：示例（独立加载的最小样例）
```

每个功能包自包含：`package.json` + `index.js` + `client.js` + `README(.zh).md`（+ `LICENSE`）。
新增功能 = 新建 `packages/dsh-moyuu-<feature>/`，禁止塞进已有包。

## 7. 生命周期与发布（Lifecycle & release）

- 提交遵循 Conventional Commits；改动经 worktree + PR 合入 main（见 AGENTS.md）。
- 每个功能包可独立发布到 npm（发布时把 `private` 置 `false`），或继续按 git / link 安装。
- 每个包的 README 必须写明：这个功能是什么、如何独立安装与激活、如何验证。

## 8. 质量门（Quality gates）

1. 客户端 bundle 保持纯净：构建期不得 import 外部资源，运行时依赖 `__ModuleLoader__` 惰性加载。
2. 插件注入的样式 / 节点必须带 `data-plugin="<包名>"`（样式另加 `data-plugin-css`），保证 HMR 可卸载、问题可排查。
3. 服务端 `apply(ctx)` 只经 ctx 提供的服务做事：不写全局状态、不直接动 DOM（浏览器的事交给 client half）。
4. 每个包自测：`node --check <file>` 通过；在真实 GUI 刷新后验证该功能出现，且移除后其它功能完好。
