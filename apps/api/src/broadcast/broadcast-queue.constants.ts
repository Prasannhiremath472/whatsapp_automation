export const BROADCAST_SEND_QUEUE = 'broadcast-send';

/**
 * Delay between individual recipient sends within a campaign, in
 * milliseconds. Mirrors the PDF's "send in batches without getting banned"
 * requirement — BullMQ's per-job delay staggers sends instead of firing them
 * all in the same tick.
 */
export const BROADCAST_SEND_DELAY_MS = 500;
