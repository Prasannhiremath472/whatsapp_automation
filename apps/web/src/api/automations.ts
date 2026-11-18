import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  AutomationDto,
  AutomationRunDto,
  SaveAutomationRequest,
} from "@whatsapp-crm/shared-types";
import { api } from "@/lib/api";

const key = ["automations"] as const;

export function useAutomations() {
  return useQuery({ queryKey: key, queryFn: () => api<AutomationDto[]>("/automations") });
}

export function useAutomationRuns(id: string | null) {
  return useQuery({
    queryKey: [...key, id, "runs"],
    enabled: !!id,
    queryFn: () => api<AutomationRunDto[]>(`/automations/${id}/runs`),
  });
}

function useRefresh() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: key });
}

export function useSaveAutomation() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: ({ id, body }: { id?: string | undefined; body: SaveAutomationRequest }) =>
      id
        ? api<AutomationDto>(`/automations/${id}`, { method: "PUT", body })
        : api<AutomationDto>("/automations", { method: "POST", body }),
    onSuccess: refresh,
  });
}

export function useSetAutomationStatus() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: "active" | "paused" }) =>
      api<AutomationDto>(`/automations/${id}/status`, { method: "PATCH", body: { status } }),
    onSuccess: refresh,
  });
}

export function useDeleteAutomation() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (id: string) => api<void>(`/automations/${id}`, { method: "DELETE" }),
    onSuccess: refresh,
  });
}
