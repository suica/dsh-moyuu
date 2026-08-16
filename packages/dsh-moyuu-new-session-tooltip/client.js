/**
 * dsh-moyuu-new-session-tooltip — client half.
 *
 * Hover tooltip for the sidebar's New Session button. The product's sidebar
 * gives the collapse/toggle button a Tooltip but not the New Session button,
 * so in collapsed (icon-only) mode it is unlabeled on hover. This plugin shows
 * a tooltip on hover with the button's own localized label plus the keyboard
 * shortcut hint (⌘K on macOS, Ctrl+K elsewhere), in both collapsed and wide
 * states — mirroring the built-in Tooltip's look (same tokens, right side,
 * vertical centering, edge clamping).
 *
 * The sidebar's New Session button is
 *   <button type="button" aria-label={t("session.new.label")} onClick=startSession>
 *     <IconNewChatOutline16 …/>  (+ a label <span> when wide)
 *   </button>
 * The brand wordmark button shares the same aria-label (both call
 * `startSession()`), but carries the wide logo SVG instead of the 16×16 chat
 * icon, and the sidebar toggle button has the 16×16 icon but a different
 * aria-label — so a button whose aria-label is a New Session label AND that
 * contains a 16×16 chat icon uniquely identifies it.
 *
 * Strategy (survives React re-renders, no build-time edits):
 *   - capture-phase mouseover/mouseout/mousedown listeners on document, so the
 *     behavior survives React re-creating the button (delegation, no
 *     per-button listeners, tooltip re-created per hover);
 *   - a short delay (500ms, matching the built-in toggle Tooltip) before the
 *     bubble appears; moving between the button's own children keeps it;
 *   - the bubble is a fixed-position <div role="tooltip"> appended to body,
 *     placed to the right of the button and vertically centered, clamped to
 *     the viewport like the built-in bubble;
 *   - injected style + node carry data-plugin so HMR can unload them.
 *
 * Loader contract (see dsh-client-modules): the bundle registers a factory
 * via `window.__ModuleLoader__.load({ id, factory })`; the factory returns a
 * `module.exports` carrying `apply(ctx)`, which the Loader invokes to
 * activate the plugin.
 */
window.__ModuleLoader__.load({
  id: "dsh-moyuu-new-session-tooltip",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;

    var PLUGIN_ID = "dsh-moyuu-new-session-tooltip";
    // The button's aria-label is t("session.new.label") in the shipped locales.
    var NEW_SESSION_LABELS = ["新建会话", "New session"];
    // IconNewChatOutline16 (the only 16×16 svg inside the New Session button).
    var CHAT_ICON = 'svg[viewBox="0 0 16 16"]';
    // Match the built-in toggle Tooltip's hint delay.
    var DELAY_MS = 500;
    // Keep the bubble within this many px of the viewport edges (built-in uses 12).
    var EDGE_MARGIN = 12;
    // Gap between the button's right edge and the bubble.
    var GAP = 8;

    var initialized = false;
    var timer = null;
    var currentButton = null;
    var tooltip = null;

    /**
     * Return the sidebar New Session button that `node` is (or is inside),
     * or null. Matches structurally so it survives locale changes and
     * CSS-module re-hashes.
     */
    function newSessionButtonFrom(node) {
      if (!(node instanceof Element)) return null;
      var btn = node.closest("button[aria-label]");
      if (btn === null) return null;
      var label = btn.getAttribute("aria-label");
      if (label === null || NEW_SESSION_LABELS.indexOf(label) === -1) return null;
      return btn.querySelector(CHAT_ICON) !== null ? btn : null;
    }

    /** The shortcut hint key label for this platform. */
    function shortcutLabel() {
      return /Mac|iPhone|iPad|iPod/.test(navigator.userAgent) ? "⌘K" : "Ctrl+K";
    }

    /** Remove any pending show + the visible bubble, forget the hovered button. */
    function hideTooltip() {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
      if (tooltip !== null) {
        tooltip.remove();
        tooltip = null;
      }
      currentButton = null;
    }

    /** Create and place the bubble to the right of the button. */
    function showTooltip(btn) {
      tooltip = document.createElement("div");
      tooltip.setAttribute("data-plugin", PLUGIN_ID);
      tooltip.setAttribute("role", "tooltip");
      tooltip.textContent = (btn.getAttribute("aria-label") || "New session") + " " + shortcutLabel();
      document.body.appendChild(tooltip);

      var rect = btn.getBoundingClientRect();
      var tw = tooltip.offsetWidth;
      var th = tooltip.offsetHeight;
      // Vertically centered (CSS translateY(-50%)), clamped horizontally.
      var x = Math.min(Math.max(rect.right + GAP, EDGE_MARGIN), window.innerWidth - tw - EDGE_MARGIN);
      tooltip.style.left = x + "px";
      tooltip.style.top = rect.top + rect.height / 2 + "px";
      void th;
    }

    function onMouseOver(event) {
      var btn = newSessionButtonFrom(event.target);
      if (btn === null) return;
      // Pointer moved between the button's own children — keep the pending bubble.
      if (btn === currentButton) return;
      currentButton = btn;
      if (timer !== null) clearTimeout(timer);
      timer = setTimeout(function () {
        timer = null;
        if (!btn.isConnected) {
          hideTooltip();
          return;
        }
        showTooltip(btn);
      }, DELAY_MS);
    }

    function onMouseOut(event) {
      if (currentButton === null) return;
      var to = event.relatedTarget;
      // Still over the button (e.g. its icon → label span): keep the bubble.
      if (to instanceof Element && currentButton.contains(to)) return;
      hideTooltip();
    }

    function onMouseDown(event) {
      if (!(event.target instanceof Element)) return;
      if (currentButton !== null && currentButton.contains(event.target)) hideTooltip();
    }

    function apply() {
      if (typeof document === "undefined" || document.documentElement === null) return;
      if (initialized) return;
      initialized = true;

      var style = document.createElement("style");
      style.setAttribute("data-plugin", PLUGIN_ID);
      style.setAttribute("data-plugin-css", "");
      style.textContent = [
        '[data-plugin="' + PLUGIN_ID + '"][role="tooltip"] {',
        "  position: fixed;",
        "  z-index: 10000;",
        "  width: max-content;",
        "  max-width: 50vw;",
        "  padding: 3px 7px;",
        "  border-radius: 8px;",
        "  background: var(--dsw-alias-tooltip-bg, rgba(31, 32, 36, 0.96));",
        "  color: var(--dsw-static-neutral-bluish-00, #f5f6f7);",
        "  font-size: 13px;",
        "  line-height: 20px;",
        "  white-space: nowrap;",
        "  pointer-events: none;",
        "  transform: translateY(-50%);",
        "  animation: dsh-moyuu-tooltip-in 0.15s ease-out;",
        "}",
        "@keyframes dsh-moyuu-tooltip-in {",
        "  from { opacity: 0; }",
        "  to { opacity: 1; }",
        "}"
      ].join("\n");
      document.head.appendChild(style);

      document.addEventListener("mouseover", onMouseOver, true);
      document.addEventListener("mouseout", onMouseOut, true);
      document.addEventListener("mousedown", onMouseDown, true);
    }

    exports.apply = apply;
    exports.inject = [];
    return module.exports;
  }
});