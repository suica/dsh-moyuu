/**
 * dsh-moyuu-session-emoji — node half: the session-title provider plugin.
 *
 * Names each session at naming time (its first user message) with an
 * **emoji-prefixed title**, e.g.:
 *
 *   💻 写一个 LRU 缓存
 *   🐛 修复登录态丢失
 *   🚀 deploy to production
 *
 * The emoji is chosen by the LLM itself: this is a first-prompt
 * **model-backed** provider that runs through the same auxiliary-LLM title
 * pipeline as the default `session-title-llm` row, but with a custom system
 * prompt that instructs the model to emit a concise title prefixed with one
 * fitting topic emoji. Title quality stays at LLM level — no brittle keyword
 * rules to maintain.
 *
 * Activating this plugin REPLACES the default LLM title provider:
 * `sessionTitle.register()` accepts exactly one provider, so the profile must
 * disable the `session-title-llm` row and insert this plugin in its place,
 * carrying the same model-title config keys (see README).
 *
 * Loader contract: a host plugin module exports `apply(ctx, config)` (plus
 * `name` / `inject` / `Config`), resolved by the cordis loader from the
 * module namespace.
 */
import z from "@deepseek-ai/schemastery";
import { BlockAssembler, createUserMessage, deepFreeze } from "@deepseek-ai/dsh-llm";
import { deadline } from "@deepseek-ai/dsh-timeout";
import { SessionTitleProviderId, normalizeSessionTitle } from "@deepseek-ai/dsh-session-title";
import { SESSION_TITLE_TIMEOUT_CODE, SessionTitleLlmConfigFields, resolveSessionTitleLlmConfig } from "@deepseek-ai/dsh-session-title-llm";

/** Plugin id — matches the activation id and the package name. */
export const name = "dsh-moyuu-session-emoji";

/** Host services this plugin requires. */
export const inject = ["sessionTitle", "llm", "sessions"];

/** Loader schema — the shared model-title config keys (same as `session-title-llm`). */
export const Config = z.object({
  targetWords: SessionTitleLlmConfigFields.targetWords,
  targetCjkCharacters: SessionTitleLlmConfigFields.targetCjkCharacters,
  maxInputBytes: SessionTitleLlmConfigFields.maxInputBytes,
  maxOutputTokens: SessionTitleLlmConfigFields.maxOutputTokens,
  timeoutMs: SessionTitleLlmConfigFields.timeoutMs,
  provider: SessionTitleLlmConfigFields.provider,
  model: SessionTitleLlmConfigFields.model
});

/**
 * Stable language-aware system instruction: the model picks the topic emoji
 * and writes the title body in one line. Kept deliberately close to the
 * shared `session-title-llm` prompt so behaviour (length, language, terminal
 * safety) stays consistent — the only addition is the emoji-prefix rule.
 */
export function systemPrompt(config) {
  return [
    "Create a concise title for an AI coding-assistant session from the supplied human messages.",
    "The title MUST start with exactly one fitting topic emoji followed by a single space, then the title text (for example: \u{1F41B} fix login state loss, \u{1F4BB} write an LRU cache, \u{1F680} deploy to production).",
    "Choose the emoji to match the dominant topic of the messages (bug fix, performance, testing, deployment, data, UI, research, translation, documentation, learning, planning, or general coding).",
    "Return only the title on one line, in plain text of natural language — no quotes, prefix, explanation, Markdown, XML, or terminal control codes. No code is allowed.",
    "Use the language of the messages.",
    `Aim for about ${config.targetWords} words in non-CJK languages, or ${config.targetCjkCharacters} CJK characters, excluding the emoji.`
  ].join("\n");
}

/** Frame exact messages as JSON so user text cannot break structural delimiters. */
export function frameMessages(messages) {
  return `Generate the session title from this JSON array of human messages:\n${JSON.stringify(messages)}`;
}

/** Resolve the explicit pair or the exact route captured from `request/header`. */
export function resolveRoute(config, request) {
  if (config.provider !== void 0 && config.model !== void 0) {
    return { provider: config.provider, model: config.model };
  }
  if (request.route === void 0) {
    throw new Error("dsh-moyuu-session-emoji: no logged request route is available; configure provider and model together");
  }
  return request.route;
}

