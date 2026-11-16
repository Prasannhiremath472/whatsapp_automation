import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  AudiencePreview,
  Audience,
  CampaignDto,
  CampaignRecipientDto,
  CampaignStatus,
  Paginated,
  RecipientStatus,
  SaveCampaignRequest,
} from "@whatsapp-crm/shared-types";
import { api } from "@/lib/api";

const key = ["campaigns"] as const;

/** While a campaign is moving, poll so progress bars stay live. */
const LIVE_STATUSES: CampaignStatus[] = ["running", "scheduled", "paused"];
const POLL_MS = 3000;

export interface CampaignFilters {
  page: number;
  pageSize: number;
  status?: CampaignStatus;
  q?: string;
}

export function useCampaigns(filters: CampaignFilters) {
  return useQuery({
    queryKey: [...key, "list", filters],
    queryFn: ({ signal }) =>
      api<Paginated<CampaignDto>>("/campaigns", { signal, query: { ...filters } }),
    placeholderData: keepPreviousData,
    refetchInterval: (query) =>
      query.state.data?.data.some((c) => c.status === "running") ? POLL_MS : false,
  });
}

export type CampaignSummary = Record<CampaignStatus | "total", number>;

export function useCampaignSummary() {
  return useQuery({
    queryKey: [...key, "summary"],
    queryFn: () => api<CampaignSummary>("/campaigns/summary"),
  });
}

export function useCampaign(id: string | null) {
  return useQuery({
    queryKey: [...key, "detail", id],
    enabled: !!id,
    queryFn: () => api<CampaignDto>(`/campaigns/${id}`),
    refetchInterval: (query) =>
      query.state.data && LIVE_STATUSES.includes(query.state.data.status) ? POLL_MS : false,
  });
}

export function useCampaignRecipients(
  id: string | null,
  status: RecipientStatus | undefined,
  page: number,
  live: boolean,
) {
  return useQuery({
    queryKey: [...key, "recipients", id, status, page],
    enabled: !!id,
    queryFn: () =>
      api<Paginated<CampaignRecipientDto>>(`/campaigns/${id}/recipients`, {
        query: { status, page, pageSize: 20 },
      }),
    placeholderData: keepPreviousData,
    refetchInterval: live ? POLL_MS : false,
  });
}

export function useAudiencePreview(audience: Audience | null) {
  return useQuery({
    queryKey: [...key, "audience", audience],
    enabled: !!audience,
    queryFn: () =>
      api<AudiencePreview>("/campaigns/audience-preview", { method: "POST", body: { audience } }),
    placeholderData: keepPreviousData,
  });
}

function useInvalidate() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: key });
}

export function useSaveCampaign() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, body }: { id?: string | undefined; body: SaveCampaignRequest }) =>
      id
        ? api<CampaignDto>(`/campaigns/${id}`, { method: "PUT", body })
        : api<CampaignDto>("/campaigns", { method: "POST", body }),
    onSuccess: invalidate,
  });
}

type Action = "launch" | "pause" | "resume" | "cancel" | "retry-failed";

export function useCampaignAction() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, action }: { id: string; action: Action }) =>
      api<CampaignDto>(`/campaigns/${id}/${action}`, { method: "POST" }),
    onSuccess: invalidate,
  });
}

export function useDeleteCampaign() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (id: string) => api<void>(`/campaigns/${id}`, { method: "DELETE" }),
    onSuccess: invalidate,
  });
}
