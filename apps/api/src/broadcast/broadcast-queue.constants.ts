export const BROADCAST_SEND_QUEUE = 'broadcast-send';

export const DISPATCH_CAMPAIGN_JOB = 'dispatch-campaign';

/** One dispatcher job per campaign; the id de-duplicates concurrent enqueues. */
export const dispatchJobId = (campaignId: string): string => `dispatch-${campaignId}`;

export interface DispatchCampaignJob {
  campaignId: string;
  tenantId: string;
}

/** How long a dispatcher owns a campaign before another worker may take over. */
export const DISPATCHER_LEASE_MS = 60_000;

/** A recipient is retried at most this many times on transient errors. */
export const MAX_SEND_ATTEMPTS = 3;

/** How often the scheduler looks for due / orphaned campaigns. */
export const SCHEDULER_INTERVAL_MS = 15_000;
