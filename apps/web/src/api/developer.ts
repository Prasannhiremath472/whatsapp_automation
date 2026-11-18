import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  ApiKeyDto,
  ApiKeyWithSecretDto,
  ApiLogSummaryDto,
  ApiRequestLogDto,
  CreateApiKeyRequest,
} from "@whatsapp-crm/shared-types";
import { API_BASE_URL, api } from "@/lib/api";

/** The API's address without the /api/v1 part, e.g. https://api.example.com */
export const API_ORIGIN = API_BASE_URL.replace(/\/api\/v1$/, "");

const keysKey = ["api-keys"] as const;

export function useApiKeys() {
  return useQuery({ queryKey: keysKey, queryFn: () => api<ApiKeyDto[]>("/api-keys") });
}

export function useCreateApiKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateApiKeyRequest) => api<ApiKeyWithSecretDto>("/api-keys", { method: "POST", body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: keysKey }),
  });
}

export function useRevokeApiKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<ApiKeyDto>(`/api-keys/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: keysKey }),
  });
}

export interface ApiLogFilter {
  status?: "success" | "error";
  apiKeyId?: string;
  page: number;
}

export function useApiLogs(filter: ApiLogFilter) {
  return useQuery({
    queryKey: ["api-logs", filter],
    queryFn: () =>
      api<{ items: ApiRequestLogDto[]; total: number; page: number; pageSize: number }>("/api-logs", {
        query: { ...filter, pageSize: 25 },
      }),
    refetchInterval: 15_000,
    placeholderData: (previous) => previous,
  });
}

export function useApiLogSummary() {
  return useQuery({
    queryKey: ["api-logs", "summary"],
    queryFn: () => api<ApiLogSummaryDto>("/api-logs/summary"),
    refetchInterval: 30_000,
  });
}

/** The live OpenAPI description of the public API (no login needed). */
export function useOpenApi() {
  return useQuery({
    queryKey: ["openapi"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const res = await fetch(`${API_ORIGIN}/public/v1/openapi.json`);
      if (!res.ok) throw new Error(`Could not load the API description (${res.status})`);
      return (await res.json()) as OpenApiDoc;
    },
  });
}

export interface OpenApiOperation {
  summary: string;
  description?: string;
  parameters?: { name: string; in: string; required?: boolean; description?: string; schema?: { type?: string } }[];
  requestBody?: { content: Record<string, { examples?: Record<string, { summary: string; value: unknown }> }> };
  responses: Record<string, { description: string }>;
}

export interface OpenApiDoc {
  info: { title: string; version: string; description: string };
  servers: { url: string }[];
  paths: Record<string, Partial<Record<"get" | "post" | "put" | "delete", OpenApiOperation>>>;
}
