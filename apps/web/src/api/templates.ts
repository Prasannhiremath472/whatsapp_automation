import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { SaveTemplateRequest, TemplateDto } from "@whatsapp-crm/shared-types";
import { api } from "@/lib/api";
import type { WaTemplate } from "@/components/whatsapp/templates-data";

const key = ["message-templates"] as const;

/** Language codes the API stores, and the labels the UI shows for them. */
const LANGUAGE_LABELS: Record<string, string> = { en: "English", hi: "Hindi", mr: "Marathi" };
export const languageLabel = (code: string): string => LANGUAGE_LABELS[code] ?? code;
export const languageCode = (label: string): string =>
  Object.entries(LANGUAGE_LABELS).find(([, l]) => l === label)?.[0] ?? label;

/** The API's template as the (shared) WhatsApp UI components expect it. */
export function toWaTemplate(t: TemplateDto): WaTemplate {
  return {
    id: t.id,
    name: t.name,
    category: t.category,
    language: languageLabel(t.language),
    headerType: t.headerType,
    ...(t.headerText ? { headerText: t.headerText } : {}),
    ...(t.headerMediaUrl ? { headerMediaUrl: t.headerMediaUrl } : {}),
    body: t.body,
    ...(t.footer ? { footer: t.footer } : {}),
    buttons: t.buttons.map((b) => ({
      type: b.type,
      label: b.label,
      ...(b.value ? { value: b.value } : {}),
    })),
    status: t.status,
    updatedAt: t.updatedAt,
  };
}

/** Form draft -> API request body. */
export function toSaveRequest(
  draft: Omit<WaTemplate, "id" | "status" | "updatedAt">,
): SaveTemplateRequest {
  return {
    name: draft.name.trim(),
    category: draft.category as SaveTemplateRequest["category"],
    language: languageCode(draft.language),
    headerType: draft.headerType,
    ...(draft.headerType === "text" && draft.headerText ? { headerText: draft.headerText } : {}),
    ...(draft.headerType === "image" && draft.headerMediaUrl?.trim()
      ? { headerMediaUrl: draft.headerMediaUrl.trim() }
      : {}),
    body: draft.body,
    ...(draft.footer ? { footer: draft.footer } : {}),
    buttons: draft.buttons.map((b) => ({
      type: b.type,
      label: b.label,
      ...(b.value ? { value: b.value } : {}),
    })),
  };
}

export function useTemplates() {
  return useQuery({ queryKey: key, queryFn: () => api<TemplateDto[]>("/message-templates") });
}

/** Only approved templates can be used in a campaign. */
export function useApprovedTemplates() {
  return useQuery({
    queryKey: [...key, "approved"],
    queryFn: () => api<TemplateDto[]>("/message-templates", { query: { status: "approved" } }),
  });
}

export function useSaveTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id?: string | undefined; body: SaveTemplateRequest }) =>
      id
        ? api<TemplateDto>(`/message-templates/${id}`, { method: "PUT", body })
        : api<TemplateDto>("/message-templates", { method: "POST", body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  });
}

export function useSubmitTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api<TemplateDto>(`/message-templates/${id}/submit`, { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  });
}

export function useDeleteTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<void>(`/message-templates/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  });
}

export function useSyncTemplates() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      api<{ created: number; updated: number; flagged: number }>("/message-templates/sync", { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  });
}
