# dsh-moyuu

[dsh-moyuu](https://github.com/suica/dsh-moyuu) monorepo 的 **品牌**功能包——[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（`dsh`）的客户端插件。

**尊重原始的 DeepSeek 品牌**——保留鲸鱼 logo 和 "DeepSeek" 矢量字样——只把末尾的 **"Harness"** 换成 **"MOYUU"**，让左上角标识变成 **DeepSeek MOYUU**。

> Monorepo 规则：一个功能 = 一个可独立加载的 package。见 [docs/PLUGIN-PACKAGE-RULES.zh.md](../../docs/PLUGIN-PACKAGE-RULES.zh.md)。

## 它做了什么

DeepSeek Harness 的 Web shell 把产品标识画成硬编码的内联 SVG（`viewBox="0 0 182 24"`），没有可配置的槽位。本包是一个很小的**客户端插件**（`dsh.client`，平台 `web`），直接在真实 SVG 上就地修改：

1. 删掉 "Harness" 字形组（`<g clip-path="url(#dsh-wordmark-badge-clip)">`）；
2. 保留圆角药丸背景，在它正中间注入 `<text>MOYUU</text>`，用应用的反色标签色填充；
3. 打上标记并维持一个 `MutationObserver`，每当 React 重建标识（折叠/展开侧栏、切换主题、重新挂载）就自动重新应用。

因为改动就在真实 DOM 里，`currentColor` 和 CSS 变量天然解析——浅色/深色主题都自动适配、无需重烘焙——并且不碰任何编译产物：它就是一个普通 npm 包，运行时由 `dsh-client-modules` 动态发现加载。

## 独立安装与激活

```jsonc
// ~/.dsh/profiles/web/package.json —— 只装这一个功能
"dependencies": {
  "dsh-moyuu": "link:/path/to/dsh-moyuu/packages/dsh-moyuu"
}
```

```yaml
# ~/.dsh/profiles/web/cordis.patch.yml
- insert:
    - id: dsh-moyuu
      name: 'dsh-moyuu'
```

刷新 Web 界面，标识就变成 **DeepSeek MOYUU**。删掉这一行并移除依赖即停用本功能，其它功能不受影响。

## 工作原理

- `index.js` — **服务端 half**：空的 `apply()`，让包能作为 Loader 条目激活。
- `client.js` — **浏览器 half**：通过 `window.__ModuleLoader__.load({ id, factory })` 注册。激活时找到真实标识 SVG 并就地重写：删掉 "Harness" 字形组、保留药丸、追加居中的 `<text>MOYUU</text>`（填充 `var(--dsw-alias-label-primary-inverted)`）。一个常驻的 `MutationObserver` 会把品牌重新应用到 React 之后挂载的任何原始标识上：

```js
// 大致就是 applyBrand(svg) 对真实 SVG 做的事
svg.querySelector('g[clip-path*="dsh-wordmark-badge-clip"]').remove();
svg.appendChild(<text x="155.348" y="12.5" text-anchor="middle"
                   dominant-baseline="central" font-size="8"
                   fill="var(--dsw-alias-label-primary-inverted)">MOYUU</text>);
```

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

## 自定义

想换替换文字（默认 `MOYUU`）、字号、字重或位置，改 `client.js` 里 `applyBrand()` 构建的 `<text>` 元素（`x`、`y`、`font-size`、`textContent`）。

## License

[MIT](LICENSE)
