# dsh-moyuu-session-write-sync

**功能：会话写入同步——跨进程会话写锁的消费侧。**

把锁后端的“静默拒绝”变成可见的、契约化的冲突信号，让两个同时运行的 dsh
profile（如 `moyu` + `web`）共享同一个 `~/.dsh/sessions` 根目录时，写入既不会
静默丢失，也不会损坏。

## 它做什么

锁后端（`dsh-moyuu-session-write-lock`）跨进程串行化写入者，并在检测到陈旧写入
时抛出独立的 `SESSION_ADVANCED` 错误，而不是写坏共享日志。但“单纯拒绝”对输方
进程是不可见的：coordinator 的后台 write-behind 通过 `reportBackgroundFailure`
报告失败，那只是打一条警告日志、并把陈旧事件保留在暂停的缓冲里。

本包堆叠在锁后端之上，在物理写入边界（`appendBatch`）补上**消费层**：

- **`SESSION_ADVANCED`**（另一进程已推进日志——真正的冲突）：在后端 `ctx` 上
  发出一次性的、按会话去重的 `session/sync-conflict` 事件，并打一条清晰警告。
  写入仍然失败——持久化日志里已经是胜方的事件，绝不去动它。
- **`SESSION_LOCK_TIMEOUT`**（锁竞争瞬时超时——**不是**冲突）：只打一条独立的
  “contention”提示，**不**发 `session/sync-conflict`，避免消费侧因此触发无谓的
  reload。
- 其它错误原样透传。

结果：持久化日志保持完好（胜方事件就是历史），输方的陈旧缓冲保持暂停（沿用
coordinator 现有的失败保留），冲突被抛给 UI / 其它插件去处理——锁 README 里承诺
的 “reload” 变成一个具体、可观察的契约。

## 安装与激活

把**两个**包都加进 profile 依赖和 `dsh.profile.bundles`（sync 放在 lock 之后）：

```json
{
  "dependencies": {
    "dsh-moyuu-session-write-lock": "link:../dsh-moyuu/packages/dsh-moyuu-session-write-lock",
    "dsh-moyuu-session-write-sync": "link:../dsh-moyuu/packages/dsh-moyuu-session-write-sync"
  },
  "dsh": {
    "profile": {
      "bundles": [
        "@deepseek-ai/dsh-base",
        "@deepseek-ai/dsh-web-app",
        "dsh-moyuu-session-write-lock",
        "dsh-moyuu-session-write-sync"
      ]
    }
  }
}
```

然后在 profile 目录 `pnpm install` 并重启 profile。移除 sync 的依赖 + bundle 行即
恢复为纯锁后端；两个都移除则恢复原厂后端。

> `dsh-moyuu-session-write-sync` 继承 `dsh-moyuu-session-write-lock`，因此锁包
> 是约定好的共享基础包（monorepo 规则：跨功能协作走契约，禁止依赖兄弟功能包——
> 锁包是基础原语而非功能包）。

## 事件契约

在后端 `ctx`（node 侧）上发出：

```
ctx.on("session/sync-conflict", (detail) => { ... })
// detail = { id, code: "SESSION_ADVANCED", message, at }
```

- 每个会话 id **最多发一次**，直到该会话在本 profile 被（重新）创建（即
  `session/created` 重置——reload 之后）。
- 后续可做 client half（Web 横幅）把该事件桥接到浏览器，提示“该会话已被另一进程
  修改——reload 以继续”。

## 如何验证

1. 启动两个 web profile（`dsh --profile moyu --port 3080`、`dsh --profile web --port 3090`）。
2. 两边打开同一 workspace，在一边创建/继续一个会话。
3. 确认另一侧写入同一会话被 `SESSION_ADVANCED` 拒绝、`session/sync-conflict`
   事件触发，且会话日志结构完好（无重复/乱序 `seq`）。

自动冒烟测试（无需启动 dsh——用两个后端实例对着一个临时日志跑真实
coordinator + lock + sync 全链路）。先建好测试所需的 node_modules 符号链接
（gitignore，仅本地开发）：

```sh
./test/setup.sh      # 仅本地开发；创建 node_modules 符号链接
node --check index.js
node test/smoke.mjs
```

## 已知限制（后续工作）

输方的内存**视图**不会原地改写：本 profile 停止写入该会话，用户 reload 后从胜方
状态继续。真正的“原地 cursor rebase”需要 dsh 核心提供 coordinator 级原语，刻意
不在本包范围内。

## Peer 依赖

对宿主 harness 包声明为 `peerDependencies`（运行时经 profile 模块回退解析），
外加约定好的共享基础包：

- `dsh-moyuu-session-write-lock`
- `@deepseek-ai/dsh-session-persistence-jsonl`
- `@deepseek-ai/dsh-session`

## License

[MIT](../../LICENSE)
