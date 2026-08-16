/**
 * Convergent multi-profile write tests for the locking backend.
 *
 * Verifies the full convergence contract (no SESSION_ADVANCED, no corruption,
 * no dropped events) for every way two profiles can race one shared session:
 *
 *   1. identical deterministic closers from two cold openers (the original
 *      idempotent-convergence case);
 *   2. a live writer's closers racing a cold repairer's (different turn/end
 *      `reason`) — the reported "modified by another process" failure;
 *   3. a live writer's NEW user turn racing the repairer's session/end-seed
 *      marker — the stale writer must re-sequence, not drop or corrupt;
 *   4. a genuine concurrent divergence (two different messages racing one seq)
 *      — both are preserved in order, never one overwriting the other.
 *
 * Run: node test/converge.mjs
 */
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { strict as assert } from "node:assert";
import { SessionStore } from "@deepseek-ai/dsh-session";
import LockingBackend from "../index.js";

const CWD = join(tmpdir(), "dsh-moyuu-converge-cwd");
mkdirSync(CWD, { recursive: true });

function makeCtx() {
	const ctx = {
		on: () => () => {},
		emit: () => {},
		effect: () => () => {},
		logger: { warn: () => {}, error: () => {} },
		get: (key) => (key === "sessions" ? ctx.sessions : void 0),
		reflect: { provide: () => {} },
		inject: () => {}
	};
	ctx.sessions = new SessionStore(ctx);
	return ctx;
}

const ev = (type, seq, data, extra = {}) => ({
	type,
	seq,
	time: 1_700_000_000_000 + seq,
	data,
	...(type === "user/message" ? { surfaceOp: "append" } : {}),
	...extra
});

/** Open a shared root with two independent backend instances (two profiles). */
function setup() {
	const root = mkdtempSync(join(tmpdir(), "dsh-moyuu-converge-"));
	const a = new LockingBackend(makeCtx(), { root });
	const b = new LockingBackend(makeCtx(), { root });
	return { root, a, b };
}

const metaFor = (id) => ({ version: 0, id, cwd: CWD, createdAt: Date.now(), delegationDepth: 0 });

/** Write an interrupted turn (turn 1 step 1, real events 0..4, turn left open). */
async function writeInterruptedTurn(backend, id) {
	await backend.create(metaFor(id));
	await backend.append(id, [
		ev("turn/start", 0, { turn: 1 }),
		ev("user/message", 1, { id: "u1", role: "user", source: { kind: "user" }, content: [{ type: "text", text: "hi" }] }),
		ev("step/start", 2, { turn: 1, step: 1 }),
		ev("assistant/chunk", 3, { turn: 1, step: 1, chunk: { type: "text-delta", index: 0, text: "hel" } }),
		ev("assistant/chunk", 4, { turn: 1, step: 1, chunk: { type: "text-delta", index: 0, text: "lo" } })
	]);
}

/** Assert the durable log is contiguous and has the given event sequence. */
async function assertContiguous(backend, id, lastSeq) {
	const stored = await backend.loadStored(id);
	const seqs = stored.events.map((e) => e.seq);
	assert.deepEqual(seqs, Array.from({ length: lastSeq + 1 }, (_, i) => i), `seqs contiguous [0..${lastSeq}] for ${id}, got ${JSON.stringify(seqs)}`);
	return stored;
}

let passed = 0;
async function scenario(name, fn) {
	try {
		await fn();
		passed += 1;
		console.log(`PASS: ${name}`);
	} catch (error) {
		console.error(`FAIL: ${name}`);
		throw error;
	}
}

