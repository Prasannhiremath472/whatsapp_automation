import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  ConversationStatus,
  SendTemplateMessageRequest,
} from "@whatsapp-crm/shared-types";
import { api } from "@/lib/api";

/**
 * The inbox refreshes by polling: the API is hosted on shared hosting where a
 * persistent WebSocket is not dependable, and a few seconds of delay is fine.
 * Polling pauses automatically while the browser tab is hidden.
 */
const LIST_POLL_MS = 5_000;
const THREAD_POLL_MS = 3_000;

export interface InboxConversation {
  id: string;
  status: ConversationStatus;
  assignedAgentId: string | null;
  assignedAgent: { id: string; displayName: string } | null;
  lastMessageAt: string | null;
  unreadCount: number;
  /** When free-form replies stop being allowed (24 h after the customer's last message). */
  windowExpiresAt: string | null;
  /** True once a person joined the chat (or the AI handed it over): the AI agent stays quiet. */
  aiPaused: boolean;
  contact: {
    id: string;
    waId: string;
    displayName: string | null;
    profileName: string | null;
    email: string | null;
    notes: string | null;
    optedOut: boolean;
  };
  contactTags: string[];
  lastMessage: {
    direction: "inbound" | "outbound";
    messageType: string;
    preview: string;
    status: string;
    createdAt: string;
  } | null;
}

export interface InboxMessage {
  id: string;
  direction: "inbound" | "outbound";
  senderType: "customer" | "agent" | "bot" | "system";
  messageType: string;
  text: string;
  status: "queued" | "sent" | "delivered" | "read" | "failed";
  errorDetail: { message?: string } | null;
  createdAt: string;
}

export interface TeamMember {
  id: string;
  displayName: string;
  role: string;
  isActive?: boolean;
}

const keys = {
  list: ["conversations"] as const,
  thread: (id: string) => ["conversations", id, "messages"] as const,
  members: ["users"] as const,
};

export const contactName = (c: InboxConversation["contact"]): string =>
  c.displayName || c.profileName || `+${c.waId}`;

export const contactPhone = (c: InboxConversation["contact"]): string => `+${c.waId}`;

/** Whether the customer wrote within the last 24 hours, i.e. free-form replies are allowed. */
export const isWindowOpen = (c: Pick<InboxConversation, "windowExpiresAt">, now = Date.now()) =>
  !!c.windowExpiresAt && new Date(c.windowExpiresAt).getTime() > now;

export function useConversations({ enabled = true }: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: keys.list,
    enabled,
    queryFn: () => api<InboxConversation[]>("/conversations", { query: { limit: 100 } }),
    refetchInterval: LIST_POLL_MS,
  });
}

/** Messages of one conversation, oldest first. */
export function useMessages(conversationId: string | null) {
  return useQuery({
    queryKey: keys.thread(conversationId ?? "none"),
    enabled: !!conversationId,
    queryFn: async () => {
      const rows = await api<InboxMessage[]>(`/conversations/${conversationId}/messages`, {
        query: { limit: 200 },
      });
      return [...rows].reverse();
    },
    refetchInterval: THREAD_POLL_MS,
  });
}

export function useTeamMembers() {
  return useQuery({
    queryKey: keys.members,
    queryFn: () => api<TeamMember[]>("/users"),
    staleTime: 60_000,
  });
}

function useRefreshInbox(conversationId?: string) {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: keys.list });
    if (conversationId) void qc.invalidateQueries({ queryKey: keys.thread(conversationId) });
  };
}

export function useSendText(conversationId: string) {
  const refresh = useRefreshInbox(conversationId);
  return useMutation({
    mutationFn: (text: string) =>
      api<InboxMessage>(`/conversations/${conversationId}/messages`, {
        method: "POST",
        body: { messageType: "text", text },
      }),
    onSuccess: refresh,
  });
}

export function useSendTemplate(conversationId: string) {
  const refresh = useRefreshInbox(conversationId);
  return useMutation({
    mutationFn: (body: Omit<SendTemplateMessageRequest, "bodyVars" | "headerVars"> & {
      bodyVars: string[];
      headerVars: string[];
    }) =>
      api<InboxMessage>(`/conversations/${conversationId}/template-messages`, {
        method: "POST",
        body,
      }),
    onSuccess: refresh,
  });
}

export function useMarkRead() {
  const refresh = useRefreshInbox();
  return useMutation({
    mutationFn: (conversationId: string) =>
      api(`/conversations/${conversationId}/read`, { method: "POST" }),
    onSuccess: refresh,
  });
}

export function useSetConversationStatus() {
  const refresh = useRefreshInbox();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: ConversationStatus }) =>
      api(`/conversations/${id}/status`, { method: "PATCH", body: { status } }),
    onSuccess: refresh,
  });
}

export function useAssignConversation() {
  const refresh = useRefreshInbox();
  return useMutation({
    mutationFn: ({ id, agentUserId }: { id: string; agentUserId: string | null }) =>
      api(`/conversations/${id}/assign`, { method: "PATCH", body: { agentUserId } }),
    onSuccess: refresh,
  });
}

export function useSetConversationAi() {
  const refresh = useRefreshInbox();
  return useMutation({
    mutationFn: ({ id, paused }: { id: string; paused: boolean }) =>
      api(`/conversations/${id}/ai`, { method: "PATCH", body: { paused } }),
    onSuccess: refresh,
  });
}
