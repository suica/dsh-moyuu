# dsh-moyuu

[dsh-moyuu](https://github.com/suica/dsh-moyuu) monorepo 的 **品牌**功能包——[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（`dsh`）的客户端插件。

**尊重原始的 DeepSeek 品牌**——保留鲸鱼 logo 和 "DeepSeek" 矢量字样——只把末尾的 **"Harness"** 换成 **"MOYUU"**，让左上角标识变成 **DeepSeek MOYUU**。

> Monorepo 规则：一个功能 = 一个可独立加载的 package。见 [docs/PLUGIN-PACKAGE-RULES.zh.md](../../docs/PLUGIN-PACKAGE-RULES.zh.md)。

## 它做了什么

DeepSeek Harness 的 Web shell 把产品标识画成硬编码的内联 SVG（`viewBox="0 0 182 24"`），没有可配置的槽位。本包是一个很小的**客户端插件**（`dsh.client`，平台 `web`）：

1. 运行时抓取真实的标识 SVG；
2. 只删掉 "Harness" 那几个字形（按首个 x 坐标 ≥ 125 识别），在原位追加 `<text>MOYUU</text>`；
3. 把结果烘焙成 data-URI，作为品牌按钮的 `::after` 背景渲染，同时隐藏原始 SVG。

因为烘焙后的标识是稳定的 CSS 背景，所以能扛住 React 重渲染、浅色/深色主题都适用（`currentColor` 继承按钮颜色）、并且不碰任何编译产物——它就是一个普通 npm 包，运行时由 `dsh-client-modules` 动态发现加载。

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
- `client.js` — **浏览器 half**：通过 `window.__ModuleLoader__.load({ id, factory })` 注册。激活时抓取真实标识 SVG，克隆后删掉 "Harness" 字形（首个 x ≥ 125），追加 `<text>MOYUU</text>`，序列化成 data-URI 并注入 `<style>`：隐藏原始 SVG，把烘焙后的标识作为品牌按钮 `::after` 背景显示。

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

想换替换文字（默认 `MOYUU`）、字号、字重或位置，改 `client.js` 里 `buildReplacement()` 构建的 `<text>` 元素（`x`、`y`、`font-size`、`textContent`）。

## License

[MIT](LICENSE)
