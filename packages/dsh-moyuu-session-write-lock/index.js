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
 * a "crash repair" in one process truncates out from under the other. The
 * result is permanently corrupted sessions.
 *
 * This subclass wraps every physical write (materialize / append / repair) in a
 * per-log cross-process file lock and, before appending, reconciles the durable
 * committed tail with this writer's cursor: if another process already advanced
 * the log, the append is rejected with `SESSION_ADVANCED` instead of writing
 * duplicate sequence numbers.
 *
 * Install by adding this package to a profile's `dsh.profile.bundles` — its
 * `dsh.bundle.patch` (`./bundle.yml`) disables the stock
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
	 * Append under the cross-process write lock, reconciling the durable
	 * committed tail with this batch's first seq before writing.
	 */
	async appendLines(meta, events) {
		const path = this.locate(meta).path;
		await withSessionLogLock(path, async () => {
			await assertSequentialTail(this, meta, events, path);
			await super.appendLines(meta, events);
		});
	}

	/** Wrap crash-repair truncation in the cross-process write lock. */
	async repair(meta, offset) {
		const path = this.locate(meta).path;
		await withSessionLogLock(path, () => super.repair(meta, offset));
	}

	/**
	 * Truncate-and-reappend repair as ONE locked step so a concurrent writer can
	 * neither slip between the truncate and the synthetic closers, nor be
	 * truncated out from under.
	 */
	async commitRepair(meta, tornMarker, closers) {
		const path = this.locate(meta).path;
		await withSessionLogLock(path, async () => {
			if (tornMarker !== void 0) await super.repair(meta, tornMarker.truncateTo);
			const repairedEvents = [...tornMarker?.recoveredEvents ?? [], ...closers];
			if (repairedEvents.length > 0) {
				await assertSequentialTail(this, meta, repairedEvents, path);
				await super.appendLines(meta, repairedEvents);
			}
		});
	}
}

/** Distinct failure for an append that raced another process's append. */
function sessionAdvancedError(id, tail, expected) {
	const error = new Error(`session "${id}" was modified by another process: durable tail is ${tail}, this writer expects ${expected}; reload the session before appending`);
	error.code = "SESSION_ADVANCED";
	return error;
}

/** Reject a batch whose first seq does not continue the durable committed tail. */
async function assertSequentialTail(backend, meta, events, path) {
	const expected = events[0]?.seq;
	const tail = await committedTail(backend, meta, path);
	if (expected !== tail + 1) throw sessionAdvancedError(meta.id, tail, expected);
}

/**
 * The last committed event seq in a session log, or -1 when no event has been
 * committed. Reads only the final complete frame (zstd) / committed prefix
 * (plaintext). Callers hold the session write lock, so the value is stable.
 */
async function committedTail(backend, meta, path) {
	let buffer;
	try {
		buffer = await readFile(path);
	} catch (error) {
		if (error?.code === "ENOENT") return -1;
		throw error;
	}
	if (backend.compression === "zstd") {
		const { frames } = scanZstdFrames(buffer);
		if (frames.length === 0) return -1;
		const last = frames[frames.length - 1];
		return maxEventSeq(zstdDecompressSync(buffer.subarray(last.start, last.end)));
	}
	const prefix = await backend.readPrefix(path, meta.id);
	return prefix.events.at(-1)?.seq ?? -1;
}

/** The highest event seq carried by plaintext JSONL rows, or -1. */
function maxEventSeq(plaintext) {
	let max = -1;
	for (const line of plaintext.toString("utf8").split("\n")) {
		if (line.trim().length === 0) continue;
		try {
			for (const event of decodeStorageRecord(JSON.parse(line))) {
				if (Number.isInteger(event.seq) && event.seq > max) max = event.seq;
			}
		} catch {
			/* a torn/partial record only loses its seq — never fabricates one */
		}
	}
	return max;
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
