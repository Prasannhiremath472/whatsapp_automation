import { useMemo } from "react";
import type { ConversationStatus } from "@whatsapp-crm/shared-types";
import { AppLayout } from "../../../components/AppLayout";
import { useInboxStore } from "../../../stores/inbox.store";
import {
  useAssignConversation,
  useConversations,
  useInboxSocketSync,
  useMessages,
  useSendMessage,
  useTenantAgents,
  useUpdateConversationStatus,
  type ConversationSummary,
  type InboxMessage,
} from "../../../api/inbox";
import { Button } from "../../../components/Button";
import { Input } from "../../../components/Input";

const STATUS_TABS: { label: string; value: ConversationStatus | "all" }[] = [
  { label: "New", value: "open" },
  { label: "In progress", value: "pending" },
  { label: "Resolved", value: "closed" },
  { label: "All", value: "all" },
];

function formatTime(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatPhone(waId: string): string {
  // waId is a bare digit string like "919812345001" (country code + number).
  if (/^\d{10,15}$/.test(waId)) return `+${waId}`;
  return waId;
}

function contactLabel(conversation: ConversationSummary): string {
  return conversation.contact.profileName || conversation.contact.displayName || formatPhone(conversation.contact.waId);
}

function lastMessagePreview(conversation: ConversationSummary): string {
  // We don't fetch the last message body separately for the list view (M3
  // scope keeps this simple) — show unread count / status instead.
  return conversation.unreadCount > 0 ? `${conversation.unreadCount} new message${conversation.unreadCount > 1 ? "s" : ""}` : "No new messages";
}

function ConversationListPane() {
  const statusFilter = useInboxStore((s) => s.statusFilter);
  const setStatusFilter = useInboxStore((s) => s.setStatusFilter);
  const assignedToMeOnly = useInboxStore((s) => s.assignedToMeOnly);
  const setAssignedToMeOnly = useInboxStore((s) => s.setAssignedToMeOnly);
  const selectedConversationId = useInboxStore((s) => s.selectedConversationId);
  const selectConversation = useInboxStore((s) => s.selectConversation);

  const { data: conversations, isLoading } = useConversations({
    status: statusFilter,
    assignedToMe: assignedToMeOnly,
  });

  return (
    <div className="flex h-full w-80 flex-shrink-0 flex-col border-r border-gray-200 bg-white">
      <div className="border-b border-gray-200 p-3">
        <div className="mb-2 flex gap-1">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.value}
              onClick={() => setStatusFilter(tab.value)}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                statusFilter === tab.value
                  ? "bg-emerald-600 text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-xs text-gray-600">
          <input
            type="checkbox"
            checked={assignedToMeOnly}
            onChange={(e) => setAssignedToMeOnly(e.target.checked)}
            className="h-3.5 w-3.5 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
          />
          Only show enquiries assigned to me
        </label>
      </div>

      <div className="flex-1 overflow-y-auto">
        {isLoading && (
          <div className="flex flex-col items-center gap-2 p-8 text-center text-sm text-gray-400">
            <span>Loading enquiries…</span>
          </div>
        )}
        {!isLoading && (conversations?.length ?? 0) === 0 && (
          <div className="flex flex-col items-center gap-2 p-8 text-center">
            <span className="text-3xl">💬</span>
            <span className="text-sm font-medium text-gray-600">No enquiries here yet</span>
            <span className="text-xs text-gray-400">
              New student and parent messages on WhatsApp will show up here automatically.
            </span>
          </div>
        )}
        {conversations?.map((conversation) => (
          <button
            key={conversation.id}
            onClick={() => selectConversation(conversation.id)}
            className={`flex w-full flex-col items-start gap-0.5 border-b border-gray-100 px-4 py-3 text-left transition-colors hover:bg-gray-50 ${
              selectedConversationId === conversation.id ? "bg-emerald-50" : ""
            }`}
          >
            <div className="flex w-full items-center justify-between">
              <span className="truncate text-sm font-medium text-gray-900">{contactLabel(conversation)}</span>
              <span className="flex-shrink-0 text-[11px] text-gray-400">{formatTime(conversation.lastMessageAt)}</span>
            </div>
            <div className="flex w-full items-center justify-between">
              <span className="truncate text-xs text-gray-500">{lastMessagePreview(conversation)}</span>
              {conversation.unreadCount > 0 && (
                <span className="ml-2 flex-shrink-0 rounded-full bg-emerald-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                  {conversation.unreadCount}
                </span>
              )}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function messageStatusLabel(status: InboxMessage["status"]): string {
  switch (status) {
    case "queued":
      return "Sending…";
    case "sent":
      return "Sent";
    case "delivered":
      return "Delivered";
    case "read":
      return "Read";
    case "failed":
      return "Failed";
    default:
      return status;
  }
}

function messageBody(message: InboxMessage): string {
  const content = message.content ?? {};
  if (typeof content.body === "string") return content.body;
  if (typeof content.caption === "string") return content.caption;
  if (typeof content.buttonText === "string") return content.buttonText;
  return `[${message.messageType}]`;
}

function MessageBubble({ message }: { message: InboxMessage }) {
  const isOutbound = message.direction === "outbound";
  const isBot = message.senderType === "bot" || message.senderType === "system";

  const bubbleClasses = isBot
    ? "bg-amber-50 text-amber-900 border border-amber-200"
    : isOutbound
      ? "bg-emerald-600 text-white"
      : "bg-white text-gray-900 border border-gray-200";

  return (
    <div className={`flex ${isOutbound ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-[70%] rounded-lg px-3 py-2 text-sm shadow-sm ${bubbleClasses}`}>
        {isBot && (
          <div className="mb-1 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-amber-600">
            <span>🤖</span>
            <span>Automated reply</span>
          </div>
        )}
        <div className="whitespace-pre-wrap break-words">{messageBody(message)}</div>
        <div
          className={`mt-1 flex items-center justify-end gap-1 text-[10px] ${
            isOutbound ? "text-emerald-100" : "text-gray-400"
          }`}
        >
          <span>{formatTime(message.createdAt)}</span>
          {isOutbound && (
            <span className={message.status === "failed" ? "font-semibold text-red-100" : ""}>
              · {messageStatusLabel(message.status)}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function ChatWindowPane() {
  const selectedConversationId = useInboxStore((s) => s.selectedConversationId);
  const composeDraft = useInboxStore((s) => s.composeDraft);
  const setComposeDraft = useInboxStore((s) => s.setComposeDraft);
  const { data: conversations } = useConversations({});
  const { data: messages, isLoading } = useMessages(selectedConversationId);
  const sendMessage = useSendMessage();

  const conversation = useMemo(
    () => conversations?.find((c) => c.id === selectedConversationId) ?? null,
    [conversations, selectedConversationId],
  );

  if (!selectedConversationId) {
    return (
      <div className="flex h-full flex-1 flex-col items-center justify-center gap-2 bg-gray-50 text-center">
        <span className="text-3xl">👋</span>
        <span className="text-sm font-medium text-gray-600">Select an enquiry to view the conversation</span>
        <span className="max-w-xs text-xs text-gray-400">
          Pick a student or parent from the list on the left to see their messages and reply.
        </span>
      </div>
    );
  }

  const handleSend = () => {
    const text = composeDraft.trim();
    if (!text || sendMessage.isPending) return;
    sendMessage.mutate(
      { conversationId: selectedConversationId, messageType: "text", text },
      { onSuccess: () => setComposeDraft("") },
    );
  };

  return (
    <div className="flex h-full flex-1 flex-col bg-gray-50">
      <div className="flex items-center justify-between border-b border-gray-200 bg-white px-4 py-3">
        <div>
          <div className="text-sm font-semibold text-gray-900">
            {conversation ? contactLabel(conversation) : "Conversation"}
          </div>
          {conversation && <div className="text-xs text-gray-400">{formatPhone(conversation.contact.waId)}</div>}
        </div>
      </div>

      <div className="flex-1 space-y-2 overflow-y-auto p-4">
        {isLoading && <div className="text-sm text-gray-400">Loading messages…</div>}
        {!isLoading && (messages?.length ?? 0) === 0 && (
          <div className="text-sm text-gray-400">No messages in this conversation yet.</div>
        )}
        {messages?.map((message) => <MessageBubble key={message.id} message={message} />)}
      </div>

      <div className="border-t border-gray-200 bg-white p-3">
        {sendMessage.isError && (
          <div className="mb-2 text-xs text-red-600">Failed to send message. Please try again.</div>
        )}
        <div className="flex gap-2">
          <Input
            value={composeDraft}
            onChange={(e) => setComposeDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="Type a message…"
          />
          <Button onClick={handleSend} disabled={!composeDraft.trim() || sendMessage.isPending}>
            Send
          </Button>
        </div>
      </div>
    </div>
  );
}

function ContactDetailPane() {
  const selectedConversationId = useInboxStore((s) => s.selectedConversationId);
  const { data: conversations } = useConversations({});
  const { data: agents } = useTenantAgents();
  const assignConversation = useAssignConversation();
  const updateStatus = useUpdateConversationStatus();

  const conversation = useMemo(
    () => conversations?.find((c) => c.id === selectedConversationId) ?? null,
    [conversations, selectedConversationId],
  );

  if (!selectedConversationId || !conversation) {
    return (
      <div className="flex h-full w-72 flex-shrink-0 items-center justify-center border-l border-gray-200 bg-white p-4 text-center text-xs text-gray-400">
        Select an enquiry to see its details.
      </div>
    );
  }

  return (
    <div className="flex h-full w-72 flex-shrink-0 flex-col gap-5 border-l border-gray-200 bg-white p-4">
      <div>
        <div className="text-xs font-medium uppercase tracking-wide text-gray-400">Student / Parent</div>
        <div className="mt-1 text-sm font-semibold text-gray-900">{contactLabel(conversation)}</div>
        <div className="text-xs text-gray-500">{formatPhone(conversation.contact.waId)}</div>
      </div>

      <div>
        <label className="text-xs font-medium uppercase tracking-wide text-gray-400">Enquiry status</label>
        <select
          className="mt-1 w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          value={conversation.status}
          onChange={(e) =>
            updateStatus.mutate({ conversationId: conversation.id, status: e.target.value as ConversationStatus })
          }
        >
          <option value="open">New</option>
          <option value="pending">In progress</option>
          <option value="closed">Resolved</option>
        </select>
      </div>

      <div>
        <label className="text-xs font-medium uppercase tracking-wide text-gray-400">Handled by</label>
        <select
          className="mt-1 w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          value={conversation.assignedAgentId ?? ""}
          onChange={(e) =>
            assignConversation.mutate({
              conversationId: conversation.id,
              agentUserId: e.target.value || null,
            })
          }
        >
          <option value="">Not yet assigned</option>
          {agents?.map((agent) => (
            <option key={agent.id} value={agent.id}>
              {agent.displayName}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

export function InboxPage() {
  useInboxSocketSync();

  return (
    <AppLayout fullBleed>
      <div className="flex h-full min-h-0">
        <ConversationListPane />
        <ChatWindowPane />
        <ContactDetailPane />
      </div>
    </AppLayout>
  );
}
