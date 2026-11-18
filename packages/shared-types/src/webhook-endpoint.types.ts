import { z } from "zod";

/** Events a business can subscribe an outgoing webhook to. */
export const WEBHOOK_EVENTS = [
  { id: "message.received", label: "A customer sent a message" },
  { id: "message.status", label: "A message you sent changed status (sent, delivered, read, failed)" },
  { id: "conversation.created", label: "A new conversation started" },
] as const;
export const WebhookEventSchema = z.enum(["message.received", "message.status", "conversation.created"]);
export type WebhookEventName = z.infer<typeof WebhookEventSchema>;

/** DTO for POST /webhook-endpoints and PUT /webhook-endpoints/:id */
export const SaveWebhookEndpointRequestSchema = z.object({
  name: z.string().trim().min(1).max(100),
  url: z
    .string()
    .trim()
    .max(1000)
    .regex(/^https:\/\/\S+$/, "The URL must start with https://"),
  events: z.array(WebhookEventSchema).min(1, "Choose at least one event").max(10),
  active: z.boolean().default(true),
});
export type SaveWebhookEndpointRequest = z.infer<typeof SaveWebhookEndpointRequestSchema>;

export interface WebhookEndpointDto {
  id: string;
  name: string;
  url: string;
  events: WebhookEventName[];
  active: boolean;
  lastDeliveryAt: string | null;
  lastStatus: string | null;
  createdAt: string;
}

/** Returned once, when an endpoint is created or its secret is rotated. */
export interface WebhookEndpointWithSecretDto extends WebhookEndpointDto {
  secret: string;
}

export interface WebhookDeliveryDto {
  id: string;
  event: string;
  status: "pending" | "success" | "failed";
  attempts: number;
  responseStatus: number | null;
  error: string | null;
  createdAt: string;
  lastAttemptAt: string | null;
}
