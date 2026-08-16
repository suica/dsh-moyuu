/**
 * dsh-moyuu-tab-in-textbox — Tab in text boxes inserts a tab character.
 *
 * DeepSeek Harness's web shell keeps the browser's global accessibility Tab
 * behavior: Tab moves keyboard focus between the page's focusable elements.
 * That is fine on buttons and links, but inside a text box it is a trap —
 * while composing a multi-line prompt in the chat composer (a <textarea>), or
 * editing any input / contenteditable field, Tab yanks focus out of the field
 * to the next focusable element instead of letting you indent.
 *
 * This client plugin suppresses that global Tab behavior ONLY inside editable
 * text boxes (textarea, text-like <input>, contenteditable) and replaces it
 * with the code-editor behavior the user wants: Tab (and Shift+Tab) insert a
 * literal tab character at the caret. Everywhere else the global Tab focus
 * behavior is left untouched.
 *
 * Strategy (survives React re-renders, no build-time edits):
 *   1. One capture-phase `keydown` listener on `document`, registered once.
 *   2. When the key is Tab (no ctrl/meta/alt) and `document.activeElement` is
 *      an editable text box, call preventDefault() (stop the focus jump) and
 *      insert "\t" at the caret.
 *   3. <input>/<textarea> — setRangeText + a synthetic bubbling `input` event,
 *      so the React controlled composer (`value={draft}` + onChange) adopts the
 *      new value and the draft state stays in sync.
 *   4. contenteditable — document.execCommand("insertText", false, "\t"),
 *      which fires the native input events the editor already listens to.
 *   5. IME composition (isComposing / keyCode 229) is left untouched.
 *
 * Loader contract (see dsh-client-modules): the bundle registers a factory
 * via `window.__ModuleLoader__.load({ id, factory })`; the factory returns a
 * `module.exports` carrying `apply(ctx)`, which the Loader invokes to
 * activate the plugin.
 */
window.__ModuleLoader__.load({
  id: "dsh-moyuu-tab-in-textbox",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;

    var MARKER = "data-dsh-moyuu-tab-in-textbox";
    var initialized = false;

    /**
     * <input> types that are single-line text boxes where inserting a literal
     * tab character is meaningful. Everything else (checkbox, radio, range,
     * color, file, button, ...) keeps the global Tab behavior.
     */
    var TEXT_LIKE_INPUT_TYPES = {
      "": true,
      text: true,
      search: true,
      url: true,
      tel: true,
      email: true,
      password: true
    };

    /** Is `el` an editable text box (textarea / text-like input / contenteditable)? */
    function isEditableTextBox(el) {
      if (!(el instanceof HTMLElement)) return false;
      if (el.isContentEditable) return true;
      var tag = el.tagName;
      if (tag === "TEXTAREA") return !el.disabled && !el.readOnly;
      if (tag !== "INPUT") return false;
      if (el.disabled || el.readOnly) return false;
      var type = (el.getAttribute("type") || "text").toLowerCase();
      return TEXT_LIKE_INPUT_TYPES[type] === true;
    }

    /** Insert a literal tab at the caret of an <input>/<textarea>. */
    function insertTabIntoField(el) {
      var start = el.selectionStart;
      if (start === null) return;
      var end = el.selectionEnd === null ? start : el.selectionEnd;
      el.setRangeText("\t", start, end, "end");
      // A bubbling input event makes React's onChange re-read the value, so
      // controlled fields (e.g. the composer textarea) keep state in sync.
      el.dispatchEvent(new Event("input", { bubbles: true }));
    }

    /** Insert a literal tab at the caret of a contenteditable host. */
    function insertTabIntoContentEditable() {
      document.execCommand("insertText", false, "\t");
    }

    function onKeyDown(e) {
      if (e.key !== "Tab") return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.isComposing || e.keyCode === 229) return;
      var active = document.activeElement;
      if (!isEditableTextBox(active)) return;
      e.preventDefault();
      if (active.isContentEditable) insertTabIntoContentEditable();
      else insertTabIntoField(active);
    }

    function apply() {
      if (typeof document === "undefined" || document.documentElement === null) return;
      if (initialized) return;
      initialized = true;
      // Capture phase: run before the browser's default focus move and before
      // element-level handlers, so preventDefault reliably stops the jump.
      document.addEventListener("keydown", onKeyDown, true);
      document.documentElement.setAttribute(MARKER, "active");
    }

    exports.apply = apply;
    exports.inject = [];
    return module.exports;
  }
});
