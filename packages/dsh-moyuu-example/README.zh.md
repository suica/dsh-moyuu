# dsh-moyuu-example

[dsh-moyuu](https://github.com/suica/dsh-moyuu) monorepo 的**示例**功能包——[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（`dsh`）里最小、可独立加载的**客户端插件**，用来证明分包规则：**一个功能 = 一个 package，每个 package 都能独立加载 / 移除**。

> Monorepo 规则：见 [docs/PLUGIN-PACKAGE-RULES.zh.md](../../docs/PLUGIN-PACKAGE-RULES.zh.md)。

## 它做了什么

激活时给 `<html>` 设置 `data-moyuu-example="active"`，并注入一个命名空间的 `<style>`（`dsh-moyuu-example/example.css`），在右下角画一个小的 “MOYUU · example feature loaded” 小胶囊。它不依赖任何东西，也不碰其它包拥有的任何东西。

把它当模板用：复制这个目录到 `packages/dsh-moyuu-<你的功能>/`，改包名，再把 `client.js` 换成你的功能即可。

## 独立安装与激活

```jsonc
// ~/.dsh/profiles/web/package.json —— 只装这一个功能
"dependencies": {
  "dsh-moyuu-example": "link:/path/to/dsh-moyuu/packages/dsh-moyuu-example"
}
```

```yaml
# ~/.dsh/profiles/web/cordis.patch.yml
- insert:
    - id: dsh-moyuu-example
      name: 'dsh-moyuu-example'
```

刷新 Web 界面，你应该能看到示例小胶囊，并且：

```js
document.documentElement.dataset.moyuuExample; // => "active"
```

删掉这一行并移除依赖即停用本功能，而品牌包和其余 UI 照常工作——这正是分包的意义。

## License

[MIT](LICENSE)
