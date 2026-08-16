# dsh-moyuu-session-context-menu

[dsh-moyuu](https://github.com/suica/dsh-moyuu) monorepo 的**会话右键菜单**功能包——[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（`dsh`）的客户端插件。

**在侧边栏右键一个会话，就会在鼠标位置打开该会话的"⋯"（更多）菜单**——和点击该行上的"更多"按钮完全一致（重命名 / 分叉 / 归档），并且菜单从右键点击的位置展开，像原生右键菜单一样。不用再费劲去点那颗小圆点。

> Monorepo 规则：一个功能 = 一个可独立加载的 package。见 [docs/PLUGIN-PACKAGE-RULES.zh.md](../../docs/PLUGIN-PACKAGE-RULES.zh.md)。

## 它做了什么

侧边栏的会话列表把每个会话渲染成一行，行尾的"⋯"按钮会打开一个 portal 的 Menu（重命名 / 分叉 / 归档）。本插件让**在任意会话行上右键**，就在**鼠标位置**打开同一个菜单：

- 找到该行的"更多"按钮并点击它，因此打开的是**应用自己的菜单**——没有重造轮子；
- 菜单**锚定在右键点击的位置**（把"更多"按钮的包裹元素临时放到指针处、等应用的 Menu 测量完成后立刻还原），因此菜单从光标处展开，和原生右键菜单一致；
- **仅对会话行屏蔽浏览器的原生右键菜单**（其它地方的原生行为保持不变）；
- 右键第二个会话行时，第一个会话行的菜单会自动关闭（由应用自带的 pointerdown 关闭逻辑处理）；
- 右键**不会**打开会话本身——与点击"更多"按钮一致。

它是一次纯 DOM 增强：一个挂在 `document` 上的 `contextmenu` 监听器，无构建期改动，且与语言无关（通过 ARIA 角色/属性和省略号图标识别行，而不是靠文案）。

## 独立安装与激活

```jsonc
// ~/.dsh/profiles/web/package.json —— 只装这一个功能
"dependencies": {
  "dsh-moyuu-session-context-menu": "link:/path/to/dsh-moyuu/packages/dsh-moyuu-session-context-menu"
}
```

```yaml
# ~/.dsh/profiles/web/cordis.patch.yml
- insert:
    - id: dsh-moyuu-session-context-menu
      name: 'dsh-moyuu-session-context-menu'
```

刷新 Web 界面，然后在侧边栏右键任意会话——它的"⋯"菜单就会打开。删掉这一行并移除依赖即停用本功能，其它功能不受影响。

## 工作原理

- `index.js` — **服务端 half**：空的 `apply()`，让包能作为 Loader 条目激活。
- `client.js` — **浏览器 half**：通过 `window.__ModuleLoader__.load({ id, factory })` 注册。激活时在 `document` 上挂一个 capture 阶段的 `contextmenu` 监听器，对每个事件：

  1. 向上找到会话行：`div[role="treeitem"][aria-selected]`（工作区标题行带的是 `aria-expanded`，搜索结果是 `<button>`，两者都不会被误匹配）；
  2. 通过 16×16 省略号图标（`IconEllipsisOutline16`）找到该行的"更多"触发按钮；
  3. `preventDefault()` 屏蔽原生菜单，然后**把该按钮的包裹元素临时固定到指针处再点击它**：应用的 `Menu` 在 layout effect 里测量包裹元素，因此它自己的 `fixedPos` 会落在光标上，并在后续重渲染中保持不变；菜单一旦放好就立刻还原包裹元素（连同"⋯"图标）。

监听器挂在 `document` 上，所以会话列表被 React 重渲染后依然有效；`initialized` 守卫避免重复激活（如 HMR）时注册两份监听器。

## 验证

```js
// 激活后，右键侧边栏任意会话行，然后：
const menu = document.querySelector('[role="menu"]');
menu !== null;                                   // => true（应用的"更多"菜单）
// 菜单左上角位于右键点击的位置：
menu.getBoundingClientRect().left === <cursorX>; // => true
```

## License

[MIT](LICENSE)
