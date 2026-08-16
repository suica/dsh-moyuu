# dsh-moyuu-session-emoji

**功能：会话命名期 emoji 标题 provider。**

在会话取名（第一条用户消息）时，本插件产出形如 `💻 写一个 LRU 缓存`、`🐛 修复登录态丢失`、`🚀 deploy to production` 的会话标题——**emoji 由 LLM 根据消息主题选定**，后接短标题，让侧边栏一眼可扫。

## 功能说明

DSH 的会话标题由 `sessionTitle` 服务生成（`@deepseek-ai/dsh-session-title`），写入日志事件 `session/title` 并持久化。默认 profile 里 `session-title-llm` 用 LLM 总结首条消息生成标题。

本包注册**唯一的** session-title provider，且是**首条消息的模型 provider**：它走与 `session-title-llm` 完全相同的辅助 LLM 标题管线，但换了一条自定义 system prompt，指示模型返回**以「一个贴合主题的 emoji + 空格」开头的简洁标题**。emoji 由模型按消息主题自行决定，标题质量保持在 LLM 水准——不再依赖脆弱的规则表，标题始终使用消息的语言。

> **重要**：`sessionTitle.register()` 同一时刻只允许注册**一个** provider，因此启用本功能必须**禁用默认的 `session-title-llm` 行**（见下）。这是标题 provider 的**替换**而非叠加——标题管线（路由、超时、字节预算）与默认完全一致。

## 配置

与默认 `session-title-llm` 行使用同一套模型标题配置键（`Config` schema 复用 `SessionTitleLlmConfigFields`）：

| 键 | 默认 | 含义 |
|---|---|---|
| `targetWords` | `5` | 非 CJK 标题目标词数（不含 emoji） |
| `targetCjkCharacters` | `10` | CJK 标题目标字数（不含 emoji） |
| `maxInputBytes` | `4096` | 输入帧字节上限 |
| `maxOutputTokens` | `64` | 标题响应 token 上限 |
| `timeoutMs` | `60000` | 辅助调用超时 |
| `provider` / `model` | *（省略）* | 可选显式路由；省略时使用已记录的主请求路由 |

## 安装与激活

把本包加入 profile 依赖，并在 `cordis.patch.yml` 中**禁用默认 LLM 标题 provider**、插入本插件（含配置）：

```json
{
  "dependencies": {
    "dsh-moyuu-session-emoji": "link:../dsh-moyuu/packages/dsh-moyuu-session-emoji"
  }
}
```

```yaml
# cordis.patch.yml —— 替换默认 LLM 标题 provider（只允许注册一个 provider）
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

然后 profile 目录 `pnpm install` 并重启 profile。移除依赖 + 上面两段即停用该功能、恢复默认 LLM 标题。

> 本地 monorepo 开发用 `link:`（如上）。发布安装用 `dsh plugin --profile <name> add dsh-moyuu-session-emoji`。

## 如何验证

1. 按上文激活并重启 profile。
2. 新建会话，发一条首条消息，例如「修复登录页的 bug」。
3. 等待命名完成（首条消息接受后），侧边栏会话标题应显示为类似 `🐛 修复登录页的 bug`（具体 emoji 由模型选择）。
4. 英文首条消息如 "write an LRU cache"，应得到类似 `💻 write an LRU cache` 的标题。

开发期冒烟测试：

```sh
node --check index.js
```

## 对等依赖

以 `peerDependencies` 声明宿主 harness 包，运行时经 profile 模块 fallback 解析到已安装的 harness 版本：

- `@deepseek-ai/dsh-session-title`（提供 `sessionTitle` 服务与 provider 契约）
- `@deepseek-ai/dsh-session-title-llm`（共享配置校验与超时策略）
- `@deepseek-ai/dsh-llm`（LLM 流与块组装）
- `@deepseek-ai/dsh-timeout`（deadline）
- `@deepseek-ai/schemastery`（loader 配置 schema）
- `@deepseek-ai/cordis`

## License

[MIT](../../LICENSE)
