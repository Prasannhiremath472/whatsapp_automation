import { z } from "zod";

/**
 * Env schema for Milestone 1 + 2.
 *
 * DATABASE_URL / JWT_ACCESS_SECRET / JWT_REFRESH_SECRET / PORT are required
 * and actively used since M1.
 *
 * As of M2, REDIS_URL is actively used (BullMQ webhook-events queue) and
 * defaults to localhost:6379 if unset. WHATSAPP_MODE selects mock vs
 * cloud-api provider (defaults to "mock"). META_WEBHOOK_VERIFY_TOKEN is used
 * by the GET /webhook handshake. META_APP_ID/META_APP_SECRET/
 * META_GRAPH_API_VERSION are only required when WHATSAPP_MODE=live.
 *
 * LLM_MODE and BILLING_MODE remain declared-but-unused until later
 * milestones.
 */
export const envSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  JWT_ACCESS_SECRET: z.string().min(1, "JWT_ACCESS_SECRET is required"),
  JWT_REFRESH_SECRET: z.string().min(1, "JWT_REFRESH_SECRET is required"),
  PORT: z.coerce.number().int().positive().default(3000),

  // M2: WhatsApp webhook + router + mock provider.
  WHATSAPP_MODE: z.enum(["mock", "live"]).default("mock"),
  META_APP_ID: z.string().optional(),
  META_APP_SECRET: z.string().optional(),
  META_GRAPH_API_VERSION: z.string().default("v21.0"),
  META_WEBHOOK_VERIFY_TOKEN: z.string().default("dev-webhook-verify-token"),
  REDIS_URL: z.string().default("redis://localhost:6379"),

  // Future milestones — optional at boot time so unset values don't block boot.
  LLM_MODE: z.string().optional(),
  BILLING_MODE: z.string().optional(),
});

export type EnvConfig = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): EnvConfig {
  const parsed = envSchema.safeParse(config);
  if (!parsed.success) {
    // eslint-disable-next-line no-console
    console.error(
      "Invalid environment configuration:\n" +
        parsed.error.issues
          .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
          .join("\n"),
    );
    throw new Error("Invalid environment configuration. See errors above.");
  }
  return parsed.data;
}
