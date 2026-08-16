# dsh-moyuu

[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（`dsh`）的 **MOYU Harness** 品牌插件。

把 `dsh` Web 界面左上角的 **DeepSeek** 字样替换为 **MOYU Harness** —— 用纯 CSS 给属于你自己的实例打上自己的标识。

## 它做了什么

DeepSeek Harness 的 Web shell 把产品标识画成硬编码的内联 SVG（`viewBox="0 0 182 24"`），没有可配置的槽位。这个插件是一个很小的**客户端插件**（`dsh.client`，平台 `web`）：

1. 用 CSS 隐藏原始 DeepSeek 标识 SVG；
2. 在原位渲染出 **MOYU Harness** 文字。

因为是纯 CSS 覆盖，所以能扛住 React 重渲染、浅色/深色主题都适用（继承 `currentColor`）、并且不碰任何编译产物——它就是一个普通 npm 包，运行时由 `dsh-client-modules` 动态发现加载。

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
- `client.js` — **浏览器 half**：通过 `window.__ModuleLoader__.load({ id, factory })` 注册，在 `apply()` 里注入一段 `<style>` 做品牌覆盖：

```css
svg[viewBox="0 0 182 24"] { display: none !important; }
button:has(> svg[viewBox="0 0 182 24"])::after {
  content: "MOYU Harness";
  font-weight: 600;
  /* 继承周围颜色/字重 */
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

改 `client.js` 里的 `STYLE` 字符串即可更换文字、字号、字重，或一并调整折叠侧栏的鱼形 logo。

## License

[MIT](LICENSE)
