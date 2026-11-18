import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  AiAgentDto,
  AiProvider,
  AiKnowledgeDto,
  AiSettingsDto,
  AiTestReply,
  SaveAiAgentRequest,
  SaveKnowledgeRequest,
} from "@whatsapp-crm/shared-types";
import { api } from "@/lib/api";

const settingsKey = ["ai", "settings"] as const;
const agentsKey = ["ai", "agents"] as const;

export function useAiSettings() {
  return useQuery({ queryKey: settingsKey, queryFn: () => api<AiSettingsDto>("/ai/settings") });
}

export function useAiAgents() {
  return useQuery({ queryKey: agentsKey, queryFn: () => api<AiAgentDto[]>("/ai/agents") });
}

function useRefreshAll() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ["ai"] });
}

export function useSetAiKey() {
  const refresh = useRefreshAll();
  return useMutation({
    mutationFn: (body: { provider: AiProvider; apiKey: string }) =>
      api<AiSettingsDto>("/ai/settings/key", { method: "PUT", body }),
    onSuccess: refresh,
  });
}

export function useRemoveAiKey() {
  const refresh = useRefreshAll();
  return useMutation({
    mutationFn: () => api<AiSettingsDto>("/ai/settings/key", { method: "DELETE" }),
    onSuccess: refresh,
  });
}

export function useSaveAiAgent() {
  const refresh = useRefreshAll();
  return useMutation({
    mutationFn: ({ id, body }: { id?: string | undefined; body: SaveAiAgentRequest }) =>
      id ? api<AiAgentDto>(`/ai/agents/${id}`, { method: "PUT", body }) : api<AiAgentDto>("/ai/agents", { method: "POST", body }),
    onSuccess: refresh,
  });
}

export function useSetAiAgentStatus() {
  const refresh = useRefreshAll();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: "active" | "paused" }) =>
      api<AiAgentDto>(`/ai/agents/${id}/status`, { method: "PATCH", body: { status } }),
    onSuccess: refresh,
  });
}

export function useDeleteAiAgent() {
  const refresh = useRefreshAll();
  return useMutation({
    mutationFn: (id: string) => api<void>(`/ai/agents/${id}`, { method: "DELETE" }),
    onSuccess: refresh,
  });
}

export function useSaveKnowledge(agentId: string) {
  const refresh = useRefreshAll();
  return useMutation({
    mutationFn: ({ id, body }: { id?: string | undefined; body: SaveKnowledgeRequest }) =>
      id
        ? api<AiKnowledgeDto>(`/ai/agents/${agentId}/knowledge/${id}`, { method: "PUT", body })
        : api<AiKnowledgeDto>(`/ai/agents/${agentId}/knowledge`, { method: "POST", body }),
    onSuccess: refresh,
  });
}

export function useDeleteKnowledge(agentId: string) {
  const refresh = useRefreshAll();
  return useMutation({
    mutationFn: (id: string) => api<void>(`/ai/agents/${agentId}/knowledge/${id}`, { method: "DELETE" }),
    onSuccess: refresh,
  });
}

export function useTestAiAgent(agentId: string) {
  return useMutation({
    mutationFn: (messages: { role: "user" | "assistant"; text: string }[]) =>
      api<AiTestReply>(`/ai/agents/${agentId}/test`, { method: "POST", body: { messages } }),
  });
}
