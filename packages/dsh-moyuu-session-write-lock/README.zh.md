# dsh-moyuu-session-write-lock

**功能：跨进程会话写锁持久化后端。**

解决同时启动两个 dsh profile（如 `moyu` + `web`）共享同一个 `~/.dsh/sessions` 根目录时，并发写入导致会话**永久损坏**的问题。

## 功能说明

原生 JSONL 会话持久化后端（`@deepseek-ai/dsh-session-persistence-jsonl`）只在**单进程内**串行写者。两个 profile 同时运行 = 两个独立的写者、各自维护内存里的 seq 计数，于是并发追加同一个 `session.jsonl.zstd` 会帧交错 + seq 重复；一个进程的"撕裂尾崩溃修复"还会把另一个进程刚提交的帧 truncate 掉——会话永久损坏。

本包是其后端的一个子类，把所有物理写入（materialize / append / repair）包进**跨进程文件锁**（`<log>.lock`，`wx` 独占创建，按 PID 存活自动回收陈旧锁），并在追加前做**收敛式对账**（reconcile）：持锁重读当前持久化尾部，与本批事件逐条比对——

- 批次接在持久化尾部之后：正常追加；
- 批次开头的若干事件**已被另一进程提交**——内容相同，或是关闭同一被打断 turn 的收尾事件（`step/end` / `turn/end` / `session/end-seed`；现场写者记录真实的 abort/error `reason`，冷启动修复者记录合成的 `interrupted`，无论哪种 turn 都已关闭）——**幂等跳过**，所以**同时开多个 profile、对一个已存在会话继续对话不再报 "modified by another process; reload" 的错误**（修复了"reload 也没用"的问题）；
- 批次只有前缀已提交：只追加缺失的后缀（幂等收敛）；
- 与已提交事件争抢同一 seq 的**真正新事件**（如另一个 profile 修复日志期间用户发来的新 turn）会被**重新排序（re-sequenced）**到持久化尾部之后再写入——**滞后的写者收敛而不是失败**：不抛 `SESSION_ADVANCED`、不丢任何消息，且其内存游标始终跟自己的会话对齐，后续追加照常流动。

崩溃修复同样在锁内对账：只有当前文件仍在该调用方观察到的撕裂边界处撕裂时才会 truncate，保证一个进程永远不会 truncate 掉另一进程刚提交的帧。

效果：会话仍然**跨 profile 共享**（不做每 profile 隔离），并发访问安全——同一会话可在任意多个 profile 打开/读取，滞后的写者会自动与最新持久化状态收敛，无需手动重载。

## 安装与激活

把本包加入 profile 依赖，并追加到 `dsh.profile.bundles`（放最后）。其 `dsh.bundle.patch`（`cordis.patch.yml`）会自动禁用原生 `session-persistence-jsonl` 行、插入本锁定后端：

```json
{
  "dependencies": {
    "dsh-moyuu-session-write-lock": "link:../dsh-moyuu/packages/dsh-moyuu-session-write-lock"
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

然后在 profile 目录 `pnpm install` 并重启 profile。移除依赖 + bundle 行即停用该功能、恢复原生后端。

> 本地 monorepo 开发用 `link:`（如上）。发布安装用 `dsh plugin --profile <name> add dsh-moyuu-session-write-lock`，会自动加依赖并对账 bundle 列表。

## 如何验证

1. 同时启动两个 web profile（`dsh --profile moyu --port 3080`、`dsh --profile web --port 3090`）。
2. 两边打开同一工作区；在一个 profile 里创建/继续同一会话。
3. 确认另一个 profile 打开同一会话时**不再报** `SESSION_ADVANCED`，并且**两边都开着时对一个已存在会话继续对话不再报错**：两个 profile 的收尾事件幂等收敛（后写者跳过冗余收尾），真正的新 turn 会重排到持久化日志之后而不是被拒绝。
4. 会话日志始终保持结构有效（无重复 / 乱序 seq），即便另一个 profile 的修复在滞后写者两次读取之间推进了日志，用户消息也不会被丢弃。

开发期冒烟测试：

```sh
node --check index.js
node test/converge.mjs
node test/reproduce.mjs
```

## 对等依赖

以 `peerDependencies` 声明宿主 harness 包，运行时经 profile 模块 fallback 解析到已安装的 harness 版本：

- `@deepseek-ai/dsh-session-persistence-jsonl`
- `@deepseek-ai/dsh-session`

## License

[MIT](../../LICENSE)
