/**
 * dsh-moyuu-cmdk-new-session — client half.
 *
 * Keyboard shortcut feature: press Mod+K (Cmd+K on macOS, Ctrl+K elsewhere)
 * anywhere in the web UI to open a New Session.
 *
 * It reuses the exact same action as the sidebar's New Session button
 * (`ctx.workspaces.startSession()` — the shared New Session flow), so the
 * result is identical to clicking the button: with a current/recent
 * workspace it connects that workspace's blank session and navigates there;
 * with no workspace it clears into the New Session view.
 *
 * Design notes:
 *   - The listener is registered with capture so it fires even when the
 *     focus is inside an input/composer (the shortcut is a global command,
 *     not an edit action), and `preventDefault()` stops the browser's own
 *     Mod+K binding (e.g. Ctrl+K focus-address-bar in some browsers).
 *   - The modifier accepts Cmd (macOS) OR Ctrl (elsewhere); Alt/Shift
 *     combos are left alone so Mod+Shift+K etc. keep their own meaning.
 *   - The listener is registered inside `ctx.effect`, so HMR/unload removes
 *     it — no duplicated handlers after a reload, no leak on unload.
 *
 * Loader contract (see dsh-client-modules): the bundle registers a factory
 * via `window.__ModuleLoader__.load({ id, factory })`; the factory returns a
 * `module.exports` carrying `apply(ctx)` and the `inject` service list
 * (`workspaces`), which the Loader uses to gate activation on the service
 * being available.
 */
window.__ModuleLoader__.load({
  id: "dsh-moyuu-cmdk-new-session",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;

    /** Modifier accepted for the shortcut: Cmd on macOS, Ctrl elsewhere. */
    function isModifierKey(event) {
      return event.metaKey || event.ctrlKey;
    }

    /** The shortcut key itself ("k", ignoring Shift for the uppercase K). */
    function isShortcutKey(event) {
      return event.key === "k" || event.key === "K";
    }

    /**
     * Open a New Session through the same action the sidebar button uses.
     * @param ctx - client root context (workspaces service injected).
     */
    function apply(ctx) {
      if (typeof document === "undefined" || document.documentElement === null) return;

      ctx.effect(() => {
        var onKeyDown = function (event) {
          if (!isModifierKey(event)) return;
          if (!isShortcutKey(event)) return;
          // Keep Mod+Shift+K / Mod+Alt+K for anything that may want them.
          if (event.shiftKey || event.altKey) return;
          event.preventDefault();
          ctx.workspaces.startSession();
        };
        document.addEventListener("keydown", onKeyDown, true);
        return () => {
          document.removeEventListener("keydown", onKeyDown, true);
        };
      }, "dsh-moyuu-cmdk-new-session: keydown");
    }

    exports.apply = apply;
    exports.inject = ["workspaces"];
    return module.exports;
  }
});
