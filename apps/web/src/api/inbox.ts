import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  AssignConversationRequest,
  ConversationStatus,
  SendMessageRequest,
  UpdateConversationStatusRequest,
  User,
} from "@whatsapp-crm/shared-types";
import { apiClient } from "../lib/api-client";
import { getSocket } from "../lib/socket-client";

// Local response shapes — the API returns raw Prisma rows for these
// endpoints (dates as ISO strings once JSON-serialized), so we widen rather
// than reuse the DB-side Prisma types here.
export interface Contact {
  id: string;
  tenantId: string;
  waId: string;
  displayName: string | null;
  profileName: string | null;
}

export interface ConversationSummary {
  id: string;
  tenantId: string;
  contactId: string;
  contact: Contact;
  whatsappConnectionId: string;
  status: ConversationStatus;
  assignedAgentId: string | null;
  lastMessageAt: string | null;
  unreadCount: number;
  windowExpiresAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface InboxMessage {
  id: string;
  tenantId: string;
  conversationId: string;
  direction: "inbound" | "outbound";
  senderType: "customer" | "agent" | "bot" | "system";
  senderUserId: string | null;
  waMessageId: string | null;
  messageType: string;
  content: Record<string, unknown>;
  status: "queued" | "sent" | "delivered" | "read" | "failed";
  errorDetail: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

export interface ConversationFilters {
  status?: ConversationStatus | "all";
  assignedToMe?: boolean;
}

const conversationsKey = (filters: ConversationFilters) => ["conversations", filters];
const messagesKey = (conversationId: string | null) => ["conversations", conversationId, "messages"];

export function useConversations(filters: ConversationFilters = {}) {
  return useQuery({
    queryKey: conversationsKey(filters),
    queryFn: async () => {
      const params: Record<string, string> = {};
      if (filters.status && filters.status !== "all") {
        params.status = filters.status;
      }
      if (filters.assignedToMe) {
        params.assignedToMe = "true";
      }
      const { data } = await apiClient.get<ConversationSummary[]>("/conversations", { params });
      return data;
    },
  });
}

export function useMessages(conversationId: string | null) {
  return useQuery({
    queryKey: messagesKey(conversationId),
    queryFn: async () => {
      const { data } = await apiClient.get<InboxMessage[]>(`/conversations/${conversationId}/messages`);
      // API returns newest-first; UI wants oldest-first for a chat window.
      return [...data].reverse();
    },
    enabled: !!conversationId,
  });
}

export function useTenantAgents() {
  return useQuery({
    queryKey: ["users"],
    queryFn: async () => {
      const { data } = await apiClient.get<User[]>("/users");
      return data.filter((u) => u.role === "agent" || u.role === "tenant_admin");
    },
  });
}

export function useSendMessage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ conversationId, ...body }: { conversationId: string } & SendMessageRequest) => {
      const { data } = await apiClient.post<InboxMessage>(`/conversations/${conversationId}/messages`, body);
      return data;
    },
    onSuccess: (message) => {
      queryClient.invalidateQueries({ queryKey: messagesKey(message.conversationId) });
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
    },
  });
}

export function useAssignConversation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ conversationId, agentUserId }: { conversationId: string } & AssignConversationRequest) => {
      const { data } = await apiClient.patch<ConversationSummary>(`/conversations/${conversationId}/assign`, {
        agentUserId,
      });
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
    },
  });
}

export function useUpdateConversationStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ conversationId, status }: { conversationId: string } & UpdateConversationStatusRequest) => {
      const { data } = await apiClient.patch<ConversationSummary>(`/conversations/${conversationId}/status`, {
        status,
      });
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
    },
  });
}

/**
 * Subscribes the socket's `message:new` / `conversation:updated` events to
 * TanStack Query cache invalidation for the lifetime of the mounted
 * component (typically InboxPage). Safe to call once at the page root.
 */
export function useInboxSocketSync(): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    const socket = getSocket();
    if (!socket) {
      return;
    }

    const handleMessageNew = (payload: { message: InboxMessage; conversation: ConversationSummary }) => {
      queryClient.invalidateQueries({ queryKey: messagesKey(payload.message.conversationId) });
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
    };

    const handleConversationUpdated = () => {
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
    };

    socket.on("message:new", handleMessageNew);
    socket.on("conversation:updated", handleConversationUpdated);

    return () => {
      socket.off("message:new", handleMessageNew);
      socket.off("conversation:updated", handleConversationUpdated);
    };
  }, [queryClient]);
}
