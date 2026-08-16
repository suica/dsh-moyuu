import JsonlSessionPersistence from "@deepseek-ai/dsh-session-persistence-jsonl";
import { decodeStorageRecord } from "@deepseek-ai/dsh-session";
import { mkdir, open, readFile, rm } from "node:fs/promises";
import { dirname } from "node:path";
import { zstdDecompressSync } from "node:zlib";

/**
 * Cross-process session write-lock persistence backend.
 *
 * The stock JSONL backend serializes writers only *inside one process* (the
 * coordinator's per-session promise chain). When two dsh profiles run at the
 * same time they share the same `~/.dsh/sessions` root, so two independent
 * writers can append to the SAME `session.jsonl.zstd` with separate in-process
 * sequence counters -> interleaved frames, duplicate seqs, and torn tails that
 * a "crash repair" in one process truncates out from under the other.
 *
 * This subclass wraps every physical write (materialize / append / repair) in a
 * per-log cross-process file lock and, before appending, **reconciles** the
 * durable committed tail with this writer's batch:
 *
 *  - a batch that continues the durable tail appends normally;
 *  - a batch whose events are ALREADY committed (same seqs, same content) is a
 *    concurrent duplicate — most commonly the deterministic closers two
 *    profiles both generate for the same interrupted turn (`step/end`,
 *    `turn/end`, `session/end-seed`) — and is **skipped idempotently**, so a
 *    second profile opening the same session converges instead of erroring;
 *  - a batch whose prefix is committed and whose suffix is not appends only the
 *    suffix (idempotent convergence);
 *  - only a genuinely divergent write — different content at seqs another
 *    process already committed — is rejected with `SESSION_ADVANCED`.
 *
 * Crash repair is likewise reconciled under the lock: the torn tail is truncated
 * only while it is still torn at the exact boundary this caller observed, so one
 * process can never truncate frames another process just committed.
 *
 * Install by adding this package to a profile's `dsh.profile.bundles` — its
 * `dsh.bundle.patch` (`./cordis.patch.yml`) disables the stock
 * `session-persistence-jsonl` row and inserts this backend in its place.
 */
export default class LockingJsonlSessionPersistence extends JsonlSessionPersistence {
	/** Keep the diagnostic label the coordinator and tooling expect. */
	name = "session-persistence-jsonl";

	/** Wrap creation (header + first batch) in the cross-process write lock. */
	async materialize(meta, events) {
		const path = this.locate(meta).path;
		await withSessionLogLock(path, () => super.materialize(meta, events));
	}

	/**
	 * Append under the cross-process write lock, reconciling this batch against
	 * the durable committed tail: skip events another process already committed
	 * (identical content), append only the missing suffix, and reject only a
	 * genuine divergence.
	 */
	async appendLines(meta, events) {
		const path = this.locate(meta).path;
		await withSessionLogLock(path, async () => {
			const toWrite = await reconcileBatch(this, meta, events, path);
			if (toWrite.length > 0) await super.appendLines(meta, toWrite);
		});
	}

	/** Wrap crash-repair truncation in the cross-process write lock. */
	async repair(meta, offset) {
		const path = this.locate(meta).path;
		await withSessionLogLock(path, () => super.repair(meta, offset));
	}

	/**
	 * Truncate-and-reappend repair as ONE locked step, reconciled against the
	 * CURRENT durable state: a concurrent writer can neither slip between the
	 * truncate and the synthetic closers, nor be truncated out from under.
	 */
	async commitRepair(meta, tornMarker, closers) {
		const path = this.locate(meta).path;
		await withSessionLogLock(path, async () => {
			// Re-check the torn boundary under the lock — another process may
			// have repaired or advanced the log since this caller's read. Only
			// the frame scan matters here, so ask for no events (a single-frame
			// decode at most).
			const current = await readDurableSuffix(this, meta, path, Number.POSITIVE_INFINITY);
			// Truncate only while the log is STILL torn at the exact boundary
			// this caller observed. If another process already completed the
			// tail, truncating would cut its committed frames out from under it.
			if (tornMarker !== void 0 && current.tornStart === tornMarker.truncateTo) {
				await super.repair(meta, current.tornStart);
			}
			const repairedEvents = [...tornMarker?.recoveredEvents ?? [], ...closers];
			if (repairedEvents.length > 0) {
				const toWrite = await reconcileBatch(this, meta, repairedEvents, path);
				if (toWrite.length > 0) await super.appendLines(meta, toWrite);
			}
		});
	}
}

/** Distinct failure for an append that genuinely diverged from another process's write. */
function sessionAdvancedError(id, tail, expected) {
	const error = new Error(`session "${id}" was modified by another process: durable tail is ${tail}, this writer expects ${expected}; reload the session before appending`);
	error.code = "SESSION_ADVANCED";
	return error;
}

