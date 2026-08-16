# dsh-moyuu

[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（`dsh`）的 **MOYUU 品牌**插件。

**尊重原始的 DeepSeek 品牌**——保留鲸鱼 logo 和 "DeepSeek" 矢量字样——只把末尾的 **"Harness"** 换成 **"MOYUU"**，让左上角标识变成 **DeepSeek MOYUU**。

## 它做了什么

DeepSeek Harness 的 Web shell 把产品标识画成硬编码的内联 SVG（`viewBox="0 0 182 24"`），没有可配置的槽位。这个插件是一个很小的**客户端插件**（`dsh.client`，平台 `web`）：

1. 运行时抓取真实的标识 SVG；
2. 只删掉 "Harness" 那几个字形（按首个 x 坐标 ≥ 125 识别），在原位追加 `<text>MOYUU</text>`；
3. 把结果烘焙成 data-URI，作为品牌按钮的 `::after` 背景渲染，同时隐藏原始 SVG。

因为烘焙后的标识是稳定的 CSS 背景，所以能扛住 React 重渲染、浅色/深色主题都适用（`currentColor` 继承按钮颜色）、并且不碰任何编译产物——它就是一个普通 npm 包，运行时由 `dsh-client-modules` 动态发现加载。

## 安装

装包并激活插件行：

```sh
# 1. 把包装进你的 profile
dsh plugin --profile web add git+https://github.com/suica/dsh-moyuu.git

# 2. 在 profile 补丁里激活它（~/.dsh/profiles/web/cordis.patch.yml）
```

```yaml
# cordis.patch.yml
- insert:
    - id: dsh-moyuu
      name: 'dsh-moyuu'
```

然后刷新 Web 界面，标识就变成 **MOYU Harness** 了。

> 如果你想搭建自己的 profile 而不是改 `web`：把包和同样的行加进 `~/.dsh/profiles/<名字>/cordis.patch.yml`，再用 `dsh --profile <名字> --port <端口>` 启动即可。

## 使用

无需配置，装上即用。开发时想指向本地 checkout，在 profile 的 `package.json` 里用 `link:` 依赖：

```json
"dependencies": {
  "dsh-moyuu": "link:/path/to/dsh-moyuu"
}
```

## 工作原理

- `index.js` — **服务端 half**：空的 `apply()`，让包能作为 Loader 条目激活。
- `client.js` — **浏览器 half**：通过 `window.__ModuleLoader__.load({ id, factory })` 注册。激活时抓取真实标识 SVG，克隆后删掉 "Harness" 字形（首个 x ≥ 125），追加 `<text>MOYUU</text>`，序列化成 data-URI 并注入 `<style>`：隐藏原始 SVG，把烘焙后的标识作为品牌按钮 `::after` 背景显示：

```css
svg[viewBox="0 0 182 24"] { display: none !important; }
button:has(> svg[viewBox="0 0 182 24"])::after {
  content: "";
  width: 182px; height: 24px;
  background: url("data:image/svg+xml,...") no-repeat center / contain;
}
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

想换替换文字（默认 `MOYUU`）、字号、字重或位置，改 `client.js` 里 `buildReplacement()` 构建的 `<text>` 元素（`x`、`y`、`font-size`、`textContent`）。如果想，也可以一并调整折叠侧栏的鱼形 logo。

## License

[MIT](LICENSE)
