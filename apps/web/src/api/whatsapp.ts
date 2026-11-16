import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  ConnectWhatsappAccountRequest,
  UpdateWhatsappAccountRequest,
  WhatsappAccountDto,
} from "@whatsapp-crm/shared-types";
import { api } from "@/lib/api";

const key = ["whatsapp-accounts"] as const;

export function useWhatsappAccounts() {
  return useQuery({
    queryKey: key,
    queryFn: () => api<WhatsappAccountDto[]>("/whatsapp-accounts"),
  });
}

function useInvalidate() {
  const qc = useQueryClient();
  // Templates and campaigns depend on the connection, so refresh everything that does.
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: key }),
      qc.invalidateQueries({ queryKey: ["campaigns"] }),
    ]);
}

export function useConnectWhatsapp() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (body: ConnectWhatsappAccountRequest) =>
      api<WhatsappAccountDto>("/whatsapp-accounts/connect", { method: "POST", body }),
    onSuccess: invalidate,
  });
}

export function useMockConnectWhatsapp() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: () =>
      api<WhatsappAccountDto>("/whatsapp-accounts/mock-connect", { method: "POST" }),
    onSuccess: invalidate,
  });
}

export function useUpdateWhatsapp() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (body: UpdateWhatsappAccountRequest) =>
      api<WhatsappAccountDto>("/whatsapp-accounts/me", { method: "PATCH", body }),
    onSuccess: invalidate,
  });
}

export function useDisconnectWhatsapp() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: () => api<WhatsappAccountDto>("/whatsapp-accounts/me", { method: "DELETE" }),
    onSuccess: invalidate,
  });
}
