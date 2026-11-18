import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CreateTicketRequest, TicketDetailDto, TicketDto } from "@whatsapp-crm/shared-types";
import { api } from "@/lib/api";

const listKey = ["support", "tickets"] as const;

export function useTickets() {
  return useQuery({ queryKey: listKey, queryFn: () => api<TicketDto[]>("/support/tickets") });
}

export function useTicket(id: string | null) {
  return useQuery({
    queryKey: [...listKey, id],
    enabled: !!id,
    queryFn: () => api<TicketDetailDto>(`/support/tickets/${id}`),
    refetchInterval: 20_000,
  });
}

export function useCreateTicket() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateTicketRequest) => api<TicketDetailDto>("/support/tickets", { method: "POST", body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: listKey }),
  });
}

export function useReplyTicket(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (message: string) => api<TicketDetailDto>(`/support/tickets/${id}/messages`, { method: "POST", body: { message } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: listKey }),
  });
}

export function useCloseTicket(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api<TicketDetailDto>(`/support/tickets/${id}/close`, { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: listKey }),
  });
}
