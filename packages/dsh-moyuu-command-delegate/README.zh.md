# dsh-moyuu-command-delegate

**功能：把 `subagent` / `workflow` / `ralph` 三个委派工具暴露为显式斜杠命令**——`/subagent <prompt>`、`/workflow <script>`、`/ralph <objective> [maxRounds]`。

每条命令都**经由接收方 agent 的模型可见路径进行 steering**：处理器向 agent 的下一步注入一条显式的 user-role 指令，让模型用完全相同的参数去调用对应的委派工具，然后立即返回。真正的执行发生在一次普通的模型工具调用里（自带工具卡片、审批、后台处理）。

## 为什么用 steering 而不是直连引擎

`subagents` 是全局宿主服务，但 `workflowEngine` 被挂载在 agent 预设的 `delegation` 组里，作为**隔离 realm**。一个普通 preset 挂载的插件行——或挂在宿主根上的动态插件——都无法解析 `workflowEngine`，所以 `/workflow` 除非被组合进那个组，否则无法直连引擎。steering 让本包自包含、与 preset 无关：只要存在 `commands` 服务就能工作。

## 安装 / 激活

把包加入某个 profile 的依赖，并作为服务端插件行激活（见 `docs/PLUGIN-PACKAGE-RULES.zh.md`）：

```yaml
- insert:
    - id: dsh-moyuu-command-delegate
      name: 'dsh-moyuu-command-delegate'
```

## 已知限制 / bug（WIP —— 暂不合入）

本包处于开发中。已知问题：

1. **steering 会把指令作为用户消息塞进对话。** 注入的指令——包括粘贴的 `/workflow` 脚本——会原样以用户消息出现在对话里。模型随后必须真的去调用工具；没有任何机制保证它这么做。
2. **执行不确定。** 命令本身不跑引擎，依赖模型选择调用工具。模型可能改写、拒绝或复述请求。
3. **`/workflow` 无法直连工作流引擎。** 因为 `workflowEngine` 是 agent 隔离的，本包只能*请求模型*去跑 `workflow` 工具。直连执行需要把插件组合进 agent 预设的 `delegation` 组（`isolate: { workflowEngine: true }`），这属于部署相关，超出了普通 preset 包的范围。
4. **长前台运行。** 一旦模型跑起 `/ralph`（或大型 `/workflow`），循环 / 脚本会阻塞较长时间，而命令本身不提供中间反馈。
5. **尚未在真实会话中端到端验证。** 本包组合能干净挂载，但命令尚未在真实 agent 会话里确认可用。

## License

MIT
