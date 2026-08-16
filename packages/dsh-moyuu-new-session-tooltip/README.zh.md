# dsh-moyuu-new-session-tooltip

**功能：侧栏"新会话"按钮的 hover tooltip —— 显示其本地化文案加快捷键提示（macOS ⌘K / 其它平台 Ctrl+K），风格与内置 tooltip 一致。**

## 功能说明

DSH Web UI 的侧栏给折叠按钮加了 tooltip，却没有给"新会话"按钮加，所以侧栏**折叠（纯图标）**时，悬停该按钮没有任何提示。本包在悬停时显示 tooltip：按钮自己的本地化文案（如"新建会话"/"New session"）加上快捷键提示，并且**折叠与展开两种状态都显示**——对齐内置 `Tooltip`（同样的设计 token、右侧、垂直居中、边缘收敛、500ms 延迟）。

要点：

- **结构化匹配**按钮（`aria-label` 是新会话文案 **且** 带有 16×16 聊天气泡图标），不依赖具体语言，也不受 CSS module 哈希名 / React 重渲染影响。
- 使用 document 级 capture 监听（事件委托），无逐按钮监听、刷新不泄漏；气泡每次悬停按需创建。
- 文案直接取自按钮自身的 `aria-label`，本地化自动完成；本插件只追加快捷键提示。
- 视觉与内置气泡一致：`--dsw-alias-tooltip-bg` 背景、`--dsw-static-neutral-bluish-00` 文字、8px 圆角、`translateY(-50%)` 垂直居中。
- 注入的样式与节点带 `data-plugin` / `data-plugin-css`，HMR 可卸载。

## 安装 / 激活

把包加入 profile 依赖并启用其 `dsh.client` 行（客户端插件，和其它 Web 功能一样走 `cordis.patch.yml` 行，不是 bundle）：

```jsonc
// ~/.dsh/profiles/web/package.json
"dependencies": {
  "dsh-moyuu-new-session-tooltip": "link:/path/to/dsh-moyuu/packages/dsh-moyuu-new-session-tooltip"
}
```

```yaml
# ~/.dsh/profiles/web/cordis.patch.yml
- insert:
    - id: dsh-moyuu-new-session-tooltip
      name: 'dsh-moyuu-new-session-tooltip'
```

刷新 Web 界面生效；删除该行并移除依赖即停用。

## 如何验证

1. 安装并激活后刷新 Web UI。
2. 悬停侧栏"新会话"按钮（聊天气泡图标）：约 500ms 后出现 tooltip，显示文案加快捷键提示（macOS 为"新建会话 ⌘K"，其它平台为"New session Ctrl+K"），折叠与展开态都生效。
3. 移开鼠标即消失；点击按钮会新建会话并收起 tooltip。
4. 品牌 wordmark 按钮（共享同一 aria-label 但没有 16×16 聊天气泡图标）和折叠/展开按钮**不会**出现 tooltip。

开发期冒烟测试：

```sh
node --check client.js
node --check index.js
```

## 接线说明

- 客户端 half（`client.js`）结构化匹配"新会话"按钮，500ms 延迟后显示 tooltip，离开或点击时隐藏。`exports.inject` 为空 `[]`——不需要任何运行时服务。
- Node half（`index.js`）为空的 `apply`，使包成为可激活的 Loader 条目（符合"一功能一包"规则）。

## License

[MIT](../../LICENSE)