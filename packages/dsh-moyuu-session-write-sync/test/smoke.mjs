/**
 * dsh-moyuu-session-write-sync — concurrency smoke test.
 *
 * Drives the REAL stack (JSONL coordinator + cross-process write-lock backend +
 * this sync consumer) with two backend instances against ONE shared temp log,
 * proving:
 *
 *   1. a divergent stale append is rejected with `SESSION_ADVANCED`;
 *   2. the sync consumer emits exactly one `session/sync-conflict` event on the
 *      loser's ctx, plus a structured warning;
 *   3. re-attempting the stale write does NOT re-emit (one-shot per session id);
 *   4. the durable log stays intact (winner's events only, contiguous seqs).
 *
 * Requires the local node_modules symlinks from test/setup.sh (gitignored).
 * Run:  node --check index.js && node test/smoke.mjs
 */
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { strict as assert } from "node:assert";
import { SessionStore } from "@deepseek-ai/dsh-session";
import SyncBackend from "../index.js";

const SESSION_ID = "smoke-session";
const CWD = join(tmpdir(), "dsh-moyuu-sync-smoke-cwd");
mkdirSync(CWD, { recursive: true });

/** Minimal ctx the coordinator + sync backend need (no dsh boot). */
function makeCtx() {
	const emitted = [];
	const warnings = [];
	const ctx = {
		on: () => () => {},
		emit(event, payload) {
			emitted.push({ event, payload });
		},
		effect: () => () => {},
		logger: { warn: (message) => warnings.push(message) },
		get: (key) => (key === "sessions" ? ctx.sessions : void 0),
		// cordis Service registration requires ctx.reflect.provide; the
		// SessionStore constructor also calls ctx.inject (typert lookup only).
		reflect: { provide: () => {} },
		inject: () => {}
	};
	// A real SessionStore so prepareCore reconstructs sessions the production way.
	ctx.sessions = new SessionStore(ctx);
	return { ctx, emitted, warnings };
}

const root = mkdtempSync(join(tmpdir(), "dsh-moyuu-sync-smoke-"));
const a = makeCtx();
const b = makeCtx();
const ev = (type, seq, data) => ({
	type,
	seq,
	time: 1_700_000_000_000 + seq,
	data,
	// Surface-eligible events (user/message) require a surfaceOp marker, as a
	// real Session would attach.
	...(type === "user/message" ? { surfaceOp: "append" } : {})
});

try {
	const backendA = new SyncBackend(a.ctx, { root });
	const backendB = new SyncBackend(b.ctx, { root });

	const meta = { version: 0, id: SESSION_ID, cwd: CWD, createdAt: Date.now(), delegationDepth: 0 };

	// Profile B creates the session and durably commits a COMPLETE closed turn:
	// turn/start (0), user/message (1), turn/end (2).
	await backendB.create(meta);
	await backendB.append(SESSION_ID, [
		ev("turn/start", 0, { turn: 1 }),
		ev("user/message", 1, {
			id: "m-b1",
			role: "user",
			source: { kind: "user" },
			content: [{ type: "text", text: "from B" }]
		}),
		ev("turn/end", 2, { turn: 1, reason: { kind: "completed" } })
	]);

	// Profile A (independent in-memory state, SAME shared log) adopts the stored
	// prefix (cursor lands on 3 — the turn is closed, so no synthetic closers)
	// and advances the durable log with its own seq 3.
	await backendA.append(SESSION_ID, [ev("user/message", 3, {
		id: "m-a",
		role: "user",
		source: { kind: "user" },
		content: [{ type: "text", text: "from A" }]
	})]);

	// Profile B's cursor is still at 3; its own seq 3 is a divergent write.
	// The lock sees the durable tail already at 3 and rejects with
	// SESSION_ADVANCED instead of corrupting the log.
	let advancedError;
	try {
		await backendB.append(SESSION_ID, [ev("user/message", 3, {
			id: "m-b3",
			role: "user",
			source: { kind: "user" },
			content: [{ type: "text", text: "from B divergent" }]
		})]);
	} catch (error) {
		advancedError = error;
	}
	assert.ok(advancedError, "expected SESSION_ADVANCED");
	assert.equal(advancedError.code, "SESSION_ADVANCED");

	// The sync consumer surfaced ONE session/sync-conflict on B's ctx.
	const conflicts = b.emitted.filter((e) => e.event === SyncBackend.CONFLICT_EVENT);
	assert.equal(conflicts.length, 1, "expected exactly one sync-conflict event");
	assert.equal(conflicts[0].payload.id, SESSION_ID);
	assert.equal(conflicts[0].payload.code, "SESSION_ADVANCED");
	assert.ok(b.warnings.some((w) => w.includes("session write sync")), "expected a structured warning");

	// A second stale attempt is still rejected but does NOT re-emit
	// (one-shot notice per session id until the session is recreated).
	let secondError;
	try {
		await backendB.append(SESSION_ID, [ev("user/message", 3, {
			id: "m-b3b",
			role: "user",
			source: { kind: "user" },
			content: [{ type: "text", text: "from B again" }]
		})]);
	} catch (error) {
		secondError = error;
	}
	assert.ok(secondError && secondError.code === "SESSION_ADVANCED", "second stale write still rejected");
	assert.equal(b.emitted.filter((e) => e.event === SyncBackend.CONFLICT_EVENT).length, 1, "no re-emit");

	// The durable log is intact: exactly the winner's events, contiguous seqs
	// [0..3], with A's seq 3 standing (B's divergent seq 3 was never written).
	const stored = await backendA.loadStored(SESSION_ID);
	assert.ok(stored, "stored log exists");
	assert.deepEqual(stored.events.map((e) => e.seq), [0, 1, 2, 3], "contiguous winner seqs [0..3]");
	assert.equal(stored.events[3].data.content[0].text, "from A", "winner content at seq 3 stands");

	console.log("PASS: SESSION_ADVANCED detected; one session/sync-conflict emitted; durable log intact [0..3]");
} finally {
	rmSync(root, { recursive: true, force: true });
	rmSync(CWD, { recursive: true, force: true });
}
