# dsh-moyuu 使用指南（User Guide）

> 一份面向用户的 DSH 使用指南：把 [dsh-moyuu](https://github.com/suica/dsh-moyuu) 的 MOYUU 功能
> **合并进你自己的 profile**（挑着装、按需停用），或者**直接用我们配好的 `moyu` profile**（开箱即用）。

dsh-moyuu 是一套面向 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（`dsh`）的
**MOYUU 品牌插件套件**：一个功能 = 一个可独立加载 / 移除的 package（monorepo）。本指南只讲「怎么用」；
「怎么写新功能」见 [docs/PLUGIN-PACKAGE-RULES.zh.md](PLUGIN-PACKAGE-RULES.zh.md)。

## 速览：你的情况该走哪条路

| 你的情况 | 推荐路径 |
|---|---|
| 已有自己的 profile，只想加个别功能（如只想要 emoji 标题） | [路径 A：合并到自己的 profile](#5-路径-a合并到自己的-profile) |
| 想原样体验全部 MOYUU 功能，一条命令跑起来 | [路径 B：直接用我们的 profile（moyu）](#6-路径-b直接用我们的-profilemoyu) |
| 想开发 / 新增一个功能 | [docs/PLUGIN-PACKAGE-RULES.zh.md](PLUGIN-PACKAGE-RULES.zh.md) |

## 1. 这是什么

- **宿主**：DeepSeek Harness（`dsh`）——一个由「插件 bundle patch 层」按顺序叠加而成的 profile 运行时。
- **dsh-moyuu**：一套 MOYUU 品牌增强插件，**一个功能 = 一个 package，每个都能独立加入 / 移除**，互不干扰。
- 仓库结构：`packages/dsh-moyuu-<feature>/` 每个目录是一个功能包；仓库根是私有 workspace（不是插件）。

当前功能包：

| 包 | 形态 | 功能 |
|---|---|---|
| `dsh-moyuu-brand` | 客户端插件 | Web 左上角标识 "Harness" → "MOYUU"（成为 **DeepSeek MOYUU**） |
| `dsh-moyuu-tab-in-textbox` | 客户端插件 | 文本框内 Tab 插入制表符，不再跳转焦点 |
| `dsh-moyuu-session-context-menu` | 客户端插件 | 右键会话在光标处打开其 "⋯"（更多）菜单 |
| `dsh-moyuu-cmdk-new-session` | 客户端插件 | Mod+K（Cmd+K / Ctrl+K）在 Web 界面新建会话 |
| `dsh-moyuu-new-session-tooltip` | 客户端插件 | 悬停"新会话"按钮显示文案与 ⌘K / Ctrl+K 快捷键提示 |
| `dsh-moyuu-session-emoji` | 服务端插件 | 用 LLM 挑选的 emoji 前缀为会话命名（**替换**默认 LLM 标题 provider） |
| `dsh-moyuu-session-write-lock` | 层包（bundle） | 跨进程会话写锁，并发 profile 不会损坏共享会话 |
| `dsh-moyuu-example` | 客户端插件 | 示例：右下角小胶囊（新功能模板） |

## 2. 前置条件

1. **已安装 `dsh`**（DeepSeek Harness CLI）：`dsh --version` 能输出版本号。
   未安装时按 DeepSeek Harness 官方方式安装（例如 `npm i -g @deepseek-ai/dsh`）。
2. **已安装 `pnpm`**：profile 目录的依赖安装 / 插件管理（`dsh plugin`）都走 pnpm。
3. **profile 目录**：所有 profile 在 `$DSH_HOME/profiles/<name>` 下，默认 `$DSH_HOME=~/.dsh`。
   已经见过至少一次 `dsh web` / `dsh --profile <name>` 会**自动初始化** `web`、`headless` 两个模板 profile；
   其它名字的 profile 通过 `dsh plugin --profile <name> …` 自动创建。
4. **dsh-moyuu 源码（仅路径 A 需要自己 clone）**：功能包目前**没有发布到 npm**，也暂不能用 `pnpm add`
   从 git 子目录直接装包，所以要么自己 clone 后用 `link:` 指向本地包，要么直接走 [路径 B](#6-路径-b直接用我们的-profilemoyu)
   的一键安装脚本（脚本会自动维护一份托管 clone，用户零手动）：

   ```sh
   git clone https://github.com/suica/dsh-moyuu.git
   cd dsh-moyuu
   pnpm install        # 让 node 插件（session-emoji / session-write-lock）的 peer 依赖就位
   ```

   > 记下你的 clone 路径（下文统一写作 `<dsh-moyuu>`）。等功能包发布到 npm 后，可以直接
   > `dsh plugin --profile <name> add dsh-moyuu-<feature>`，无需 clone。

## 3. 核心心智模型：一个功能 = 一个包 = 一条依赖 + 一行激活

DSH 的 profile 由若干**配置层**叠加而成，加载顺序是：

```
dsh.profile.bundles（按顺序）  →  profile 的 cordis.patch.yml  →  $DSH_HOME/cordis.patch.yml  →  --patch 覆盖
```

给 profile 加功能只有两处要动：

1. **`package.json` 加依赖**（功能包本体）；
2. **`cordis.patch.yml` 加激活行**，或把层包追加进 `dsh.profile.bundles`。

按功能形态，生效方式不同：

| 形态 | 怎么激活 | 改完怎么生效 |
|---|---|---|
| 客户端插件（`dsh.client`） | `cordis.patch.yml` 里 `- insert:` 一行 | **刷新浏览器页面**（patch 层由 HMR 热监听，页面加载时注入客户端 bundle） |
| 服务端插件（`index.js` 导出 `apply`） | `cordis.patch.yml` 里 `- insert:` 一行 | **重启 profile** |
| 层包（`dsh.bundle.patch`） | 加依赖并追加进 `dsh.profile.bundles` | **重启 profile** |

> 删掉依赖 + 对应行/列表项，就只停用那一个功能，其余功能不受影响——这是分包的意义。

## 4. 功能总览表

| 包 | 形态 | 安装方式（当前未上 npm，用 `link:`） | 激活方式 | 生效 |
|---|---|---|---|---|
| `dsh-moyuu-brand` | client | `link:<dsh-moyuu>/packages/dsh-moyuu-brand` | patch 行 | 刷新 |
| `dsh-moyuu-tab-in-textbox` | client | `link:<dsh-moyuu>/packages/dsh-moyuu-tab-in-textbox` | patch 行 | 刷新 |
| `dsh-moyuu-session-context-menu` | client | `link:<dsh-moyuu>/packages/dsh-moyuu-session-context-menu` | patch 行 | 刷新 |
| `dsh-moyuu-cmdk-new-session` | client | `link:<dsh-moyuu>/packages/dsh-moyuu-cmdk-new-session` | patch 行 | 刷新 |
| `dsh-moyuu-new-session-tooltip` | client | `link:<dsh-moyuu>/packages/dsh-moyuu-new-session-tooltip` | patch 行 | 刷新 |
| `dsh-moyuu-session-emoji` | node 插件 | `link:<dsh-moyuu>/packages/dsh-moyuu-session-emoji` | patch 行（须禁用 `session-title-llm`） | 重启 |
| `dsh-moyuu-session-write-lock` | bundle | `link:<dsh-moyuu>/packages/dsh-moyuu-session-write-lock` | 追加进 `dsh.profile.bundles` | 重启 |
| `dsh-moyuu-example` | client | `link:<dsh-moyuu>/packages/dsh-moyuu-example` | patch 行 | 刷新 |

## 5. 路径 A：合并到自己的 profile

以默认的 `web` profile（`~/.dsh/profiles/web`）为例；换成你自己的 profile 名即可。

### 5.1 找到你的 profile

```sh
ls ~/.dsh/profiles          # 已有：web、headless、你创建过的其它名字
```

还没有想要的 profile？`dsh plugin` 会在首次使用时自动初始化（模板默认带 `@deepseek-ai/dsh-base`），
Web 界面 profile 需要再加 `@deepseek-ai/dsh-web-app`（见 5.4 的写法）。

### 5.2 客户端功能：依赖 + `cordis.patch.yml` 行

例：给 `web` profile 加「emoji 之外」的 Web 增强（品牌 + Tab + 快捷键）：

```jsonc
// ~/.dsh/profiles/web/package.json —— 只装你想要的功能
"dependencies": {
  "dsh-moyuu-brand": "link:<dsh-moyuu>/packages/dsh-moyuu-brand",
  "dsh-moyuu-tab-in-textbox": "link:<dsh-moyuu>/packages/dsh-moyuu-tab-in-textbox",
  "dsh-moyuu-cmdk-new-session": "link:<dsh-moyuu>/packages/dsh-moyuu-cmdk-new-session"
}
```

```yaml
# ~/.dsh/profiles/web/cordis.patch.yml —— 只启用你想要的功能
- insert:
    - id: dsh-moyuu-brand
      name: 'dsh-moyuu-brand'
    - id: dsh-moyuu-tab-in-textbox
      name: 'dsh-moyuu-tab-in-textbox'
    - id: dsh-moyuu-cmdk-new-session
      name: 'dsh-moyuu-cmdk-new-session'
```

然后见 [5.5 安装与生效](#55-安装与生效)。

> 想确认激活行没问题、又不启动：`dsh --profile web --dump-config` 会打印组合后的配置树（不启动 profile）。

### 5.3 服务端插件（node 插件）：依赖 + `cordis.patch.yml` 行

`dsh-moyuu-session-emoji` 是普通包，`index.js` 导出 `apply`，通过 patch 行激活。**注意它是标题 provider 的「替换」**——
`sessionTitle.register()` 同一时刻只允许注册一个 provider，所以必须**同时禁用默认的 `session-title-llm` 行**：

```jsonc
// ~/.dsh/profiles/web/package.json
"dependencies": {
  "dsh-moyuu-session-emoji": "link:<dsh-moyuu>/packages/dsh-moyuu-session-emoji"
}
```

```yaml
# ~/.dsh/profiles/web/cordis.patch.yml
- id: session-title-llm
  disabled: true

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

> 配置可调：`maxOutputTokens` 默认 64；若你的模型在生成标题前会先思考（如 deepseek-v4-flash），
> 预算太小会被思考消耗掉、截断标题——可调大（我们的 moyu profile 用 192，见第 6 节）。

### 5.4 层包（bundle）：依赖 + `dsh.profile.bundles`

`dsh-moyuu-session-write-lock` 是**配置层**，不走 patch 行，而是加依赖并**追加到 `dsh.profile.bundles`（放最后）**。
它的 `dsh.bundle.patch` 会自动禁用原生 `session-persistence-jsonl` 行、插入锁定后端：

```jsonc
// ~/.dsh/profiles/web/package.json
{
  "dependencies": {
    "dsh-moyuu-session-write-lock": "link:<dsh-moyuu>/packages/dsh-moyuu-session-write-lock"
  },
  "dsh": {
    "profile": {
      "bundles": [
        "@deepseek-ai/dsh-base",
        "@deepseek-ai/dsh-web-app",
        "dsh-moyuu-session-write-lock"
      ]
    }
  }
}
```

> 注意：若你的 `web` profile 目前 `dsh.profile.bundles` 只有 `["@deepseek-ai/dsh-base"]`（例如从未用过 Web），
> 记得补上 `@deepseek-ai/dsh-web-app`，否则启动的是没有 Web 界面的 profile。

### 5.5 安装与生效

```sh
cd ~/.dsh/profiles/web
pnpm install        # 让 link: 依赖与 peer 依赖就位
```

> 也可以用命令装依赖（自动写进 `package.json`；纯 client 包会提示 "no dsh.bundle"，属预期）：
>
> ```sh
> dsh plugin --profile web add link:/path/to/dsh-moyuu/packages/dsh-moyuu-brand
> ```

- **客户端功能**：刷新浏览器页面即生效（profile 无需重启）。
- **服务端插件 / 层包**：重启 profile 一次：

```sh
dsh --profile web --port 3080
```

### 5.6 移除功能

删掉 `cordis.patch.yml` 里对应的一行（或恢复 `session-title-llm` 的 `disabled: false` / 删掉 disabled 段、
把 bundle 从 `dsh.profile.bundles` 拿掉），再在 `package.json` 里移除依赖，然后 `pnpm install`。
只影响那一个功能，其它功能照常。

## 6. 路径 B：直接用我们的 profile（moyu）

`moyu` profile 是我们配好的**开箱即用** profile：全部 MOYUU 功能 + 默认模型配置，一次到位。
三种搭法任选其一。

### 6.1 一键安装（推荐）：直接从 GitHub 装，一条命令

不需要 clone、不需要手改任何路径。`scripts/install-moyu-profile.sh` 会从 GitHub clone 一份
dsh-moyuu 到托管目录（`~/.local/share/dsh-moyuu`，已存在则更新），再调用
`scripts/setup-moyu-profile.sh` 写好 profile 文件并执行 `pnpm install`：

```sh
curl -fsSL https://raw.githubusercontent.com/suica/dsh-moyuu/main/scripts/install-moyu-profile.sh | bash
dsh --profile moyu --port 3080            # 浏览器打开 http://127.0.0.1:3080
```

细节：

- 默认 profile 名 `moyu`，可传参改名：`… | bash -s 你的名字`；
- 托管副本位置可用 `DSH_MOYUU_DIR` 覆盖（默认 `~/.local/share/dsh-moyuu`）；
- 默认写入我们 profile 的默认 agent 模型行（`cliproxy` + `deepseek-v4-flash`）；没有 cliproxy 的机器重跑时加 `MOYU_AGENT_MODEL=0` 跳过该行；
- 重复运行 = 更新托管副本并重新写 profile（已存在的 profile 会被**覆盖**这三份文件）。

想自己先 clone 仓库再装（等价），或者要改源码开发时用：

```sh
git clone https://github.com/suica/dsh-moyuu.git
cd dsh-moyuu
bash scripts/setup-moyu-profile.sh        # 创建 ~/.dsh/profiles/moyu 并安装全部功能
dsh --profile moyu --port 3080
```

> 注：功能包目前未发布到 npm，也无法用 `pnpm add` 从 git 仓库子目录直接装包，所以一键脚本采用
> 「托管 clone + link: 安装」的方式——对用户来说仍然是**一条命令**、零手动复制。

### 6.2 手动搭建（参考：脚本会写入这些文件）

下面三份文件就是脚本 6.1 实际写入的内容，供**参考 / 定制**（一般不需要手动复制）：

**`~/.dsh/profiles/moyu/package.json`**（把 `<dsh-moyuu>` 换成你的 clone 路径）：

```json
{
  "name": "dsh-profile-moyu",
  "private": true,
  "dependencies": {
    "dsh-moyuu-brand": "link:<dsh-moyuu>/packages/dsh-moyuu-brand",
    "dsh-moyuu-session-write-lock": "link:<dsh-moyuu>/packages/dsh-moyuu-session-write-lock",
    "dsh-moyuu-session-context-menu": "link:<dsh-moyuu>/packages/dsh-moyuu-session-context-menu",
    "dsh-moyuu-cmdk-new-session": "link:<dsh-moyuu>/packages/dsh-moyuu-cmdk-new-session",
    "dsh-moyuu-new-session-tooltip": "link:<dsh-moyuu>/packages/dsh-moyuu-new-session-tooltip",
    "dsh-moyuu-session-emoji": "link:<dsh-moyuu>/packages/dsh-moyuu-session-emoji",
    "dsh-moyuu-tab-in-textbox": "link:<dsh-moyuu>/packages/dsh-moyuu-tab-in-textbox"
  },
  "dsh": {
    "profile": {
      "bundles": [
        "@deepseek-ai/dsh-base",
        "@deepseek-ai/dsh-web-app",
        "dsh-moyuu-session-write-lock"
      ]
    }
  }
}
```

**`~/.dsh/profiles/moyu/cordis.patch.yml`**：

```yaml
# MOYU Harness profile patch layer — applied after every bundle layer.

# MOYU brand: 把左上角标识换成 "DeepSeek MOYUU"。
- insert:
    - id: dsh-moyuu-brand
      name: 'dsh-moyuu-brand'

# 会话右键菜单：右键会话在光标处打开其 "⋯"（更多）菜单。
- insert:
    - id: dsh-moyuu-session-context-menu
      name: 'dsh-moyuu-session-context-menu'

# Mod+K 新建会话：页面任意位置按 Cmd+K / Ctrl+K 打开 New Session。
- insert:
    - id: dsh-moyuu-cmdk-new-session
      name: 'dsh-moyuu-cmdk-new-session'

# "新会话"按钮悬停 tooltip：文案 + ⌘K/Ctrl+K 快捷键提示。
- insert:
    - id: dsh-moyuu-new-session-tooltip
      name: 'dsh-moyuu-new-session-tooltip'

# 文本框内 Tab 插入制表符；文本框外 Tab 仍走全局焦点导航。
- insert:
    - id: dsh-moyuu-tab-in-textbox
      name: 'dsh-moyuu-tab-in-textbox'

# emoji 会话标题：替换默认 LLM 标题 provider（标题 provider 只允许注册一个），
# 因此禁用默认 session-title-llm 行。
- id: session-title-llm
  disabled: true

- insert:
    - id: dsh-moyuu-session-emoji
      name: 'dsh-moyuu-session-emoji'
      config:
        targetWords: 5
        targetCjkCharacters: 10
        maxInputBytes: 4096
        # 宽松 token 预算：deepseek-v4-flash 在生成标题前会先思考，预算太小会被思考消耗掉、截断标题。
        maxOutputTokens: 192
        timeoutMs: 60000

# 默认 agent 模型：cliproxy provider（同 ~/.codex/config.toml 的
# [model_providers.cliproxy]）+ DeepSeek 模型。没有 cliproxy 就把这整段删掉。
- id: agent-default-model
  name: '@deepseek-ai/dsh-agent-default-model'
  config:
    provider: cliproxy
    model: deepseek-v4-flash
```

**`~/.dsh/profiles/moyu/pnpm-workspace.yaml`**（与其它 profile 一致；也可用 6.3 的 `dsh plugin` 自动生成）：

```yaml
packages:
  - .

nodeLinker: hoisted
autoInstallPeers: false
```

然后安装并启动：

```sh
cd ~/.dsh/profiles/moyu
pnpm install
dsh --profile moyu --port 3080
```

浏览器打开 `http://127.0.0.1:3080` 即是我们配好的 MOYUU 界面。

### 6.3 从零初始化：用 `dsh plugin` 逐步搭

`dsh plugin --profile moyu <pnpm 参数>` 首次调用会自动初始化 profile 目录。等 npm 发布后逐步 `add`：

```sh
# 首次调用自动创建 moyu profile（含 pnpm-workspace.yaml）
dsh plugin --profile moyu add dsh-moyuu-session-write-lock
dsh plugin --profile moyu add dsh-moyuu-session-emoji
```

再按 [5.2](#52-客户端功能依赖--cordispatchyml-行) 的方式把各功能的激活行写进
`~/.dsh/profiles/moyu/cordis.patch.yml`。

> 纯 client 包（brand、tab-in-textbox…）只有 `dsh.client`、没有 `dsh.bundle`，
> `dsh plugin add` 会打印 `declares no dsh.bundle — installed as a plain dependency` ——
> 这是**预期行为**，客户端功能走 `cordis.patch.yml` 行激活，不需要成为 bundle 层。

### 6.4 启动与验证

- 启动：`dsh --profile moyu --port 3080`（`--port` 是 Web 应用的参数，不是 `dsh` 的）。
- 预览组合后的配置树（不启动）：`dsh --profile moyu --dump-config`。
- 全部功能同时生效（验证方法见 [第 7 节](#7-每个功能的验证与注意事项)）。

### 6.5 我们的 profile 里做了什么配置

- 7 个功能包全部启用（见 6.1 / 6.2 的两个文件）；
- `dsh-moyuu-session-write-lock` 以 bundle 层接入，共享会话跨 profile 安全；
- `dsh-moyuu-session-emoji` 替换默认 LLM 标题 provider（`session-title-llm` 被禁用）；
- 默认 agent 模型走 `cliproxy` + `deepseek-v4-flash`。

## 7. 每个功能的验证与注意事项

### 客户端功能（刷新页面后验证）

| 包 | 怎么验证 |
|---|---|
| `dsh-moyuu-brand` | 左上角标识变成 **DeepSeek MOYUU**（保留鲸鱼 logo 与 DeepSeek 字样） |
| `dsh-moyuu-tab-in-textbox` | 在聊天输入框 / 任意文本框里按 `Tab`，光标处插入制表符而不是焦点跳走；`Shift+Tab` 同样插入；文本框外 Tab 仍走全局焦点导航 |
| `dsh-moyuu-session-context-menu` | 侧边栏右键一个会话，在鼠标位置弹出该会话的 "⋯" 菜单（重命名 / 分叉 / 归档） |
| `dsh-moyuu-cmdk-new-session` | 页面任意位置按 `Cmd+K`（macOS）/ `Ctrl+K`（其它平台）新建会话；`Mod+Shift+K` / `Mod+Alt+K` 不拦截 |
| `dsh-moyuu-new-session-tooltip` | 悬停侧栏"新会话"按钮，出现本地化文案 + ⌘K/Ctrl+K 提示（折叠 / 展开都显示） |
| `dsh-moyuu-example` | 右下角出现 "MOYUU · example feature loaded" 小胶囊；`document.documentElement.dataset.moyuuExample` 为 `"active"` |

### 服务端功能（需重启 profile）

**`dsh-moyuu-session-emoji`**

1. 新建会话，发一条首条消息，例如「修复登录页的 bug」；
2. 等命名完成，侧边栏标题应为类似 `🔧 修复登录页的 bug` 的 emoji 前缀标题；
   英文首条消息如 "write an LRU cache" → `💻 write an LRU cache`。
3. 想停用：删依赖 + 删 `dsh-moyuu-session-emoji` 段，并恢复 `session-title-llm`（把 `disabled: true` 段删掉）。

**`dsh-moyuu-session-write-lock`**

1. 同时启动两个 profile（如 `dsh --profile moyu --port 3080` 与 `dsh --profile web --port 3090`）；
2. 两边打开同一工作区；在一个 profile 里创建 / 继续同一会话；
3. 确认另一个 profile 打开同一会话时**不再报 `SESSION_ADVANCED`**，两边的收尾事件幂等收敛、真正的新 turn 会被重排写入而不是被拒绝；
4. 会话日志始终结构有效（无重复 / 乱序 seq）。

## 8. FAQ

**Q：为什么 client 功能改 `cordis.patch.yml` 后，刷新页面就生效、不用重启 profile？**
A：profile 的 patch 层由 HMR 热监听（`watchUserPatches` 通过 Cordis HMR 注册 config watcher），改动即时重新组合；
客户端 bundle 在页面加载时由 `dsh-client-modules` 注入，所以刷新页面即可。**node 插件 / bundle 仍建议重启 profile 一次**，确保完整生效。

**Q：`dsh plugin add` 提示 "declares no dsh.bundle — installed as a plain dependency" 是出错了吗？**
A：不是。纯 client 包没有 `dsh.bundle`，这是预期提示；客户端功能用 `cordis.patch.yml` 的 insert 行激活，不需要成为 bundle 层。

**Q：为什么 `dsh-moyuu-session-emoji` 要禁用 `session-title-llm`？**
A：`sessionTitle.register()` 同一时刻只允许注册一个 provider。emoji 标题是**替换**默认 LLM 标题 provider，不是叠加。
不禁用会报 provider 冲突。

**Q：node 插件报 `ERR_MODULE_NOT_FOUND: Cannot find package '@deepseek-ai/schemastery'`？**
A：`link:` 安装时，Node 从包自身所在位置（monorepo worktree）解析 ESM import。请在 **dsh-moyuu 仓库根**执行一次 `pnpm install`，
让 session-emoji / session-write-lock 的 peer 依赖就位。发布安装（`dsh plugin add`）不会有这个问题。

**Q：`link:` 路径写不对 / 换机器了？**
A：`link:` 是绝对路径。最省事的是直接跑 6.1 的脚本——它按当前 checkout 路径自动生成，换机器后重跑一次即可；
手动改的话把 `<dsh-moyuu>` 占位换成真实路径，再 `cd ~/.dsh/profiles/<name> && pnpm install`。
等包发布到 npm 后，直接 `dsh plugin --profile <name> add dsh-moyuu-<feature>`，不再需要 clone 与 link。

**Q：想只停用某一个功能？**
A：删掉对应依赖 + 激活行（或把 bundle 移出 `dsh.profile.bundles`）。各功能互不耦合，移除一个不影响其它。

**Q：`dsh --profile <name> --port 8080` 中 `--port` 属于谁？**
A：`--port` 属于被启动的 Web 应用，不是 `dsh` 启动器；`dsh` 的 flag 必须写在最前面，其后参数全部交给 profile 的应用插件解析。

## 9. 下一步

- 想新增一个功能：读 [docs/PLUGIN-PACKAGE-RULES.zh.md](PLUGIN-PACKAGE-RULES.zh.md)（分包规则 + 「先动态迭代、再静态固化」开发工作流）。
- 想看单个包的实现细节：各 `packages/dsh-moyuu-<feature>/README(.zh).md`。
- 想了解 DSH profile 机制本身：`dsh --help` 与 `dsh --profile <name> --help`。
