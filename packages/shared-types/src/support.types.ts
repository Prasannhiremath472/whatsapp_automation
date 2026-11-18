import { z } from "zod";

export const TICKET_CATEGORIES = ["Billing", "WhatsApp connection", "Templates", "Campaigns", "AI & automation", "Other"] as const;
export const TicketStatusSchema = z.enum(["open", "in_progress", "resolved", "closed"]);
export type TicketStatus = z.infer<typeof TicketStatusSchema>;

/** DTO for POST /support/tickets */
export const CreateTicketRequestSchema = z.object({
  subject: z.string().trim().min(3).max(200),
  category: z.enum(TICKET_CATEGORIES),
  priority: z.enum(["low", "normal", "high"]).default("normal"),
  message: z.string().trim().min(10, "Describe the problem in a few words").max(5000),
});
export type CreateTicketRequest = z.infer<typeof CreateTicketRequestSchema>;

/** DTO for POST /support/tickets/:id/messages */
export const ReplyTicketRequestSchema = z.object({ message: z.string().trim().min(1).max(5000) });

export interface TicketDto {
  id: string;
  subject: string;
  category: string;
  priority: string;
  status: TicketStatus;
  createdByName: string;
  createdAt: string;
  lastMessageAt: string;
}

export interface TicketMessageDto {
  id: string;
  authorType: "customer" | "support";
  authorName: string;
  body: string;
  createdAt: string;
}

export interface TicketDetailDto extends TicketDto {
  messages: TicketMessageDto[];
}
