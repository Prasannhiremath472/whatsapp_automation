import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  SaveWebhookEndpointRequest,
  WebhookDeliveryDto,
  WebhookEndpointDto,
  WebhookEndpointWithSecretDto,
} from "@whatsapp-crm/shared-types";
import { api } from "@/lib/api";

const key = ["webhook-endpoints"] as const;

export function useWebhookEndpoints() {
  return useQuery({ queryKey: key, queryFn: () => api<WebhookEndpointDto[]>("/webhook-endpoints") });
}

export function useWebhookDeliveries(id: string | null) {
  return useQuery({
    queryKey: [...key, id, "deliveries"],
    enabled: !!id,
    queryFn: () => api<WebhookDeliveryDto[]>(`/webhook-endpoints/${id}/deliveries`),
    refetchInterval: 5_000,
  });
}

function useRefresh() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: key });
}

export function useCreateWebhookEndpoint() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (body: SaveWebhookEndpointRequest) =>
      api<WebhookEndpointWithSecretDto>("/webhook-endpoints", { method: "POST", body }),
    onSuccess: refresh,
  });
}

export function useUpdateWebhookEndpoint() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: SaveWebhookEndpointRequest }) =>
      api<WebhookEndpointDto>(`/webhook-endpoints/${id}`, { method: "PUT", body }),
    onSuccess: refresh,
  });
}

export function useRotateWebhookSecret() {
  return useMutation({
    mutationFn: (id: string) =>
      api<WebhookEndpointWithSecretDto>(`/webhook-endpoints/${id}/rotate-secret`, { method: "POST" }),
  });
}

export function useTestWebhookEndpoint() {
  return useMutation({
    mutationFn: (id: string) => api<void>(`/webhook-endpoints/${id}/test`, { method: "POST" }),
  });
}

export function useDeleteWebhookEndpoint() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (id: string) => api<void>(`/webhook-endpoints/${id}`, { method: "DELETE" }),
    onSuccess: refresh,
  });
}
