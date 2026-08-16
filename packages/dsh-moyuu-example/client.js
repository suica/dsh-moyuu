/**
 * dsh-moyuu-example — example feature package (client half).
 *
 * The minimal, independently-loadable dsh client plugin. Its only job is to
 * prove the per-feature packaging rule:
 *   - it registers through the same `window.__ModuleLoader__.load` contract
 *     as every other client plugin (see dsh-client-modules);
 *   - on activation it injects ONE namespaced <style> and sets a data
 *     attribute on <html>, with zero dependency on any other feature package;
 *   - removing this package (its dependency + cordis.patch.yml row) leaves
 *     the brand package and the rest of the UI fully intact.
 *
 * Verify in the running web UI:
 *   document.documentElement.dataset.moyuuExample          // => "active"
 *   document.querySelector('style[data-plugin-css="dsh-moyuu-example/example.css"]') !== null
 */
window.__ModuleLoader__.load({
  id: "dsh-moyuu-example",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;

    var STYLE_TAG = "dsh-moyuu-example/example.css";

    function ensureStyle() {
      if (document.querySelector("style[data-plugin-css=" + JSON.stringify(STYLE_TAG) + "]") !== null) {
        return true;
      }
      var css = [
        "/* dsh-moyuu-example: proof-of-life, namespaced, removable */",
        "html[data-moyuu-example=\"active\"]::after {",
        "  content: \"MOYUU · example feature loaded\";",
        "  position: fixed;",
        "  right: 8px;",
        "  bottom: 8px;",
        "  z-index: 2147483000;",
        "  padding: 2px 8px;",
        "  border-radius: 999px;",
        "  font: 11px/1.6 system-ui, sans-serif;",
        "  color: #fff;",
        "  background: rgba(42, 125, 225, 0.85);",
        "  opacity: 0.6;",
        "  pointer-events: none;",
        "}"
      ].join("\n");
      var tag = document.createElement("style");
      tag.setAttribute("data-plugin", "dsh-moyuu-example");
      tag.setAttribute("data-plugin-css", STYLE_TAG);
      tag.textContent = css;
      document.head.appendChild(tag);
      return true;
    }

    function apply() {
      if (typeof document === "undefined" || document.head === null) return;
      document.documentElement.dataset.moyuuExample = "active";
      ensureStyle();
    }

    exports.apply = apply;
    exports.inject = [];
    return module.exports;
  }
});
