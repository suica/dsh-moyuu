/**
 * dsh-moyuu-input-history — client half.
 *
 * Per-conversation in-memory prompt history for the DeepSeek Harness web UI
 * composer: the chat input keeps a per-session list of the prompts that were
 * ACTUALLY sent in the current conversation. With the caret on the first line
 * of the composer, ArrowUp/ArrowDown opens a small "历史记录" dropdown to recall
 * a previous prompt; Enter fills the highlighted entry into the input, Esc or
 * any other key collapses it (leaving your current text untouched).
 *
 * Design notes:
 *   - Per-conversation scoping: history is keyed by session id in a Map, so
 *     each conversation only ever recalls prompts sent in THAT conversation.
 *     Nothing is persisted — a page reload clears it.
 *   - Only real sends are recorded: an Enter keypress on a non-empty draft or a
 *     click of the send button. Manual deletes, IME composition artifacts, and
 *     draft resets on session/workspace switches are NOT recorded, so stray
 *     single characters never leak into the history.
 *   - The dropdown is registered into the app's own input-overlay slot
 *     ("conversation.input.overlay") as a React component, reusing the
 *     composer's standard props (useInput / inputActions / sessionId) and
 *     keeping the draft in sync through inputActions.setDraft — no direct DOM
 *     writes into the controlled textarea.
 *   - A document-capture keydown listener (registered once via ctx.effect)
 *     handles the recall keys before the InputBar's own handler.
 *
 * Loader contract (see dsh-client-modules): the bundle registers a factory via
 * window.__ModuleLoader__.load({ id, factory }); the factory returns a
 * module.exports carrying apply(ctx) and the inject service list ("slots"),
 * which the Loader uses to gate activation on the slots service being
 * available.
 */
