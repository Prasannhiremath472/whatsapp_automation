import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { BroadcastCsvRecipient, CreateBroadcastCampaignRequest, SaveBroadcastTemplateRequest } from "@whatsapp-crm/shared-types";
import { apiClient } from "../lib/api-client";

export interface BroadcastTemplate {
  id: string;
  name: string;
  body: string;
  metaTemplateName: string | null;
  metaTemplateLanguage: string | null;
  metaVariableCount: number | null;
  createdAt: string;
}

export interface BroadcastCampaignCounts {
  total: number;
  pending: number;
  sent: number;
  failed: number;
}

export interface BroadcastCampaign {
  id: string;
  name: string;
  status: "draft" | "sending" | "completed" | "failed";
  templateId: string;
  template: BroadcastTemplate;
  createdAt: string;
  _counts: BroadcastCampaignCounts;
}

const templatesKey = ["broadcast-templates"];
const campaignsKey = ["broadcast-campaigns"];

export function useBroadcastTemplates() {
  return useQuery({
    queryKey: templatesKey,
    queryFn: async () => (await apiClient.get<BroadcastTemplate[]>("/broadcast-templates")).data,
  });
}

export function useCreateBroadcastTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: SaveBroadcastTemplateRequest) =>
      (await apiClient.post<BroadcastTemplate>("/broadcast-templates", body)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: templatesKey }),
  });
}

export function useBroadcastCampaigns() {
  return useQuery({
    queryKey: campaignsKey,
    // Broadcast campaigns run in the background (queued sends) — poll while
    // any campaign is still "sending" so progress counts update live
    // without the user needing to manually refresh.
    refetchInterval: (query) => {
      const data = query.state.data as BroadcastCampaign[] | undefined;
      return data?.some((c) => c.status === "sending") ? 2000 : false;
    },
    queryFn: async () => (await apiClient.get<BroadcastCampaign[]>("/broadcast-campaigns")).data,
  });
}

export function useCreateBroadcastCampaign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: CreateBroadcastCampaignRequest) =>
      (await apiClient.post<BroadcastCampaign>("/broadcast-campaigns", body)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: campaignsKey }),
  });
}

export type { BroadcastCsvRecipient };
