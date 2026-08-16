/**
 * dsh-moyuu-brand — MOYUU-brand DeepSeek Harness web client plugin.
 *
 * Respects the original DeepSeek brand (the whale logo and the "DeepSeek"
 * vector wordmark) but swaps the trailing badge word "Harness" for "MOYUU",
 * so the top-left wordmark reads "DeepSeek MOYUU".
 *
 * The wordmark is a single hardcoded inline SVG (viewBox "0 0 182 24") with no
 * configurable slot. Its layout (from @deepseek-ai/dsh-client-ui-primitives'
 * `BrandWordmark`):
 *
 *   - whale logo + "DeepSeek" glyphs   → kept as-is (fill="currentColor")
 *   - a rounded pill (rect x=129.348 y=5.5 w=52 h=14 rx=2, fill="currentColor")
 *   - a `<g clip-path="url(#dsh-wordmark-badge-clip)">` of "Harness" glyphs,
 *     filled with var(--dsw-alias-label-primary-inverted)
 *
 * Strategy (survives React re-renders, no build-time edits):
 *   1. On the live wordmark SVG, remove the "Harness" glyph group.
 *   2. Keep the pill background and inject `<text>MOYUU</text>` centered inside
 *      it, filled with the app's inverted-label color
 *      (`var(--dsw-alias-label-primary-inverted)`).
 *   3. Mark the SVG (`data-dsh-moyuu-brand`) and keep a MutationObserver alive so the
 *      brand is re-applied whenever React re-creates the wordmark (sidebar
 *      collapse/expand, theme toggles, remounts). Because the mutation lives in
 *      the live DOM, `currentColor` and the CSS variable resolve natively, so
 *      both light and dark themes work with no re-baking.
 *
 * Loader contract (see dsh-client-modules): the bundle registers a factory
 * via `window.__ModuleLoader__.load({ id, factory })`; the factory returns a
 * `module.exports` carrying `apply(ctx)`, which the Loader invokes to
 * activate the plugin.
 */
window.__ModuleLoader__.load({
  id: "dsh-moyuu-brand",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;

    var BRAND_SVG = 'svg[viewBox="0 0 182 24"]';
    var MARKER = "data-dsh-moyuu-brand";
    var SVG_NS = "http://www.w3.org/2000/svg";
    var initialized = false;
    // The pill badge behind "Harness" in the wordmark's viewBox (52×14 rounded
    // rect at x=129.348, y=5.5); "MOYUU" is centered inside it.
    var PILL = { x: 129.348, y: 5.5, w: 52, h: 14 };

    /**
     * Rewrite one live wordmark SVG in place: drop the "Harness" glyph group
     * and center "MOYUU" in the pill. Idempotent via the marker attribute.
     */
    function applyBrand(svg) {
      if (svg.hasAttribute(MARKER)) return;

      // 1. Remove the "Harness" glyphs (the clipped group inside the pill).
      var badge = svg.querySelector('g[clip-path*="dsh-wordmark-badge-clip"]');
      if (badge) badge.remove();

      // 2. Locate the pill so the text centers on it even if the geometry
      //    drifts in a future dsh version; fall back to the known geometry.
      var pill = null;
      Array.prototype.forEach.call(svg.querySelectorAll("rect"), function (r) {
        if (parseFloat(r.getAttribute("x") || "0") >= 125) pill = r;
      });
      var cx = pill
        ? parseFloat(pill.getAttribute("x")) + parseFloat(pill.getAttribute("width")) / 2
        : PILL.x + PILL.w / 2;
      var cy = pill
        ? parseFloat(pill.getAttribute("y")) + parseFloat(pill.getAttribute("height")) / 2
        : PILL.y + PILL.h / 2;

      var text = document.createElementNS(SVG_NS, "text");
      text.setAttribute("x", String(cx));
      text.setAttribute("y", String(cy));
      text.setAttribute("text-anchor", "middle");
      text.setAttribute("dominant-baseline", "central");
      // 8px ≈ the original "Harness" glyph height (~7.2 viewBox units) inside
      // the 14px-tall pill, at the wordmark's 1:1 CSS-px scale.
      text.setAttribute("font-size", "8");
      text.setAttribute("font-weight", "600");
      text.setAttribute("letter-spacing", "0.3");
      text.setAttribute("fill", "var(--dsw-alias-label-primary-inverted)");
      text.textContent = "MOYUU";
      svg.appendChild(text);

      // 3. Mark as applied so the observer never loops on our own mutations.
      svg.setAttribute(MARKER, "applied");
    }

    function apply() {
      if (typeof document === "undefined" || document.documentElement === null) return;
      // Guard against re-activation (e.g. HMR) registering duplicate observers.
      if (initialized) return;
      initialized = true;

      var svg = document.querySelector(BRAND_SVG);
      if (svg) applyBrand(svg);

      // The sidebar unmounts the wordmark when it collapses and React may
      // remount it later (re-render, theme toggle, session start). Keep a
      // persistent observer so the brand is re-applied to any pristine
      // wordmark that appears, without disturbing the rest of the DOM.
      var mo = new MutationObserver(function () {
        var s = document.querySelector(BRAND_SVG);
        if (s && !s.hasAttribute(MARKER)) applyBrand(s);
      });
      mo.observe(document.documentElement, { childList: true, subtree: true });
    }

    exports.apply = apply;
    exports.inject = [];
    return module.exports;
  }
});