window.__ModuleLoader__.load({
  id: "dsh-moyuu-input-history",
  factory: function (require) {
    var module = { exports: {} };
    var exports = module.exports;
    var React = require("react");

    var PLUGIN = "dsh-moyuu-input-history";
    var STYLE_TAG = "dsh-moyuu-input-history/history.css";

    function ensureStyle() {
      if (typeof document === "undefined" || document.head === null) return;
      if (document.querySelector("style[data-plugin-css=" + JSON.stringify(STYLE_TAG) + "]") !== null) return;
      var css = [
        ".dsh-hist-card {",
        "  z-index: 100;",
        "  position: absolute;",
        "  bottom: calc(100% + 6px);",
        "  left: 0;",
        "  right: 0;",
        "  max-height: min(320px, 45vh);",
        "  overflow-y: auto;",
        "  box-sizing: border-box;",
        "  border: 1px solid var(--dsw-alias-border-l1);",
        "  background: var(--dsw-alias-bg-overlay);",
        "  border-radius: 12px;",
        "  padding: 4px;",
        "  display: flex;",
        "  flex-direction: column;",
        "  font-size: 13px;",
        "  line-height: 1.45;",
        "}",
        ".dsh-hist-header {",
        "  color: var(--dsw-alias-label-secondary);",
        "  font-size: 11px;",
        "  line-height: 1;",
        "  padding: 6px 8px 8px;",
        "  user-select: none;",
        "  flex: none;",
        "}",
        ".dsh-hist-row {",
        "  cursor: pointer;",
        "  color: var(--dsw-alias-label-primary);",
        "  border-radius: 8px;",
        "  padding: 6px 8px;",
        "  white-space: pre-wrap;",
        "  word-break: break-word;",
        "}",
        ".dsh-hist-row[aria-selected='true'] {",
        "  background: var(--dsw-alias-bg-layer-2);",
        "}"
      ].join("\n");
      var tag = document.createElement("style");
      tag.setAttribute("data-plugin", PLUGIN);
      tag.setAttribute("data-plugin-css", STYLE_TAG);
      tag.textContent = css;
      document.head.appendChild(tag);
    }

    // Per-conversation in-memory history: Map<sessionId, string[]> (most recent first).
    var MAX_HISTORY = 100;
    var historyBySession = new Map();

    function historyOf(sessionId) {
      if (sessionId === void 0 || sessionId === null) return [];
      var h = historyBySession.get(sessionId);
      if (h === void 0) {
        h = [];
        historyBySession.set(sessionId, h);
      }
      return h;
    }

    function recordPrompt(sessionId, text) {
      if (typeof text !== "string" || text === "") return;
      var h = historyOf(sessionId);
      if (h.length > 0 && h[0] === text) return;
      h.unshift(text);
      if (h.length > MAX_HISTORY) h.length = MAX_HISTORY;
    }

    function HistoryPopup(props) {
      var useInput = props.useInput;
      var inputActions = props.inputActions;
      var sessionId = props.sessionId;
      var snapshot = typeof useInput === "function" ? useInput(function (s) { return s; }) : null;
      var draft = snapshot ? snapshot.draft : "";

      var uiState = React.useState({ open: false, index: 0 });
      var ui = uiState[0];
      var setUi = uiState[1];
      var uiRef = React.useRef(ui);
      uiRef.current = ui;
      var lastDraftRef = React.useRef("");
      var lastSessionRef = React.useRef(null);
      var inputActionsRef = React.useRef(inputActions);
      inputActionsRef.current = inputActions;
      var cardRef = React.useRef(null);
      var sendIntentRef = React.useRef(false);

      var history = historyOf(sessionId);
      var historyRef = React.useRef(history);
      historyRef.current = history;

      // Record ONLY a real send: the draft cleared while a send intent was
      // observed (Enter keypress or the send button). Manual clears/deletes are
      // not recorded, so stray single characters never leak into history.
      React.useEffect(function () {
        if (lastSessionRef.current !== sessionId) {
          lastSessionRef.current = sessionId;
          lastDraftRef.current = draft;
          return;
        }
        if (draft === "" && lastDraftRef.current !== "" && sendIntentRef.current) {
          recordPrompt(sessionId, lastDraftRef.current);
          sendIntentRef.current = false;
        }
        if (draft !== "") sendIntentRef.current = false;
        lastDraftRef.current = draft;
      }, [draft, sessionId]);

      // Keyboard: document-capture so we run before the InputBar's own handler.
      React.useEffect(function () {
        var onKeyDown = function (e) {
          if (e.isComposing) return;
          if (e.nativeEvent && (e.nativeEvent.isComposing || e.nativeEvent.keyCode === 229)) return;
          var t = e.target;
          if (!t || t.tagName !== "TEXTAREA") return;
          if (typeof t.closest !== "function") return;
          if (t.closest("[data-composer-card]") === null) return;

          var actions = inputActionsRef.current;
          if (!actions || typeof actions.setDraft !== "function") return;
          var h = historyRef.current;
          var cur = uiRef.current;

          // While the popup is open, ONLY ArrowUp/ArrowDown navigate; any other
          // key (including Enter/Escape handling below) collapses it.
          if (cur.open) {
            var key = e.key;
            if (key === "Escape") {
              e.preventDefault();
              e.stopPropagation();
              setUi({ open: false, index: 0 });
              return;
            }
            if (key === "Enter") {
              e.preventDefault();
              e.stopPropagation();
              if (h.length > 0) actions.setDraft(h[Math.min(cur.index, h.length - 1)]);
              setUi({ open: false, index: 0 });
              return;
            }
            if (key === "ArrowUp" || key === "ArrowDown") {
              if (h.length === 0) return;
              e.preventDefault();
              e.stopPropagation();
              var dir = key === "ArrowDown" ? 1 : -1;
              var next = Math.max(0, Math.min(h.length - 1, cur.index + dir));
              setUi({ open: true, index: next });
              return;
            }
            // Any other key: collapse the popup, leave the draft untouched, and
            // let the key proceed normally into the composer.
            setUi({ open: false, index: 0 });
            return;
          }

          // Closed state: only Enter / Escape / arrows, without modifiers.
          var closedKey = e.key;
          if (closedKey !== "ArrowUp" && closedKey !== "ArrowDown" && closedKey !== "Enter" && closedKey !== "Escape") return;
          if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
          if (closedKey === "Enter") {
            if (typeof t.value === "string" && t.value.trim() !== "") {
              sendIntentRef.current = true;
            }
            return;
          }
          if (closedKey === "Escape") return;
          // Arrows: open the popup when the caret is on the first line.
          if (h.length === 0) return;
          var value = t.value;
          var caret = typeof t.selectionStart === "number" ? t.selectionStart : value.length;
          var before = value.slice(0, caret);
          var onFirstLine = before.indexOf("\n") === -1;
          if (!onFirstLine) return;
          var line = before.split("\n").pop() || "";
          var trimmed = line.trimStart();
          if (trimmed.startsWith("/") || trimmed.startsWith("@")) return;
          e.preventDefault();
          e.stopPropagation();
          setUi({ open: true, index: 0 });
        };
        document.addEventListener("keydown", onKeyDown, true);
        return function () {
          document.removeEventListener("keydown", onKeyDown, true);
        };
      }, []);

      // Send button click: also mark a send intent (locale-safe label match).
      React.useEffect(function () {
        var onClick = function (e) {
          var t = e.target;
          if (!t || typeof t.closest !== "function") return;
          var btn = t.closest("[data-composer-card] button[aria-label]");
          if (btn === null) return;
          var label = btn.getAttribute("aria-label") || "";
          if (/send|\u53d1\u9001/i.test(label)) {
            sendIntentRef.current = true;
          }
        };
        document.addEventListener("click", onClick, true);
        return function () {
          document.removeEventListener("click", onClick, true);
        };
      }, []);

      // Clicking anywhere outside the popup dismisses it (keeps the current draft).
      React.useEffect(function () {
        if (!ui.open) return;
        var onPointerDown = function (ev) {
          var el = cardRef.current;
          if (el !== null && ev.target instanceof Node && el.contains(ev.target)) return;
          setUi({ open: false, index: 0 });
        };
        document.addEventListener("pointerdown", onPointerDown, true);
        return function () {
          document.removeEventListener("pointerdown", onPointerDown, true);
        };
      }, [ui.open]);

      // Keep the highlighted row visible while navigating.
      React.useEffect(function () {
        if (!ui.open) return;
        var active = cardRef.current && cardRef.current.querySelector('[aria-selected="true"]');
        if (active && typeof active.scrollIntoView === "function") active.scrollIntoView({ block: "nearest" });
      }, [ui.open, ui.index]);

      if (!ui.open) return null;

      return React.createElement(
        "div",
        {
          ref: cardRef,
          className: "dsh-hist-card",
          "data-plugin": PLUGIN,
          role: "listbox",
          "aria-label": "\u5386\u53f2\u8bb0\u5f55"
        },
        React.createElement("div", { className: "dsh-hist-header" }, "\u5386\u53f2\u8bb0\u5f55"),
        history.map(function (entry, i) {
          return React.createElement(
            "div",
            {
              key: String(i),
              role: "option",
              "aria-selected": i === ui.index,
              className: "dsh-hist-row",
              onMouseDown: function (ev) {
                ev.preventDefault();
                var actions = inputActionsRef.current;
                if (actions && typeof actions.setDraft === "function") actions.setDraft(entry);
                setUi({ open: false, index: 0 });
              }
            },
            entry
          );
        })
      );
    }

    function apply(ctx) {
      if (typeof document === "undefined" || document.documentElement === null) return;
      ensureStyle();
      var slots = ctx.slots;
      if (slots === void 0 || typeof slots.inject !== "function") return;
      ctx.effect(function () {
        return slots.inject("conversation.input.overlay", function () {
          return slots.register(
            { name: "conversation.input.overlay", id: "input-history", order: 2 },
            HistoryPopup
          );
        });
      }, "dsh-moyuu-input-history: input-overlay slot");
    }

    exports.apply = apply;
    exports.inject = ["slots"];
    return module.exports;
  }
});
