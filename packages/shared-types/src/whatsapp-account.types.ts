import { z } from "zod";

/** DTO for POST /whatsapp-accounts/connect — manual Cloud API credentials. */
export const ConnectWhatsappAccountRequestSchema = z.object({
  wabaId: z.string().trim().regex(/^\d{5,30}$/, "WABA id must be numeric"),
  phoneNumberId: z.string().trim().regex(/^\d{5,30}$/, "Phone number id must be numeric"),
  accessToken: z.string().trim().min(20).max(1000),
  displayPhoneNumber: z.string().trim().max(40).optional(),
});
export type ConnectWhatsappAccountRequest = z.infer<typeof ConnectWhatsappAccountRequestSchema>;

/** DTO for PATCH /whatsapp-accounts/me */
export const UpdateWhatsappAccountRequestSchema = z.object({
  dailyMessageLimit: z.number().int().min(1).max(10_000_000).nullable().optional(),
});
export type UpdateWhatsappAccountRequest = z.infer<typeof UpdateWhatsappAccountRequestSchema>;

/** Never includes the access token. */
export interface WhatsappAccountDto {
  id: string;
  wabaId: string | null;
  phoneNumberId: string;
  displayPhoneNumber: string | null;
  status: "connected" | "disconnected" | "pending";
  isMock: boolean;
  dailyMessageLimit: number | null;
  connectedAt: string | null;
}
