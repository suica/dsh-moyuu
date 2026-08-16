/**
 * dsh-moyuu-session-context-menu — session right-click → the session's "⋯"
 * (More) menu, opened at the pointer, for the DeepSeek Harness web UI.
 *
 * The session list in the sidebar (dsh-client-ui-workspace) renders each
 * session as a <div role="treeitem" aria-selected=…> row whose trailing "⋯"
 * trigger opens a portalled Menu (Rename / Fork / Archive). The Menu anchors
 * itself to the trigger's wrapper span and measures it in a layout effect, so
 * the menu can be made to open at the right-click point by holding that
 * wrapper at the pointer for the instant the menu measures it.
 *
 * This plugin makes a right-click (contextmenu) on a session row behave
 * exactly like clicking that row's "⋯" trigger, but opens the menu **at the
 * cursor position** at the moment of the right-click — like a native context
 * menu — instead of at the trigger. It reuses the app's own Menu (items and
 * callbacks are untouched), so there is no re-implementation of the menu.
 *
 * Strategy (survives React re-renders, no build-time edits):
 *   - one document-level contextmenu listener (capture) persists across React
 *     re-renders; the rows themselves need no instrumentation;
 *   - session rows are matched structurally (role="treeitem" + aria-selected,
 *     which workspace header rows and search rows do not carry) and the
 *     trigger via its ellipsis icon, so the plugin is locale-independent;
 *   - to open at the pointer, the trigger's wrapper span is held at the
 *     right-click coordinates (the ⋯ icon is hidden for that instant), the
 *     trigger is clicked so the app's Menu measures the wrapper there, and
 *     the wrapper is restored as soon as the menu has been placed. React
 *     never touches styles it did not set, so the measured position persists
 *     across later re-renders; the native browser context menu is suppressed
 *     only for session rows.
 *
 * Loader contract (see dsh-client-modules): the bundle registers a factory
 * via `window.__ModuleLoader__.load({ id, factory })`; the factory returns a
 * `module.exports` carrying `apply(ctx)`, which the Loader invokes to
 * activate the plugin.
 */
window.__ModuleLoader__.load({
  id: "dsh-moyuu-session-context-menu",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;

    var initialized = false;
    // The "⋯" icon (IconEllipsisOutline16 from dsh-client-ui-primitives) is a
    // 16×16 SVG; inside a session row it is the only 16×16 icon (the status
    // dot, when present, is a 10×10 SVG), and it sits in the row's single
    // trigger button.
    var ELLIPSIS_ICON = 'svg[viewBox="0 0 16 16"]';
    // The Menu adds a 4px gap below the anchor (side: "bottom", align: "start").
    var ANCHOR_GAP = 4;

    /**
     * Find the session row under the pointer. Session rows are
     * <div role="treeitem" aria-selected=…>; workspace header rows carry
     * aria-expanded instead, and search result rows are <button>s — neither
     * matches, so only real session rows are handled.
     */
    function sessionRowFrom(target) {
      if (!(target instanceof Element)) return null;
      return target.closest('div[role="treeitem"][aria-selected]');
    }

    /**
     * Find the "⋯" (More) trigger button inside a session row: the button
     * wrapping the 16×16 ellipsis icon. Returns null when the row has no such
     * trigger (e.g. the blank new-session row), so native behavior is left
     * alone in that case.
     */
    function moreButtonFrom(row) {
      var icon = row.querySelector(ELLIPSIS_ICON);
      if (!icon) return null;
      var button = icon.closest("button");
      return button !== null && button.getAttribute("aria-label") !== null ? button : null;
    }

    /**
     * Open the row's More menu anchored at the pointer, then put the trigger
     * wrapper back in the row. Falls back to a plain trigger click (the
     * default ⋯-anchored menu) when the wrapper cannot be positioned at the
     * pointer (e.g. a keyboard-triggered context menu on an unhovered row).
     */
    function openMenuAtPointer(row, more, x, y) {
      // The trigger sits inside the Menu's anchor wrapper span (its parent).
      var anchor = more.parentElement;
      // offsetParent is null when the row is not hovered (the actions span is
      // CSS-hidden), so the wrapper has no box to anchor at the pointer.
      if (anchor === null || more.offsetParent === null) {
        more.click();
        return;
      }
      var buttonBox = more.getBoundingClientRect();
      var saved = {
        position: anchor.style.position,
        left: anchor.style.left,
        top: anchor.style.top,
        margin: anchor.style.margin,
        buttonVisibility: more.style.visibility
      };
      // Hold the wrapper at the pointer so the Menu (side: "bottom") places
      // its top-left on it: bottom = top + height, and the Menu adds a 4px
      // gap, so top = y - height - 4. Hide the ⋯ icon for the instant the
      // wrapper sits at the pointer so no orphaned icon is drawn there.
      more.style.visibility = "hidden";
      anchor.style.position = "fixed";
      anchor.style.left = x + "px";
      anchor.style.top = (y - buttonBox.height - ANCHOR_GAP) + "px";
      anchor.style.margin = "0";
      more.click();

      // Restore the wrapper once the menu has been placed (React committed and
      // the Menu's layout effect measured the wrapper at the pointer), or
      // after a hard timeout so the trigger never stays displaced.
      var deadline = performance.now() + 300;
      var settle = function () {
        var menu = document.querySelector('[role="menu"]');
        var placed = menu !== null && menu.style.visibility !== "hidden";
        if (placed || performance.now() > deadline) {
          anchor.style.position = saved.position;
          anchor.style.left = saved.left;
          anchor.style.top = saved.top;
          anchor.style.margin = saved.margin;
          more.style.visibility = saved.buttonVisibility;
          return;
        }
        requestAnimationFrame(settle);
      };
      requestAnimationFrame(settle);
    }

    function onContextMenu(event) {
      var row = sessionRowFrom(event.target);
      if (row === null) return;
      var more = moreButtonFrom(row);
      if (more === null) return;
      // Right-clicking a session opens its "⋯" menu at the pointer — and
      // nothing else: no session open (the trigger's onClick stops
      // propagation) and no native browser context menu.
      event.preventDefault();
      openMenuAtPointer(row, more, event.clientX, event.clientY);
    }

    function apply() {
      if (typeof document === "undefined" || document.documentElement === null) return;
      // Guard against re-activation (e.g. HMR) registering duplicate listeners.
      if (initialized) return;
      initialized = true;
      document.addEventListener("contextmenu", onContextMenu, true);
    }

    exports.apply = apply;
    exports.inject = [];
    return module.exports;
  }
});