try {
	// --- 1. identical deterministic closers from two cold openers converge ---
	await scenario("identical closers from two cold openers converge", async () => {
		const { root, a, b } = setup();
		try {
			await writeInterruptedTurn(a, "s1");
			await b.load("s1"); // B repairs: closers 5,6
			await a.load("s1"); // A's second open also repairs -> same closers
			// The second repairer's closers are identical -> skipped idempotently.
			const stored = await assertContiguous(b, "s1", 6);
			assert.equal(stored.events[5].type, "step/end");
			assert.equal(stored.events[6].type, "turn/end");
		} finally { rmSync(root, { recursive: true, force: true }); }
	});

	// --- 2. live writer's closers racing a cold repairer's (different reason) ---
	await scenario("live writer's closers race a cold repairer's (different reason)", async () => {
		const { root, a, b } = setup();
		try {
			await writeInterruptedTurn(a, "s2"); // A's durable cursor: 5
			await b.load("s2"); // B repairs -> closers 5,6
			// A flushes its OWN closers; its turn/end reason is the real one.
			await a.append("s2", [
				ev("step/end", 5, { turn: 1, step: 1 }),
				ev("turn/end", 6, { turn: 1, reason: { kind: "aborted", reason: "user pressed stop" } })
			]);
			const stored = await assertContiguous(b, "s2", 6);
			// B's synthetic closer stands (first committed); A's differing reason
			// was treated as the same logical closer and skipped.
			assert.deepEqual(stored.events[6].data.reason, { kind: "interrupted" });
		} finally { rmSync(root, { recursive: true, force: true }); }
	});

	// --- 3. stale writer's NEW user turn races the repairer's end-seed marker ---
	await scenario("stale writer's new user turn re-sequences past the repairer's marker", async () => {
		const { root, a, b } = setup();
		try {
			await writeInterruptedTurn(a, "s3"); // A's durable cursor: 5
			await b.load("s3"); // B repairs -> closers 5,6
			await b.append("s3", [ev("session/end-seed", 7, {})]); // B's live attach
			// A's closers are covered -> skipped; cursor stays aligned with A's
			// session so the following real events keep flowing.
			await a.append("s3", [
				ev("step/end", 5, { turn: 1, step: 1 }),
				ev("turn/end", 6, { turn: 1, reason: { kind: "aborted", reason: "stop" } })
			]);
			// A's genuinely new user turn (its next message) is re-sequenced after
			// B's session/end-seed marker, not dropped and not written over it.
			await a.append("s3", [
				ev("user/message", 7, { id: "u2", role: "user", source: { kind: "user" }, content: [{ type: "text", text: "still here?" }] }),
				ev("turn/start", 8, { turn: 2 })
			]);
			const stored = await assertContiguous(b, "s3", 9);
			const u2 = stored.events.find((e) => e.type === "user/message" && e.data?.content?.[0]?.text === "still here?");
			assert.ok(u2, "user message persisted");
			assert.ok(u2.seq === 8, `user message re-sequenced past marker, got seq ${u2.seq}`);
			assert.equal(stored.events[7].type, "session/end-seed", "marker intact");
		} finally { rmSync(root, { recursive: true, force: true }); }
	});

	// --- 4. genuine concurrent divergence: different messages racing one seq ---
	await scenario("genuine divergence (different messages at one seq) preserves both", async () => {
		const { root, a, b } = setup();
		try {
			await writeInterruptedTurn(a, "s4"); // durable cursor 5
			await b.load("s4"); // B repairs -> 5,6
			await b.append("s4", [
				ev("user/message", 7, { id: "b-msg", role: "user", source: { kind: "user" }, content: [{ type: "text", text: "from B" }] }),
				ev("turn/start", 8, { turn: 2 })
			]);
			// A, still stale at cursor 5, flushes its own contiguous batch — its
			// closers (5,6) plus a NEW user turn (7,8) whose message is genuinely
			// divergent from B's message at seq 7. The closers are covered and
			// skipped; A's divergent message is re-sequenced after B's events,
			// never overwrites B, and never errors.
			await a.append("s4", [
				ev("step/end", 5, { turn: 1, step: 1 }),
				ev("turn/end", 6, { turn: 1, reason: { kind: "aborted", reason: "stop" } }),
				ev("user/message", 7, { id: "a-msg", role: "user", source: { kind: "user" }, content: [{ type: "text", text: "from A" }] }),
				ev("turn/start", 8, { turn: 3 })
			]);
			const stored = await assertContiguous(b, "s4", 10);
			const texts = stored.events.filter((e) => e.type === "user/message").map((e) => e.data.content[0].text);
			assert.deepEqual(texts, ["hi", "from B", "from A"], "both divergent messages preserved in commit order");
		} finally { rmSync(root, { recursive: true, force: true }); }
	});

	console.log(`\nAll ${passed} convergence scenarios passed.`);
} finally {
	rmSync(CWD, { recursive: true, force: true });
}
