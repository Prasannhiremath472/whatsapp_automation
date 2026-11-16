/** How often the worker looks for due events (new events also wake it immediately). */
export const WEBHOOK_POLL_INTERVAL_MS = 1_000;

/** An event that has been "processing" for longer than this belongs to a crashed worker. */
export const WEBHOOK_LOCK_MS = 5 * 60_000;

/** A crashed-mid-processing event is re-run once, then marked failed (never an endless loop). */
export const WEBHOOK_MAX_ATTEMPTS = 2;

/** Failed events are kept this long so they can be inspected, then deleted. */
export const WEBHOOK_FAILED_RETENTION_MS = 7 * 24 * 60 * 60_000;
