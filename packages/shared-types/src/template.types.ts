import { z } from "zod";

export const TEMPLATE_CATEGORIES = [
  "Welcome",
  "Marketing",
  "Order Updates",
  "Payments",
  "Appointments",
  "Customer Support",
  "Feedback",
  "Re-engagement",
] as const;
export type TemplateCategory = (typeof TEMPLATE_CATEGORIES)[number];

/** Maps the product's friendly categories onto Meta's template categories. */
export function metaCategoryFor(category: string): "MARKETING" | "UTILITY" {
  return ["Welcome", "Marketing", "Re-engagement"].includes(category) ? "MARKETING" : "UTILITY";
}

export const TemplateStatusSchema = z.enum(["draft", "pending", "approved", "rejected"]);
export type TemplateStatus = z.infer<typeof TemplateStatusSchema>;

export const TemplateHeaderTypeSchema = z.enum(["none", "text", "image", "video", "document"]);
export type TemplateHeaderType = z.infer<typeof TemplateHeaderTypeSchema>;

export const TemplateButtonSchema = z.object({
  type: z.enum(["quick_reply", "cta_url", "cta_phone"]),
  label: z.string().trim().min(1).max(25),
  value: z.string().trim().max(2000).optional(),
});
export type TemplateButton = z.infer<typeof TemplateButtonSchema>;

/** Returns the sorted, de-duplicated {{n}} placeholder numbers used in `text`. */
export function extractVariableNumbers(text: string): number[] {
  const found = new Set<number>();
  for (const m of text.matchAll(/\{\{\s*(\d+)\s*\}\}/g)) found.add(Number(m[1]));
  return [...found].sort((a, b) => a - b);
}

/** Highest placeholder index in `text` (0 when there are none). */
export function variableCount(text: string): number {
  const nums = extractVariableNumbers(text);
  return nums.length ? nums[nums.length - 1]! : 0;
}

/** Replaces {{n}} placeholders with the given positional values (1-based). */
export function fillVariables(text: string, values: string[]): string {
  return text.replace(/\{\{\s*(\d+)\s*\}\}/g, (match, n: string) => values[Number(n) - 1] ?? match);
}

function sequential(nums: number[]): boolean {
  return nums.every((n, i) => n === i + 1);
}

const templateName = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .regex(/^[a-z0-9_]+$/, "Use lowercase letters, numbers and underscores only");

/** DTO for POST /message-templates and PATCH /message-templates/:id */
export const SaveTemplateRequestSchema = z
  .object({
    name: templateName,
    category: z.enum(TEMPLATE_CATEGORIES),
    language: z.string().regex(/^[a-z]{2,3}(_[A-Z]{2})?$/, "Use a language code such as en, hi or en_US"),
    headerType: TemplateHeaderTypeSchema.default("none"),
    headerText: z.string().trim().max(60).optional(),
    /** Sample/default image for an image header: a public https link (an uploaded file or external). */
    headerMediaUrl: z
      .string()
      .trim()
      .max(1000)
      .regex(/^https:\/\/\S+$/, "Use a public https:// link")
      .optional(),
    body: z.string().trim().min(1).max(1024),
    footer: z.string().trim().max(60).optional(),
    buttons: z.array(TemplateButtonSchema).max(10).default([]),
  })
  .superRefine((v, ctx) => {
    const bodyVars = extractVariableNumbers(v.body);
    if (!sequential(bodyVars)) {
      ctx.addIssue({ code: "custom", path: ["body"], message: "Variables must be numbered {{1}}, {{2}}, … without gaps" });
    }
    if (v.headerType === "text") {
      if (!v.headerText) {
        ctx.addIssue({ code: "custom", path: ["headerText"], message: "Header text is required for a text header" });
      } else if (extractVariableNumbers(v.headerText).length > 1) {
        ctx.addIssue({ code: "custom", path: ["headerText"], message: "A header can contain at most one variable" });
      }
    }
    v.buttons.forEach((b, i) => {
      if ((b.type === "cta_url" || b.type === "cta_phone") && !b.value) {
        ctx.addIssue({ code: "custom", path: ["buttons", i, "value"], message: "This button needs a URL or phone number" });
      }
    });
    if (v.buttons.filter((b) => b.type === "quick_reply").length > 3) {
      ctx.addIssue({ code: "custom", path: ["buttons"], message: "At most 3 quick-reply buttons are allowed" });
    }
  });
export type SaveTemplateRequest = z.infer<typeof SaveTemplateRequestSchema>;

export const ListTemplatesQuerySchema = z.object({
  status: TemplateStatusSchema.optional(),
  q: z.string().trim().max(100).optional(),
});
export type ListTemplatesQuery = z.infer<typeof ListTemplatesQuerySchema>;

export interface TemplateDto {
  id: string;
  name: string;
  category: string;
  language: string;
  headerType: TemplateHeaderType;
  headerText: string | null;
  headerMediaUrl: string | null;
  body: string;
  footer: string | null;
  buttons: TemplateButton[];
  status: TemplateStatus;
  rejectionReason: string | null;
  /** Number of {{n}} variables in the body. */
  bodyVariableCount: number;
  /** Number of variables in a text header (0 or 1). */
  headerVariableCount: number;
  createdAt: string;
  updatedAt: string;
}

/** Images accepted for WhatsApp headers (Meta supports JPEG and PNG, up to 5 MB). */
export const MEDIA_IMAGE_TYPES = ["image/jpeg", "image/png"] as const;
export const MEDIA_MAX_BYTES = 5 * 1024 * 1024;

/** Response of POST /media. */
export interface MediaAssetDto {
  id: string;
  /** Public https link Meta (and the browser) can open. */
  url: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
}
