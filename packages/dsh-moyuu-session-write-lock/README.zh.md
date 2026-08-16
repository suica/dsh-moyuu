# dsh-moyuu-session-write-lock

**功能：跨进程会话写锁持久化后端。**

解决同时启动两个 dsh profile（如 `moyu` + `web`）共享同一个 `~/.dsh/sessions` 根目录时，并发写入导致会话**永久损坏**的问题。

## 功能说明

原生 JSONL 会话持久化后端（`@deepseek-ai/dsh-session-persistence-jsonl`）只在**单进程内**串行写者。两个 profile 同时运行 = 两个独立的写者、各自维护内存里的 seq 计数，于是并发追加同一个 `session.jsonl.zstd` 会帧交错 + seq 重复；一个进程的"撕裂尾崩溃修复"还会把另一个进程刚提交的帧 truncate 掉——会话永久损坏。

本包是其后端的一个子类，把所有物理写入（materialize / append / repair）包进**跨进程文件锁**（`<log>.lock`，`wx` 独占创建，按 PID 存活自动回收陈旧锁），并在追加前做**持久化尾部 seq 对账**：若另一进程已推进日志，则以 `SESSION_ADVANCED`（"会话已被其它进程修改，请重载"）拒绝本次追加，而不是写出重复 seq。

效果：会话仍然**跨 profile 共享**（不做每 profile 隔离），并发访问安全——同一会话可在任意多个 profile 打开/读取，但同一时刻只有一个 profile 写它。

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
3. 确认另一个 profile 对同一会话的写入被 `SESSION_ADVANCED` 拒绝（需重载），而不是损坏日志。
4. 会话日志始终保持结构有效（无重复 / 乱序 seq）。

开发期冒烟测试：

```sh
node --check index.js
```

## 对等依赖

以 `peerDependencies` 声明宿主 harness 包，运行时经 profile 模块 fallback 解析到已安装的 harness 版本：

- `@deepseek-ai/dsh-session-persistence-jsonl`
- `@deepseek-ai/dsh-session`

## License

[MIT](../../LICENSE)