/** Translate terminal finish reasons into an auxiliary-call failure. */
export function finishError(finish) {
  switch (finish.kind) {
    case "stop": return;
    case "error":
    case "aborted": {
      const error = new Error(finish.failure.message);
      error.code = finish.failure.code;
      return error;
    }
    case "max-tokens": return new Error("dsh-moyuu-session-emoji: title output reached maxOutputTokens");
    case "tool-calls": return new Error("dsh-moyuu-session-emoji: title model unexpectedly requested a tool");
    default: return new Error(`dsh-moyuu-session-emoji: unsupported finish reason "${String(finish.kind)}"`);
  }
}

/**
 * Generate one emoji-prefixed title through the auxiliary LLM call — the same
 * framing / deadline / assembly / normalization policy as the shared
 * `generateSessionTitleWithLlm`, but with the emoji system prompt.
 * @param ctx - context exposing the registered LLM service.
 * @param config - validated model-provider policy.
 * @param request - service-owned session, route, message snapshot, and cancellation.
 * @param selectedMessages - exact provider-selected subset to frame and attribute.
 * @param titleProvider - registered title-provider identity recorded with the request.
 * @returns normalized non-empty title, exact source seqs, and used model route.
 */
export async function generateEmojiTitle(ctx, config, request, selectedMessages, titleProvider) {
  request.signal.throwIfAborted();
  if (selectedMessages.length === 0) {
    throw new Error("dsh-moyuu-session-emoji: at least one source message is required");
  }
  const framedInput = frameMessages(selectedMessages);
  const inputBytes = Buffer.byteLength(framedInput, "utf8");
  if (inputBytes > config.maxInputBytes) {
    throw new Error(`dsh-moyuu-session-emoji: input is ${inputBytes} bytes, exceeding maxInputBytes ${config.maxInputBytes}`);
  }
  const route = resolveRoute(config, request);
  const messages = [createUserMessage({
    content: [{ type: "text", text: framedInput }],
    source: { kind: "plugin", plugin: name }
  })];
  const system = systemPrompt(config);
  const callDeadline = deadline(request.signal, config.timeoutMs, SESSION_TITLE_TIMEOUT_CODE);
  const options = deepFreeze({
    provider: route.provider,
    model: route.model,
    messages,
    system,
    maxTokens: config.maxOutputTokens,
    sessionId: request.session.id,
    purpose: "session-title",
    signal: callDeadline.signal
  });
  request.session.append("session/title-llm-request", {
    titleProvider,
    messageSeqs: selectedMessages.map((message) => message.seq),
    route,
    system,
    messages,
    maxTokens: config.maxOutputTokens
  });
  callDeadline.signal.throwIfAborted();
  const assembler = new BlockAssembler();
  try {
    for await (const chunk of ctx.llm.stream(options)) {
      callDeadline.signal.throwIfAborted();
      assembler.push(chunk);
    }
  } finally {
    callDeadline[Symbol.dispose]?.();
  }
  callDeadline.signal.throwIfAborted();
  const terminalError = finishError(assembler.finish);
  if (terminalError !== void 0) throw terminalError;
  const blocks = assembler.blocks();
  if (blocks.some((block) => block.type === "tool-call")) {
    throw new Error("dsh-moyuu-session-emoji: title output must contain text only");
  }
  const title = normalizeSessionTitle(
    blocks.filter((block) => block.type === "text").map((block) => block.text).join(" "),
    Number.MAX_SAFE_INTEGER
  );
  if (title.length === 0) {
    throw new Error("dsh-moyuu-session-emoji: title model produced no text");
  }
  return {
    title,
    messageSeqs: selectedMessages.map((message) => message.seq),
    model: route
  };
}

/**
 * Register the sole session-title provider: a first-prompt model provider
 * whose `generate` derives the emoji-prefixed title through the LLM. Throws
 * (per the service's one-provider contract) if another provider — e.g. the
 * default `session-title-llm` — is already registered; the profile must
 * disable it.
 * @param ctx - host context exposing the `sessionTitle` and `llm` services.
 * @param config - validated model-title policy (see {@link Config}).
 */
export function apply(ctx, config) {
  const resolved = resolveSessionTitleLlmConfig(config);
  const titleProvider = SessionTitleProviderId(name);
  ctx.sessionTitle.register({
    id: titleProvider,
    automatic: "first-prompt",
    async generate(request) {
      const first = request.messages[0];
      if (first === void 0) {
        throw new Error("dsh-moyuu-session-emoji: first-prompt provider requires one human message");
      }
      return generateEmojiTitle(ctx, resolved, request, [first], titleProvider);
    }
  });
}
