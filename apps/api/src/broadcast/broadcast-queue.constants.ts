/** How many campaigns (of different businesses) this server sends at the same time. */
export const DISPATCHER_CONCURRENCY = 4;

/** How long a dispatcher owns a campaign before another worker may take over. */
export const DISPATCHER_LEASE_MS = 60_000;

/** A recipient is retried at most this many times on transient errors. */
export const MAX_SEND_ATTEMPTS = 3;

/** How often the scheduler looks for due / orphaned campaigns. */
export const SCHEDULER_INTERVAL_MS = 15_000;