/**
 * Reconcile one append batch against the durable committed log.
 *
 * @returns the events that still need to be written (possibly `[]` when every
 * event is already committed by another process).
 * @throws {@link sessionAdvancedError} only when the durable log holds DIFFERENT
 * content at a seq this batch wants to write (a genuine cross-process conflict).
 */
async function reconcileBatch(backend, meta, events, path) {
	if (events.length === 0) return [];
	const expected = events[0].seq;
	const { events: committed, tail } = await readDurableSuffix(backend, meta, path, expected);
	// Clean contiguous append: the durable tail is exactly one before our batch.
	if (expected === tail + 1) return events;
	// The durable log already holds events at our batch's seqs. Every committed
	// event in our seq range must be IDENTICAL to our own; those are the other
	// process's concurrent write of the same deterministic events and are
	// skipped. Different content at a taken seq is a genuine conflict.
	const bySeq = /* @__PURE__ */ new Map();
	for (const event of committed) bySeq.set(event.seq, event);
	const batchLast = events.at(-1).seq;
	let overlap = 0;
	for (let seq = expected; seq <= batchLast; seq++) {
		const theirs = bySeq.get(seq);
		if (theirs === void 0) break;
		if (!sameEvent(theirs, events[overlap])) throw sessionAdvancedError(meta.id, tail, expected);
		overlap += 1;
	}
	// Bring this process's in-memory cursor forward to the durable tail when the
	// other process's write already covered our whole batch, so the next append
	// continues from the real tail instead of failing forever ("reload won't
	// help" without this).
	if (tail > batchLast) {
		const state = backend.coordinator?.states?.get(meta.id);
		if (state !== void 0 && Number.isInteger(state.cursor)) {
			// appendCore adds events.length to state.cursor after appendBatch
			// returns; pre-position it so the final cursor lands on tail + 1.
			state.cursor += tail - batchLast;
		}
	}
	return events.slice(overlap);
}

/**
 * Structural equality of two events at the same seq. `time` is recording
 * metadata — a marker like `session/end-seed` regenerated by another process
 * carries a different `Date.now()`, and deterministic closers reuse the last
 * stored event's time — so it is excluded from the comparison. Everything that
 * carries content (type, data, surface metadata) must match exactly; different
 * content at a taken seq is never conflated.
 */
function sameEvent(a, b) {
	if (a?.seq !== b?.seq || a?.type !== b?.type) return false;
	const strip = (event) => {
		const { time, ...rest } = event ?? {};
		return rest;
	};
	try {
		return JSON.stringify(strip(a)) === JSON.stringify(strip(b));
	} catch {
		return false;
	}
}

/**
 * Read the durable committed events near the tail of a session log, without
 * loading or decoding the whole file. `fromSeq` is the lowest event seq the
 * caller cares about: only complete frames that can contain `seq >= fromSeq`
 * are decoded (zstd), which keeps repeated appends O(tail) rather than O(log).
 *
 * @returns the committed events (a contiguous suffix, log order), the last
 * committed event seq (`tail`, or -1 for an absent/empty log), and the byte
 * offset of an incomplete final zstd frame (`tornStart`) when present.
 */
async function readDurableSuffix(backend, meta, path, fromSeq) {
	let buffer;
	try {
		buffer = await readFile(path);
	} catch (error) {
		if (error?.code === "ENOENT") return { events: [], tornStart: void 0, tail: -1 };
		throw error;
	}
	if (backend.compression === "zstd") {
		const { frames, tornStart } = scanZstdFrames(buffer);
		const events = [];
		// Decode frames from the END backwards until the accumulated suffix
		// covers seq >= fromSeq, then reverse into log order.
		for (let i = frames.length - 1; i >= 0; i--) {
			const plaintext = zstdDecompressSync(buffer.subarray(frames[i].start, frames[i].end));
			const decoded = decodeEventLines(plaintext);
			events.unshift(...decoded);
			if (events.length > 0 && events[0].seq <= fromSeq) break;
		}
		const tail = events.length > 0 ? events.at(-1).seq : -1;
		return { events, tornStart, tail };
	}
	const events = decodeEventLines(buffer);
	const tail = events.length > 0 ? events.at(-1).seq : -1;
	return { events, tornStart: void 0, tail };
}

/** Expand every complete JSONL line into its storage events (chunk rows unpacked). */
function decodeEventLines(buffer) {
	const events = [];
	for (const line of buffer.toString("utf8").split("\n")) {
		if (line.trim().length === 0) continue;
		let record;
		try {
			record = JSON.parse(line);
		} catch {
			continue;
		}
		try {
			for (const event of decodeStorageRecord(record)) {
				if (Number.isInteger(event?.seq)) events.push(event);
			}
		} catch {
			/* a torn/partial row loses its seq — never fabricates one */
		}
	}
	return events;
}

/** Maximum wait for a session write lock before failing the contender. */
const SESSION_LOCK_TIMEOUT_MS = 1e4;
/** Backoff bounds while contending for a held session write lock. */
const SESSION_LOCK_RETRY_INITIAL_MS = 20;
const SESSION_LOCK_RETRY_MAX_MS = 250;

