# dsh-moyuu-tab-in-textbox

[dsh-moyuu](https://github.com/suica/dsh-moyuu) monorepo 的**键盘**功能包——[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（`dsh`）的**客户端插件**，改变文本框里的 Tab 键行为。

> Monorepo 规则：一个功能 = 一个可独立加载的 package。见 [docs/PLUGIN-PACKAGE-RULES.zh.md](../../docs/PLUGIN-PACKAGE-RULES.zh.md)。

## 它做了什么

DeepSeek Harness 的 Web shell 保留了浏览器的全局可访问性行为：**Tab 在页面的可聚焦元素之间移动焦点**。在按钮、链接上这很有用，但在文本框里就是个陷阱——在聊天输入框（`<textarea>`）里写多行提示词、或编辑任何输入框 / contenteditable 字段时，按 Tab 会把焦点从输入框里拽走、跳到下一个可聚焦元素，而不是让你缩进。

本插件**只在可编辑文本框内**（`textarea`、文本类 `<input>`、contenteditable）抑制这个全局 Tab 行为，改成代码编辑器的行为：

| 文本框内 | 之前 | 之后 |
|---|---|---|
| `Tab` | 焦点跳到下一个元素 | 在光标处插入一个制表符（`\t`） |
| `Shift+Tab` | 焦点跳到上一个元素 | 在光标处插入一个制表符 |

文本框之外（按钮、链接、菜单……）全局 Tab 的可访问性行为保持不变，跨应用的键盘导航照常工作。IME 中文/日文输入过程也完全不受干扰。

## 独立安装与激活

```jsonc
// ~/.dsh/profiles/web/package.json —— 只装这一个功能
"dependencies": {
  "dsh-moyuu-tab-in-textbox": "link:/path/to/dsh-moyuu/packages/dsh-moyuu-tab-in-textbox"
}
```

```yaml
# ~/.dsh/profiles/web/cordis.patch.yml
- insert:
    - id: dsh-moyuu-tab-in-textbox
      name: 'dsh-moyuu-tab-in-textbox'
```

刷新 Web 界面，你应该能看到：

```js
document.documentElement.dataset.dshMoyuuTabInTextbox; // => "active"
```

然后把焦点放进输入框（或任意文本框）并按 `Tab`——会插入一个制表符，焦点留在输入框里。

删掉这一行并移除依赖即停用本功能，其它功能不受影响。

## 工作原理

- `index.js` — **服务端 half**：空的 `apply()`，让包能作为 Loader 条目激活。
- `client.js` — **浏览器 half**：通过 `window.__ModuleLoader__.load({ id, factory })` 注册。激活时在 `document` 上安装一个**捕获阶段的 `keydown` 监听**；当按键是 `Tab`（无 ctrl/meta/alt）且 `document.activeElement` 是可编辑文本框时，调用 `preventDefault()` 并在光标处插入 `"\t"`：
  - `<input>`/`<textarea>`：`setRangeText("\t", start, end, "end")` + 一个冒泡的合成 `input` 事件，让 React 受控字段（如输入框 textarea）的 draft 状态保持同步。
  - contenteditable：`document.execCommand("insertText", false, "\t")`，触发编辑器已经在监听的本地 input 事件。
  - IME 组合输入（`isComposing` / `keyCode 229`）会被跳过，绝不干扰中文/日文/韩文输入。

`dsh` 清单：

```json
"dsh": {
  "client": {
    "platform": "web",
    "inject": [],
    "immediately": true
  }
}
```

## License

[MIT](LICENSE)
