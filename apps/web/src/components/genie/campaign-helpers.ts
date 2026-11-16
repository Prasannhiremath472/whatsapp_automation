import {
  fillVariables,
  variableCount,
  type Audience,
  type CampaignDto,
  type ContactVariableField,
  type SaveCampaignRequest,
  type TemplateDto,
  type VariableSource,
} from "@whatsapp-crm/shared-types";

export const STATUS_LABEL: Record<CampaignDto["status"], string> = {
  draft: "Draft",
  scheduled: "Scheduled",
  running: "Running",
  paused: "Paused",
  completed: "Completed",
  failed: "Failed",
  cancelled: "Cancelled",
};

export const FIELD_LABEL: Record<ContactVariableField, string> = {
  name: "Full name",
  firstName: "First name",
  phone: "Phone number",
  email: "Email",
  location: "Location",
};

export const OBJECTIVES = [
  "Promotion",
  "Announcement",
  "Reminder",
  "Follow-up",
  "Feedback",
  "Other",
];

/** One template variable as edited in the form. */
export interface VarForm {
  source: "field" | "static";
  field: ContactVariableField;
  fallback: string;
  value: string;
}

export const defaultVar = (index: number): VarForm => ({
  // {{1}} is almost always the customer's name.
  source: "field",
  field: index === 0 ? "firstName" : "name",
  fallback: index === 0 ? "there" : "",
  value: "",
});

export interface WizardDraft {
  id?: string;
  name: string;
  objective: string;
  description: string;
  audienceMode: Audience["mode"];
  tags: string[];
  contactIds: string[];
  templateId: string;
  headerVars: VarForm[];
  bodyVars: VarForm[];
  headerMediaUrl: string;
  scheduleMode: "now" | "later";
  date: string;
  time: string;
}

export const blankDraft = (): WizardDraft => ({
  name: "",
  objective: "Promotion",
  description: "",
  audienceMode: "all",
  tags: [],
  contactIds: [],
  templateId: "",
  headerVars: [],
  bodyVars: [],
  headerMediaUrl: "",
  scheduleMode: "now",
  date: "",
  time: "10:00",
});

export function headerVariableCount(
  t: Pick<TemplateDto, "headerType" | "headerText"> | undefined,
): number {
  return t && t.headerType === "text" && t.headerText
    ? Math.min(1, variableCount(t.headerText))
    : 0;
}

/** Resizes the variable forms to match the template, keeping what the user already entered. */
export function resizeVars(existing: VarForm[], count: number): VarForm[] {
  return Array.from({ length: count }, (_, i) => existing[i] ?? defaultVar(i));
}

const toSource = (v: VarForm): VariableSource =>
  v.source === "static"
    ? { source: "static", value: v.value }
    : {
        source: "field",
        field: v.field,
        ...(v.fallback.trim() ? { fallback: v.fallback.trim() } : {}),
      };

const fromSource = (s: VariableSource): VarForm =>
  s.source === "static"
    ? { source: "static", field: "name", fallback: "", value: s.value }
    : { source: "field", field: s.field, fallback: s.fallback ?? "", value: "" };

export function toAudience(d: Pick<WizardDraft, "audienceMode" | "tags" | "contactIds">): Audience {
  return {
    mode: d.audienceMode,
    tags: d.audienceMode === "tags" ? d.tags : [],
    contactIds: d.audienceMode === "contacts" ? d.contactIds : [],
  };
}

export function toSaveRequest(d: WizardDraft): SaveCampaignRequest {
  return {
    name: d.name.trim(),
    objective: d.objective,
    ...(d.description.trim() ? { description: d.description.trim() } : {}),
    templateId: d.templateId,
    audience: toAudience(d),
    variableMapping: { header: d.headerVars.map(toSource), body: d.bodyVars.map(toSource) },
    ...(d.headerMediaUrl.trim() ? { headerMediaUrl: d.headerMediaUrl.trim() } : {}),
    schedule: d.scheduleMode === "later" && d.date ? { date: d.date, time: d.time } : null,
  };
}

/** Wall-clock date and time (YYYY-MM-DD, HH:mm) right now in an IANA timezone. */
export function nowInZone(timeZone: string): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    time: `${get("hour")}:${get("minute")}`,
  };
}

/** Formats an ISO instant in the business's timezone, e.g. "20 Nov, 9:00 am". */
export function formatInZone(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat(undefined, {
    timeZone,
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

export function draftFromCampaign(c: CampaignDto, timeZone: string): WizardDraft {
  let date = "";
  let time = "10:00";
  if (c.scheduledAt) {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).formatToParts(new Date(c.scheduledAt));
    const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
    date = `${get("year")}-${get("month")}-${get("day")}`;
    time = `${get("hour")}:${get("minute")}`;
  }
  return {
    id: c.id,
    name: c.name,
    objective: c.objective ?? "Promotion",
    description: c.description ?? "",
    audienceMode: c.audience.mode,
    tags: c.audience.tags,
    contactIds: c.audience.contactIds,
    templateId: c.templateId,
    headerVars: c.variableMapping.header.map(fromSource),
    bodyVars: c.variableMapping.body.map(fromSource),
    headerMediaUrl: c.headerMediaUrl ?? "",
    scheduleMode: c.scheduledAt ? "later" : "now",
    date,
    time,
  };
}

/** What one variable would show for a sample contact (used in the personalisation preview). */
export function sampleValue(
  v: VarForm,
  sample: { name: string; phone: string } | undefined,
): string {
  if (v.source === "static") return v.value || "…";
  const name = sample?.name?.trim() ?? "";
  switch (v.field) {
    case "name":
      return name || v.fallback || "[name]";
    case "firstName":
      return name.split(/\s+/)[0] || v.fallback || "[first name]";
    case "phone":
      return sample ? `+${sample.phone}` : "[phone]";
    default:
      return v.fallback || `[${FIELD_LABEL[v.field].toLowerCase()}]`;
  }
}

export function previewBody(
  template: Pick<TemplateDto, "body">,
  vars: VarForm[],
  sample: { name: string; phone: string } | undefined,
): string {
  return fillVariables(
    template.body,
    vars.map((v) => sampleValue(v, sample)),
  );
}

export const percent = (part: number, whole: number): string =>
  whole > 0 ? `${Math.round((part / whole) * 100)}%` : "—";
