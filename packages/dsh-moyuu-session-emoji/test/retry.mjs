/**
 * Verify the bounded title-call retry: a single transient auxiliary-LLM
 * failure must NOT permanently strand the session on the plain-text fallback
 * title (the failure mode where a session title is plain text and never
 * changes, because the first-prompt provider is never re-triggered).
 *
 * Drives `generateEmojiTitle` with a fake `ctx.llm.stream` and asserts the
 * retry policy:
 *   1. first-try success  -> exactly one LLM call, emoji title returned
 *   2. transient throw     -> second attempt lands the emoji title (2 calls)
 *   3. real timeout        -> deadline aborts attempt 1, attempt 2 succeeds
 *   4. persistent failure  -> throws the last error (2 calls, no swallow)
 *   5. already-aborted     -> throws immediately, LLM never called
 *   6. abort mid-attempt   -> throws, no retry (cancellation is not retried)
 */
import { strict as assert } from "node:assert";
import { resolveSessionTitleLlmConfig } from "@deepseek-ai/dsh-session-title-llm";
import { generateEmojiTitle, MAX_TITLE_CALL_ATTEMPTS } from "../index.js";

const CONFIG = resolveSessionTitleLlmConfig({
  targetWords: 5,
  targetCjkCharacters: 10,
  maxInputBytes: 4096,
  maxOutputTokens: 64,
  timeoutMs: 100,
  provider: "fake-provider",
  model: "fake-model"
});

const ROUTE = { provider: "fake-provider", model: "fake-model" };

const okChunks = [
  { type: "text-delta", index: 0, text: "💻 fix the login page bug" },
  { type: "finish", reason: { kind: "stop" } }
];

function makeRequest({ aborted = false, abortBefore = false } = {}) {
  const controller = new AbortController();
  if (abortBefore) controller.abort(new Error("session disposed"));
  const logged = [];
  return {
    request: {
      signal: controller.signal,
      route: ROUTE,
      session: {
        id: "test-session",
        append(type, data) {
          logged.push({ type, data });
        }
      }
    },
    logged,
    abort() {
      controller.abort(new Error("session disposed"));
    }
  };
}

/** Build an async-generator `stream` that runs a script per call. */
function llmWith(script) {
  let calls = 0;
  return {
    calls: () => calls,
    stream(options) {
      calls += 1;
      const behavior = script(calls, options);
      return (async function* () {
        for (const chunk of behavior) {
          if (chunk instanceof Error) throw chunk;
          if (chunk && typeof chunk.delay === "number") {
            await new Promise((resolve) => setTimeout(resolve, chunk.delay));
            continue;
          }
          yield chunk;
        }
      })();
    }
  };
}

const selectors = [{ seq: 0, text: "fix the login page bug" }];

const ctx = (llm, logger = { warn: () => {}, error: () => {} }) => ({
  llm,
  logger
});

let passed = 0;
const check = (name, fn) => {
  fn();
  passed += 1;
  console.log(`PASS: ${name}`);
};

// 1. First-try success: exactly one call, emoji title returned.
{
  const llm = llmWith(() => okChunks);
  const { request } = makeRequest();
  const result = await generateEmojiTitle(ctx(llm), CONFIG, request, selectors, "dsh-moyuu-session-emoji");
  check("first-try success returns the emoji title", () => {
    assert.equal(result.title, "💻 fix the login page bug");
    assert.deepEqual(result.messageSeqs, [0]);
    assert.deepEqual(result.model, ROUTE);
    assert.equal(llm.calls(), 1, "no retry on first-try success");
  });
}

// 2. Transient throw on attempt 1 -> attempt 2 succeeds with the emoji title.
{
  const llm = llmWith((call) => (call === 1 ? [new Error("network blip")] : okChunks));
  const { request, logged } = makeRequest();
  const result = await generateEmojiTitle(ctx(llm), CONFIG, request, selectors, "dsh-moyuu-session-emoji");
  check("transient failure is retried and lands the emoji title", () => {
    assert.equal(result.title, "💻 fix the login page bug");
    assert.equal(llm.calls(), 2, "retried exactly once");
    const requests = logged.filter((e) => e.type === "session/title-llm-request");
    assert.equal(requests.length, 2, "one title-llm-request logged per attempt");
  });
}

// 3. Real deadline timeout on attempt 1 (stream stalls past timeoutMs) -> retry succeeds.
{
  const llm = llmWith((call) => (call === 1 ? [{ delay: 30 }] : okChunks));
  const config = { ...CONFIG, timeoutMs: 10 };
  const { request } = makeRequest();
  const result = await generateEmojiTitle(ctx(llm), config, request, selectors, "dsh-moyuu-session-emoji");
  check("deadline timeout is retried and lands the emoji title", () => {
    assert.equal(result.title, "💻 fix the login page bug");
    assert.equal(llm.calls(), 2, "timed-out attempt was retried");
  });
}

// 4. Persistent failure -> throws the LAST error (no silent swallow).
{
  const boom = new Error("quota exceeded");
  const llm = llmWith(() => [boom]);
  const { request } = makeRequest();
  await assert.rejects(
    generateEmojiTitle(ctx(llm), CONFIG, request, selectors, "dsh-moyuu-session-emoji"),
    /quota exceeded/,
    "persistent failure surfaces the last error"
  );
  check("persistent failure throws after the bounded attempts", () => {
    assert.equal(llm.calls(), MAX_TITLE_CALL_ATTEMPTS, "bounded attempts used");
  });
}

// 5. Request already aborted -> throws before any LLM call, no retry.
{
  const llm = llmWith(() => okChunks);
  const { request } = makeRequest({ abortBefore: true });
  await assert.rejects(
    generateEmojiTitle(ctx(llm), CONFIG, request, selectors, "dsh-moyuu-session-emoji"),
    /session disposed/,
    "cancellation is not retried"
  );
  check("pre-aborted request throws without calling the LLM", () => {
    assert.equal(llm.calls(), 0, "LLM never called for an aborted request");
  });
}

// 6. Abort mid-attempt -> throws immediately, no retry.
{
  const llm = llmWith((call) => {
    if (call === 1) return [new Error("session disposed")];
    return okChunks;
  });
  const { request, abort } = makeRequest();
  const pending = generateEmojiTitle(ctx(llm), CONFIG, request, selectors, "dsh-moyuu-session-emoji");
  abort(); // simulate session disposal racing the in-flight call
  await assert.rejects(pending, /session disposed/, "cancellation is not retried");
  check("mid-attempt abort throws without retrying", () => {
    assert.equal(llm.calls(), 1, "no retry after cancellation");
  });
}

console.log(`\nAll ${passed} retry checks passed.`);
