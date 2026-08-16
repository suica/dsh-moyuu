# AGENTS.md

本文件定义 AI Agent（及人类协作者）在本仓库工作时的强制规则。
遵守优先级从高到低：本文件 > 用户即时指令 > 一般编程习惯。

## 核心工作流：Worktree + PR

1. **一切改动必须在 worktree 中进行，禁止直接改 main**
   - 禁止在 main 检出目录（主工作区）内直接修改、提交任何文件。
   - 每个任务都必须先从 main 创建一个独立的 git worktree 并在其中完成开发、自测与提交。
   - main 分支始终保持在可发布状态，只通过合并 Pull Request 接收变更。

2. **worktree 分支命名**
   - 分支名格式：`worktree/<type>/<描述>`
   - 例如：`worktree/feat/add-search`、`worktree/fix/brand-svg-layout`、`worktree/docs/readme-zh`
   - `<type>` 取值建议：`feat` / `fix` / `refactor` / `docs` / `chore` / `perf` / `test`
   - `<描述>` 用简短 kebab-case（小写、连字符分隔），能看懂即可。

3. **通过 Pull Request 合入 main**
   - 在 worktree 内完成改动后，用规范提交信息提交（见下）。
   - 将分支推送到远端（`git push -u origin <分支名>`），并创建指向 `main` 的 Pull Request。
   - PR 必须通过 CI/检查并经过评审后才可合并（Squash 合并）。
   - 合并后及时清理：删除远端分支与本地 worktree（`git worktree remove`）。

## 操作示例

```sh
# 1. 从 main 创建 worktree 分支（放在仓库外的兄弟目录）
git worktree add -b worktree/feat/my-change ../dsh-moyuu-wt main

# 2. 在 worktree 中工作
cd ../dsh-moyuu-wt
# ...修改代码、自测、提交...

# 3. 推送并开 PR
git push -u origin worktree/feat/my-change
# 在 GitHub 上创建 PR 到 main

# 4. 合并后清理
git worktree remove ../dsh-moyuu-wt
git push origin --delete worktree/feat/my-change
```

## 提交信息规范

- 遵循 Conventional Commits：`<type>(<scope>): <subject>`
- `<type>` 与分支中的 `<type>` 保持一致（feat / fix / docs / refactor / chore / perf / test）。
- 示例：`feat: add search box to landing page`、`fix(web): correct MOYUU wordmark layout`

## 其他

- 不提交机密信息、凭据或大体积二进制文件。
- 修改涉及多文件时，提交粒度以"一个逻辑改动一次提交"为准。
- 如需扩展本规则，请通过正常 PR 流程修改本文件。
