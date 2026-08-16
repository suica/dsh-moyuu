/**
 * dsh-moyuu — MOYUU-brand DeepSeek Harness web client plugin.
 *
 * Respects the original DeepSeek brand (the whale logo and the "DeepSeek"
 * vector wordmark) but swaps the trailing word "Harness" for "MOYUU", so the
 * top-left wordmark reads "DeepSeek MOYUU".
 *
 * The wordmark is a single hardcoded inline SVG (viewBox "0 0 182 24") with
 * no configurable slot. Layout of its 19 paths by first x-coordinate:
 *
 *   x  0–121  → whale logo + "DeepSeek" glyphs  (keep)
 *   x ≥132    → "Harness" glyphs                (drop, replace with "MOYUU")
 *   x    0    → clip-path defs                  (keep)
 *
 * Strategy (stable across React re-renders, no build-time edits):
 *   1. Grab the live wordmark SVG once it appears in the DOM.
 *   2. Clone it, remove the "Harness" glyph paths (first x ≥ 125), and append
 *      a <text>MOYUU</text> in their place.
 *   3. Serialize the result to a data-URI and inject a <style> that hides the
 *      original SVG and renders the baked wordmark as the brand button's
 *      `::after` background. `currentColor` inside the baked SVG inherits the
 *      button color, so light/dark themes both work.
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

    var BRAND_SVG = 'svg[viewBox="0 0 182 24"]';
    // "Harness" glyph paths all start at x ≥ 125 (see module doc); the whale
    // and "DeepSeek" glyphs stay at x ≤ 121, and the clip defs at x = 0.
    var HARNESS_X_MIN = 125;

    var SVG_NS = "http://www.w3.org/2000/svg";

    /** First x coordinate of a path's `d`, or -1 when it starts differently. */
    function pathStartX(path) {
      var m = /^M\s*([\d.]+)/.exec(path.getAttribute("d") || "");
      return m ? parseFloat(m[1]) : -1;
    }

    /** Build a "DeepSeek MOYUU" wordmark from the live SVG. */
    function buildReplacement(svg) {
      var clone = svg.cloneNode(true);
      Array.prototype.forEach.call(clone.querySelectorAll("path"), function (p) {
        if (pathStartX(p) >= HARNESS_X_MIN) p.remove();
      });
      var text = document.createElementNS(SVG_NS, "text");
      text.setAttribute("x", "136");
      text.setAttribute("y", "12.6");
      text.setAttribute("font-size", "8.4");
      text.setAttribute("font-weight", "600");
      text.setAttribute("letter-spacing", "0.3");
      text.setAttribute("dominant-baseline", "middle");
      text.setAttribute("fill", "currentColor");
      text.textContent = "MOYUU";
      clone.appendChild(text);
      return clone.outerHTML;
    }

    var STYLE_TAG = "dsh-moyuu/brand.css";

    function ensureStyle(html) {
      if (document.querySelector("style[data-plugin-css=" + JSON.stringify(STYLE_TAG) + "]") !== null) {
        return true;
      }
      var data = "data:image/svg+xml," + encodeURIComponent(html);
      var css = [
        "/* dsh-moyuu: keep DeepSeek brand, swap Harness -> MOYUU */",
        BRAND_SVG + " { display: none !important; }",
        "button:has(> " + BRAND_SVG + ") { position: relative; }",
        "button:has(> " + BRAND_SVG + ")::after {",
        "  content: \"\";",
        "  display: inline-block;",
        "  width: 182px;",
        "  height: 24px;",
        "  flex: none;",
        "  background: url(\"" + data + "\") no-repeat center / contain;",
        "}"
      ].join("\n");
      var tag = document.createElement("style");
      tag.setAttribute("data-plugin", "dsh-moyuu");
      tag.setAttribute("data-plugin-css", STYLE_TAG);
      tag.textContent = css;
      document.head.appendChild(tag);
      return true;
    }

    function apply() {
      if (typeof document === "undefined" || document.head === null) return;
      // If the wordmark is already baked in, nothing else to do.
      if (document.querySelector("style[data-plugin-css=" + JSON.stringify(STYLE_TAG) + "]") !== null) return;

      var svg = document.querySelector(BRAND_SVG);
      if (svg) {
        ensureStyle(buildReplacement(svg));
        return;
      }
      // The sidebar wordmark may mount a moment after the plugin activates;
      // wait for it, then bake once.
      var observed = document.body || document.documentElement;
      if (!observed) return;
      var mo = new MutationObserver(function () {
        if (document.querySelector("style[data-plugin-css=" + JSON.stringify(STYLE_TAG) + "]") !== null) {
          mo.disconnect();
          return;
        }
        var s = document.querySelector(BRAND_SVG);
        if (s) {
          ensureStyle(buildReplacement(s));
          mo.disconnect();
        }
      });
      mo.observe(observed, { childList: true, subtree: true });
    }

    exports.apply = apply;
    exports.inject = [];
    return module.exports;
  }
});
