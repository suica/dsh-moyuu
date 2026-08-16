/**
 * Reproduce the multi-profile SESSION_ADVANCED failure.
 *
 * Scenario (matches the real "talking to an existing session with multiple
 * profiles open" report):
 *   1. Profile A has a session LIVE and its turn gets interrupted. Its closing
 *      events (step/end, turn/end) are buffered in its write-behind; the
 *      durable log still ends at the last real chunk (open turn).
 *   2. Profile B (a second profile sharing the same session root) opens the
 *      session cold, sees the interrupted turn, and repairs it — committing
 *      the deterministic closers (step/end, turn/end{interrupted}) plus its
 *      session/end-seed marker. Durable tail advances.
 *   3. Profile A's write-behind flushes ITS closers. Its turn/end carries a
 *      different `reason` (the real abort/error reason, not the synthetic
 *      "interrupted"), so the locking backend rejects with SESSION_ADVANCED
 *      and the run fails with "was modified by another process".
 *
 * The fix must make step 3 CONVERGE instead of rejecting: A's turn is already
 * closed on disk, so its redundant closers are skipped, its cursor is advanced
 * to the durable tail, and any genuinely new events it still needs to write
 * are re-sequenced to continue after the durable log — with NO error and NO
 * corruption.
 */
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { strict as assert } from "node:assert";
import { SessionStore } from "@deepseek-ai/dsh-session";
import LockingBackend from "../index.js";

const SESSION_ID = "repro-session";
const CWD = join(tmpdir(), "dsh-moyuu-repro-cwd");
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

const root = mkdtempSync(join(tmpdir(), "dsh-moyuu-repro-"));
const ctxA = makeCtx();
const ctxB = makeCtx();
try {
	const backendA = new LockingBackend(ctxA, { root });
	const backendB = new LockingBackend(ctxB, { root });
	const meta = { version: 0, id: SESSION_ID, cwd: CWD, createdAt: Date.now(), delegationDepth: 0 };

	// Step 1: profile A materializes the session and runs an interrupted turn.
	// turn 1 step 1, real events end at chunk seq 4 (open turn — no closers).
	await backendA.create(meta);
	await backendA.append(SESSION_ID, [
		ev("turn/start", 0, { turn: 1 }),
		ev("user/message", 1, { id: "u1", role: "user", source: { kind: "user" }, content: [{ type: "text", text: "hi" }] }),
		ev("step/start", 2, { turn: 1, step: 1 }),
		ev("assistant/chunk", 3, { turn: 1, step: 1, chunk: { type: "text-delta", index: 0, text: "hel" } }),
		ev("assistant/chunk", 4, { turn: 1, step: 1, chunk: { type: "text-delta", index: 0, text: "lo" } })
	]);
	// A's durable cursor is 5 and its session thinks the turn is still open.

	// Step 2: profile B opens the session cold. prepareCore repairs the
	// interrupted turn: closers step/end@5, turn/end@6{interrupted} are
	// committed durably. When B attaches a live Session, its constructor adds a
	// session/end-seed marker — model that the same way the coordinator's
	// attachPrepared suffix append does (seq 7).
	const loaded = await backendB.load(SESSION_ID);
	assert.equal(loaded.events.at(-1).seq, 6, "B's repair committed closers through seq 6");
	assert.equal(loaded.events[5].type, "step/end");
	assert.equal(loaded.events[6].type, "turn/end");
	await backendB.append(SESSION_ID, [ev("session/end-seed", 7, {})]);
	// Durable tail is now 7 (B's closers + session/end-seed), while profile A's
	// live session still ends at its own seq 4 (cursor 5) — it has never seen
	// B's repair, so its closing events race B's committed ones.

	// Step 3: profile A flushes ITS closing events for the interrupted turn.
	// step/end matches B's, but turn/end reason differs (aborted, not the
	// synthetic "interrupted"). This is the exact SESSION_ADVANCED trigger.
	let advancedError;
	try {
		await backendA.append(SESSION_ID, [
			ev("step/end", 5, { turn: 1, step: 1 }),
			ev("turn/end", 6, { turn: 1, reason: { kind: "aborted", reason: "user pressed stop" } })
		]);
	} catch (error) {
		advancedError = error;
	}

	if (advancedError !== void 0) {
		console.log(`REPRODUCED: ${advancedError.message} (code=${advancedError.code})`);
	} else {
		console.log("NO ERROR: profile A's closers converged (fix working)");
	}

	// Cursor-alignment invariant: after convergence, profile A's coordinator
	// cursor must track its OWN session's next seq (not jump ahead to the
	// durable tail), so the write-behind's `e.seq >= cursor` filter never drops
	// A's subsequent events and appendCore's seq check never mismatches.
	{
		const cursor = backendA.coordinator.states.get(SESSION_ID)?.cursor;
		// A's session: 5 real events (0..4) + its 2 closers = next seq 7.
		assert.equal(cursor, 7, `A's cursor tracks its session (7), got ${cursor}`);
		console.log("Cursor aligned with profile A's session (7) after convergence.");
	}

	// The durable log must never contain A's divergent turn/end — B's committed
	// closers stand, and seqs must stay contiguous [0..7].
	const stored = await backendA.loadStored(SESSION_ID);
	const seqs = stored.events.map((e) => e.seq);
	assert.deepEqual(seqs, Array.from({ length: 8 }, (_, i) => i), `durable seqs contiguous [0..7], got ${JSON.stringify(seqs)}`);
	assert.equal(stored.events[6].type, "turn/end", "B's turn/end stands at seq 6");
	assert.equal(stored.events[7].type, "session/end-seed", "B's session/end-seed stands at seq 7");
	console.log("Durable log intact: contiguous seqs [0..7], B's closers stand.");

	// After convergence, profile A must be able to keep writing (new user turn)
	// without a seq-mismatch failure and without dropping events — its
	// user/message is re-sequenced past B's session/end-seed marker, not lost.
	await backendA.append(SESSION_ID, [
		ev("user/message", 7, { id: "u2", role: "user", source: { kind: "user" }, content: [{ type: "text", text: "still here?" }] }),
		ev("turn/start", 8, { turn: 2 })
	]);
	const after = await backendA.loadStored(SESSION_ID);
	const seqsAfter = after.events.map((e) => e.seq);
	assert.deepEqual(seqsAfter, Array.from({ length: 10 }, (_, i) => i), `seqs contiguous after follow-up, got ${JSON.stringify(seqsAfter)}`);
	const u2 = after.events.find((e) => e.type === "user/message" && e.data?.content?.[0]?.text === "still here?");
	assert.ok(u2, "profile A's follow-up user message was persisted (not dropped)");
	assert.ok(u2.seq > 7, "A's follow-up user message was re-sequenced after B's marker, not written over it");
	console.log("PASS: profile A continues writing after convergence; nothing dropped, no corruption.");
} finally {
	rmSync(root, { recursive: true, force: true });
	rmSync(CWD, { recursive: true, force: true });
}