/**
 * Serialize cross-process writers of one session log around `operation` via a
 * `<log>.lock` sibling. `wx` exclusive-create is the mutex; the holder writes
 * its PID so a crashed holder's stale lock can be reclaimed by checking whether
 * that PID is still alive. Contention backs off exponentially and fails with a
 * distinct timeout error.
 */
async function withSessionLogLock(path, operation) {
	const lockPath = `${path}.lock`;
	await mkdir(dirname(lockPath), { recursive: true, mode: 448 });
	const deadline = Date.now() + SESSION_LOCK_TIMEOUT_MS;
	let delay = SESSION_LOCK_RETRY_INITIAL_MS;
	for (;;) {
		try {
			const handle = await open(lockPath, "wx", 384);
			try {
				await handle.writeFile(`${process.pid}\n`, "utf8");
			} finally {
				await handle.close();
			}
			break;
		} catch (error) {
			if (error?.code !== "EEXIST") throw error;
			if (await reclaimStaleSessionLock(lockPath)) continue;
			if (Date.now() >= deadline) {
				const lockError = new Error(`timed out waiting for the session write lock at ${lockPath}`);
				lockError.code = "SESSION_LOCK_TIMEOUT";
				throw lockError;
			}
			await new Promise((resolve) => setTimeout(resolve, delay));
			delay = Math.min(delay * 2, SESSION_LOCK_RETRY_MAX_MS);
		}
	}
	try {
		return await operation();
	} finally {
		await rm(lockPath, { force: true });
	}
}

/**
 * Reclaim a stale session write lock whose recorded owner PID is gone. A lock
 * whose owner is alive (or unreadable/unknown) is left alone — guessing would
 * risk two live writers. PID reuse can only delay the contender (its timeout
 * fails), never corrupt.
 */
async function reclaimStaleSessionLock(lockPath) {
	let pid;
	try {
		pid = Number.parseInt((await readFile(lockPath, "utf8")).trim(), 10);
	} catch (error) {
		if (error?.code === "ENOENT") return true;
		return false;
	}
	if (!Number.isInteger(pid) || pid <= 0) return false;
	try {
		process.kill(pid, 0);
		return false;
	} catch (error) {
		if (error?.code === "ESRCH") {
			await rm(lockPath, { force: true });
			return true;
		}
		return false;
	}
}

/** Zstandard frame magic. */
const ZSTD_MAGIC = 4247762216;

/**
 * Locate complete zstd frames in a buffer without decompressing their blocks.
 * An incomplete final frame is reported as `tornStart` instead of a frame.
 */
function scanZstdFrames(buffer) {
	const frames = [];
	let offset = 0;
	while (offset < buffer.length) {
		const start = offset;
		if (buffer.length - offset < 4) return { frames, tornStart: start };
		if (buffer.readUInt32LE(offset) !== ZSTD_MAGIC) {
			throw new Error(`corrupt Zstandard session log: invalid frame magic at byte ${offset}`);
		}
		offset += 4;
		if (offset === buffer.length) return { frames, tornStart: start };
		const descriptor = buffer.readUInt8(offset);
		offset += 1;
		if ((descriptor & 24) !== 0) {
			throw new Error(`corrupt Zstandard session log: reserved frame-header bit at byte ${offset - 1}`);
		}
		const contentSizeFlag = descriptor >>> 6;
		const singleSegment = (descriptor & 32) !== 0;
		const checksum = (descriptor & 4) !== 0;
		const dictionaryFlag = descriptor & 3;
		const dictionaryBytes = dictionaryFlag === 3 ? 4 : dictionaryFlag;
		const contentSizeBytes = contentSizeFlag === 0 ? (singleSegment ? 1 : 0) : 1 << contentSizeFlag;
		const remainingHeaderBytes = (singleSegment ? 0 : 1) + dictionaryBytes + contentSizeBytes;
		if (buffer.length - offset < remainingHeaderBytes) return { frames, tornStart: start };
		offset += remainingHeaderBytes;
		for (;;) {
			if (buffer.length - offset < 3) return { frames, tornStart: start };
			const blockHeader = buffer.readUIntLE(offset, 3);
			offset += 3;
			const lastBlock = (blockHeader & 1) !== 0;
			const blockType = (blockHeader >>> 1) & 3;
			const blockSize = blockHeader >>> 3;
			if (blockType === 3) {
				throw new Error(`corrupt Zstandard session log: reserved block type at byte ${offset - 3}`);
			}
			const payloadBytes = blockType === 1 ? 1 : blockSize;
			if (buffer.length - offset < payloadBytes) return { frames, tornStart: start };
			offset += payloadBytes;
			if (lastBlock) break;
		}
		if (checksum) {
			if (buffer.length - offset < 4) return { frames, tornStart: start };
			offset += 4;
		}
		frames.push({ start, end: offset });
	}
	return { frames };
}
