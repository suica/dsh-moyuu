# dsh-moyuu-input-history

[dsh-moyuu](https://github.com/suica/dsh-moyuu) monorepo 的**输入框**功能包——[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（`dsh`）的**客户端插件**，为聊天输入框增加「按当前会话隔离的 prompt 历史」。

> Monorepo 规则：一个功能 = 一个可独立加载的 package。见 [docs/PLUGIN-PACKAGE-RULES.zh.md](../../docs/PLUGIN-PACKAGE-RULES.zh.md)。

## 它做了什么

在 DeepSeek Harness 的 Web 界面里，每个对话都会在内存中保存「**该对话内真正发送过**的 prompt」。把光标停在输入框**第一行**，按 **`↑` / `↓`** 会弹出一个小巧的「**历史记录**」下拉框，用来翻出之前的 prompt：

| 按键 / 操作 | 行为 |
|---|---|
| `↑` / `↓`（弹框关闭、光标在第一行） | 打开历史下拉框（高亮在条目间移动） |
| `↑` | 高亮往上（更近的 prompt） |
| `↓` | 高亮往下（更早的 prompt） |
| `Enter` | 把高亮的 prompt 填入输入框并收起 |
| `Esc` | 收起，你当前的输入内容不受影响 |
| 其它任意按键 | 收起下拉框，按键正常生效（例如按字符键会输入到你当前的文字里） |
| 点击某一条 / 点框外 | 填入 / 收起 |

设计要点：

- **按会话隔离**：历史以会话 id 为键，每个对话只显示**该对话内发过**的 prompt；切换对话看到的是各自的历史，互不混用。
- **只记录真正的发送**：按 `Enter`（draft 非空）或点击**发送按钮**才记入历史；手动删除、IME 组合中途取消、切换会话/工作区导致的 draft 清空**都不会**被记录——不会再有零散的单字混进历史。
- **纯内存**：不落盘，刷新页面即清空。
- 不直接写受控 textarea：下拉框注册进应用自带的 `conversation.input.overlay` 槽位，通过 `inputActions.setDraft` 填入 draft。

## 独立安装与激活

```jsonc
// ~/.dsh/profiles/web/package.json —— 只装这一个功能
"dependencies": {
  "dsh-moyuu-input-history": "link:/path/to/dsh-moyuu/packages/dsh-moyuu-input-history"
}
```

```yaml
# ~/.dsh/profiles/web/cordis.patch.yml
- insert:
    - id: dsh-moyuu-input-history
      name: 'dsh-moyuu-input-history'
```

刷新 Web 界面，然后：

1. 先在当前对话里发送几条消息（会被记录）；
2. 把光标停在输入框第一行，按 `↑`（或 `↓`）——弹出历史下拉框，里面只有当前对话发过的 prompt；
3. `Enter` 把选中项填入输入框；`Esc` 或其它按键收起。

删掉这一行并移除依赖即停用本功能，其它功能不受影响。

## 工作原理

- `index.js` — **服务端 half**：空的 `apply()`，让包能作为 Loader 条目激活。
- `client.js` — **浏览器 half**：通过 `window.__ModuleLoader__.load({ id, factory })` 注册。激活时把一个 React 组件注册进应用的 `conversation.input.overlay` 槽位（复用输入框的标准 props：`useInput` / `inputActions` / `sessionId`），并安装一个 `document` 上的**捕获阶段 `keydown` 监听**，在 InputBar 自身处理之前拦截回忆按键。另有一个 `click` 监听按（中英文通用的）文案识别发送按钮、标记发送意图；只有当该意图存在且 draft 被清空时才记录。IME 组合输入（`isComposing` / `keyCode 229`）始终不干预。

`dsh` 清单：

```json
"dsh": {
  "client": {
    "platform": "web",
    "inject": ["@deepseek-ai/dsh-client-runtime"],
    "immediately": true
  }
}
```

## License

[MIT](LICENSE)
