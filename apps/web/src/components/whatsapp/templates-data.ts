export type TemplateStatus = "draft" | "pending" | "approved" | "rejected";

export type TemplateButton = {
  type: "quick_reply" | "cta_url" | "cta_phone";
  label: string;
  value?: string;
};

export type WaTemplate = {
  id: string;
  name: string;
  category: string;
  language: string;
  headerType: "none" | "text" | "image" | "video" | "document";
  headerText?: string;
  /** Public https link of the header image (uploaded or external). */
  headerMediaUrl?: string;
  body: string;
  footer?: string;
  buttons: TemplateButton[];
  status: TemplateStatus;
  updatedAt: string;
};

export const templateCategories = [
  "Welcome",
  "Marketing",
  "Order Updates",
  "Payments",
  "Appointments",
  "Customer Support",
  "Feedback",
  "Re-engagement",
] as const;

export const templateLanguages = ["English", "Hindi", "Marathi"] as const;

export const statusMeta: Record<
  TemplateStatus,
  { label: string; className: string }
> = {
  approved: { label: "Approved", className: "bg-primary-soft text-primary" },
  pending: { label: "Pending review", className: "bg-warning/15 text-warning" },
  rejected: { label: "Rejected", className: "bg-destructive/10 text-destructive" },
  draft: { label: "Local draft", className: "bg-muted text-muted-foreground" },
};

export const MAX_TEMPLATE_BUTTONS = 3;
/** Neutral example values shown in the template preview where a {{variable}} will go. */
export function fillPreviewVariables(text: string) {
  const samples = ["Priya", "Acme Store", "10:00 AM", "Saturday", "#1042", "Order details", "Support team", "12 Nov"];
  let i = 0;
  return text.replace(/\{\{(?:\d+|customer_name|order_id)\}\}/g, () => samples[i++ % samples.length] ?? "");
}
