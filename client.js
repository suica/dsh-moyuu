/**
 * dsh-moyuu — MOYU Harness web client plugin.
 *
 * Rebrands the dsh web UI's top-left product wordmark from the DeepSeek
 * "DeepSeek Harness" SVG to "MOYU Harness".
 *
 * The default wordmark is drawn as an inline SVG (viewBox "0 0 182 24") by
 * the sidebar's brand button, with no configurable slot. This plugin hides
 * that SVG with CSS and renders the replacement text in its place, so the
 * change survives React re-renders and requires no build-time modification.
 *
 * Loader contract (see dsh-client-modules): the bundle registers a factory
 * via `window.__ModuleLoader__.load({ id, factory })`; the factory returns a
 * `module.exports` carrying `apply(ctx)`, which the Loader invokes to
 * activate the plugin.
 */
window.__ModuleLoader__.load({
  id: "dsh-moyuu",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;

    // CSS-only rebrand: hide the original wordmark SVG and render the MOYU
    // text in its place. `:has()` targets the brand button that directly
    // holds the wordmark svg; the ::after text inherits the surrounding
    // color/weight so it works in both light and dark themes.
    var STYLE = [
      '/* dsh-moyuu: hide the DeepSeek wordmark */',
      'svg[viewBox="0 0 182 24"] { display: none !important; }',
      '/* dsh-moyuu: MOYU Harness text in its place */',
      'button:has(> svg[viewBox="0 0 182 24"])::after {',
      '  content: "MOYU Harness";',
      '  font-family: inherit;',
      '  font-size: 15px;',
      '  font-weight: 600;',
      '  letter-spacing: 0.02em;',
      '  line-height: 24px;',
      '  white-space: nowrap;',
      '  color: inherit;',
      '}'
    ].join("\n");

    function apply() {
      var tagId = "dsh-moyuu/brand.css";
      if (typeof document !== "undefined" &&
          document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
        var tag = document.createElement("style");
        tag.setAttribute("data-plugin", "dsh-moyuu");
        tag.setAttribute("data-plugin-css", tagId);
        tag.textContent = STYLE;
        document.head.appendChild(tag);
      }
    }

    exports.apply = apply;
    exports.inject = [];
    return module.exports;
  }
});
