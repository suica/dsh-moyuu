# dsh-moyuu-cmdk-new-session

**功能：键盘快捷键 —— 在 Web 界面任意位置按 Mod+K（macOS 为 Cmd+K，其它平台为 Ctrl+K）即可新建会话。**

## 功能说明

Web 界面侧边栏本来就有一个「新会话」按钮。本包让同一个操作可以用键盘触发：在页面任意位置按 `Cmd+K`（macOS）/ `Ctrl+K`（Windows/Linux），即可新建会话。

快捷键复用与侧边栏按钮完全相同的流程（`ctx.workspaces.startSession()`），因此行为一致——有当前/最近工作区时，会连接该工作区的空白会话并跳转过去；没有任何工作区时，会清空进入「新会话」视图。

细节：

- 捕获阶段监听，焦点在输入框/编辑器内也能触发（这是全局命令，不是编辑动作）。
- `preventDefault()` 阻止浏览器自带的 Mod+K 行为（例如某些浏览器的 Ctrl+K 聚焦地址栏）。
- `Mod+Shift+K` / `Mod+Alt+K` 不拦截——只有「裸修饰键 + K」才触发。
- 通过 `ctx.effect` 注册，HMR/卸载时会移除监听：重载后不会出现重复快捷键，卸载后不会泄漏监听器。

## 安装与激活

把本包加入 profile 依赖，并在 `cordis.patch.yml` 中启用其 `dsh.client` 行（这是客户端插件，与品牌包/示例包一样通过 patch 行激活，不是 bundle）：

```jsonc
// ~/.dsh/profiles/web/package.json
"dependencies": {
  "dsh-moyuu-cmdk-new-session": "link:/path/to/dsh-moyuu/packages/dsh-moyuu-cmdk-new-session"
}
```

```yaml
# ~/.dsh/profiles/web/cordis.patch.yml
- insert:
    - id: dsh-moyuu-cmdk-new-session
      name: 'dsh-moyuu-cmdk-new-session'
```

刷新 Web 界面生效。移除该行 + 依赖即停用此功能。

> 本地 monorepo 开发用 `link:`（如上）。由于本包只声明 `dsh.client`（无 `dsh.bundle`），`dsh plugin add` 会把它当作普通依赖安装——请通过上面的 `cordis.patch.yml` 行启用。

## 如何验证

1. 安装并激活后刷新 Web 界面。
2. 在任意位置（编辑器、侧边栏、输入框）按 `Cmd+K`（macOS）/ `Ctrl+K`（其它平台）。
3. 新建会话成功——与点击侧边栏「新会话」按钮效果一致；已有工作区时，会进入其空白会话。
4. `Mod+Shift+K` 行为不变；客户端重载后快捷键仍每次按键只触发一次。

开发期冒烟测试：

```sh
node --check client.js
node --check index.js
```

## 实现原理

- 客户端 half（`client.js`）声明 `exports.inject = ["workspaces"]`——Loader 以 `workspaces` 服务（由 `@deepseek-ai/dsh-client-runtime` 提供，已在清单的 `dsh.client.inject` 中声明）就绪为条件激活本包，并授予 `ctx.workspaces.startSession()`。
- Node half（`index.js`）是空 `apply`，让本包成为一个可激活的 Loader 条目，符合「一个功能一个包」规则。

## License

[MIT](../../LICENSE)
