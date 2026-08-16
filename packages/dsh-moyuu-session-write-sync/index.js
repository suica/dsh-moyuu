import LockingJsonlSessionPersistence from "dsh-moyuu-session-write-lock";

/**
 * dsh-moyuu-session-write-sync — SESSION_ADVANCED consumer (write-sync).
 *
 * The locking backend (dsh-moyuu-session-write-lock) serializes concurrent
 * writers across processes and REJECTS a stale append with a distinct
 * `SESSION_ADVANCED` error instead of corrupting the shared log. Rejecting is
 * the right primitive, but a bare rejection also has two problems for the
 * loser process:
 *
 *   1. It is invisible: the coordinator's background write-behind reports any
 *      failure through `reportBackgroundFailure`, which just logs a warning and
 *      retains the stale events in the paused buffer. Nobody learns that this
 *      session was concurrently modified by another profile.
 *   2. Nothing distinguishes the two failure modes the lock can raise —
 *      `SESSION_ADVANCED` (another process advanced the log: a REAL conflict,
 *      the loser must reload before appending) vs `SESSION_LOCK_TIMEOUT`
 *      (transient contention: NOT a conflict, a retry is the correct response).
 *
 * This subclass stacks on the locking backend and turns every physical write
 * into the boundary where those two signals are recognized:
 *
 *   - `SESSION_ADVANCED`  -> emit a structured, one-shot-per-session
 *     `session/sync-conflict` event on `this.ctx` (the contract any UI / other
 *     plugin can consume to surface "this session was modified elsewhere;
 *     reload") and log a clear warning. The write still fails — the durable log
 *     already carries the winner's events and must not be touched.
 *   - `SESSION_LOCK_TIMEOUT` -> log a distinct "contention" warning but do NOT
 *     emit `session/sync-conflict` (it is not a staleness signal; treating it
 *     as one would trigger a pointless reload).
 *   - anything else passes through untouched.
 *
 * The durable log is left exactly as the locking backend produced it: intact
 * (the winner's events are the history) and never written with stale seqs.
 * "Pending events are never silently dropped" is honoured at the surface layer:
 * the event + warning are the notice; the stale buffer stays paused (the
 * coordinator's existing failure retention), and the user reloads the session
 * to continue editing it from the winner's state. True in-place cursor rebase
 * of a live session needs a coordinator-level primitive in dsh core and is a
 * documented follow-up (see README).
 *
 * Install as the LAST bundle, AFTER dsh-moyuu-session-write-lock: its
 * `dsh.bundle.patch` disables the locking-only row and inserts this backend in
 * its place.
 */
export default class SyncingLockingJsonlSessionPersistence extends LockingJsonlSessionPersistence {
	/**
	 * Conflict event contract. `detail` shape:
	 *   { id, code: "SESSION_ADVANCED", message, at }
	 * Emitted at most once per session id until the session is (re)created in
	 * this profile (the reload signal that resets the guard).
	 */
	static CONFLICT_EVENT = "session/sync-conflict";

	/** One-shot conflict notice per session id; reset on session (re)creation. */
	#conflictsNotified = new Set();
	/** One-shot lock-contention note per session id (diagnostics only). */
	#contentionNoted = new Set();

	constructor(ctx, config) {
		super(ctx, config);
		// Reloading/re-opening a session is the recovery path; allow a fresh
		// conflict notice for the re-seeded session instead of a stale one-shot.
		ctx.on("session/created", (session) => {
			this.#conflictsNotified.delete(session.header.id);
		});
	}

	/**
	 * Physical-write boundary where the coordinator's per-id chain calls the
	 * backend (appendCore -> appendBatch -> materialize/appendLines). Catch the
	 * lock's two distinct signals here; rethrow everything else untouched.
	 */
	async appendBatch(meta, events, isMaterialized) {
		try {
			return await super.appendBatch(meta, events, isMaterialized);
		} catch (error) {
			if (error?.code === "SESSION_ADVANCED") this.#notifyConflict(meta, error);
			else if (error?.code === "SESSION_LOCK_TIMEOUT") this.#noteContention(meta, error);
			throw error;
		}
	}

	/**
	 * Truncate-and-reappend repair is the other physical-write entry (the
	 * coordinator's adoptLivePrefix recovery path). Its re-appended closers can
	 * race another process too — surface that as a conflict as well.
	 */
	async commitRepair(meta, tornMarker, closers) {
		try {
			return await super.commitRepair(meta, tornMarker, closers);
		} catch (error) {
			if (error?.code === "SESSION_ADVANCED") this.#notifyConflict(meta, error);
			throw error;
		}
	}

	/** Surface a real cross-process conflict once per session id until reload. */
	#notifyConflict(meta, error) {
		const id = meta.id;
		if (this.#conflictsNotified.has(id)) return;
		this.#conflictsNotified.add(id);
		const detail = { id, code: error.code, message: error.message, at: Date.now() };
		this.ctx.emit(SyncingLockingJsonlSessionPersistence.CONFLICT_EVENT, detail);
		this.ctx.logger.warn(`session write sync: ${error.message}`);
	}

	/** Note transient lock contention distinctly, without the conflict signal. */
	#noteContention(meta, error) {
		const id = meta.id;
		if (this.#contentionNoted.has(id)) return;
		this.#contentionNoted.add(id);
		this.ctx.logger.warn(`session write sync: lock contention on "${id}": ${error.message} (retry or defer; not a sync conflict)`);
	}
}
