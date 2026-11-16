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
const baseEnvSchema = z.object({
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

  // Bulk messaging.
  // 32 random bytes as 64 hex chars (openssl rand -hex 32). Required before a
  // WhatsApp access token can be stored; never commit it.
  ENCRYPTION_KEY: z
    .string()
    .regex(/^[0-9a-fA-F]{64}$/, "ENCRYPTION_KEY must be 64 hex characters")
    .optional(),
  // Comma-separated browser origins allowed to call the API.
  CORS_ORIGINS: z.string().default("http://localhost:5173,http://localhost:5174"),
  // Max campaign messages sent per second per campaign (Meta allows up to 80).
  BROADCAST_RATE_PER_SECOND: z.coerce.number().int().min(1).max(80).default(20),
  // In mock mode, simulate delivered/read receipts for sent messages.
  MOCK_AUTO_ACK: z.enum(["true", "false"]).default("true"),

  // Future milestones — optional at boot time so unset values don't block boot.
  LLM_MODE: z.string().optional(),
  BILLING_MODE: z.string().optional(),
});

export const envSchema = baseEnvSchema.superRefine((env, ctx) => {
  if (env.WHATSAPP_MODE === "live") {
    for (const key of ["META_APP_ID", "META_APP_SECRET"] as const) {
      if (!env[key]) ctx.addIssue({ code: "custom", path: [key], message: `${key} is required when WHATSAPP_MODE=live` });
    }
  }
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
