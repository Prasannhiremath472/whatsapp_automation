import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { AlertTriangle, ArrowLeft, FileText, Search, Send, Smile, StickyNote, Tag } from "lucide-react";
import { toast } from "sonner";
import {
  contactName,
  contactPhone,
  isWindowOpen,
  useAssignConversation,
  useConversations,
  useMarkRead,
  useMessages,
  useSendText,
  useSetConversationAi,
  useSetConversationStatus,
  useTeamMembers,
  type InboxConversation,
} from "@/api/inbox";
import { useUpdateContact } from "@/api/contacts";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { SendTemplateDialog } from "@/components/inbox/SendTemplateDialog";
import { DeliveryTick } from "@/components/whatsapp/TemplatePreview";
import { ApiError } from "@/lib/api";
import { useSession } from "@/lib/auth";
import { cn } from "@/lib/utils";

const FILTERS = ["all", "unread", "open", "pending", "resolved", "unassigned", "assigned to me"] as const;
type Filter = (typeof FILTERS)[number];

const initialsOf = (name: string) =>
  name
    .replace(/^\+/, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("") || "?";

/** Today -> 10:42, this week -> Tue, older -> 4 Nov. */
function shortTime(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString())
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const days = (now.getTime() - d.getTime()) / 86_400_000;
  if (days < 6) return d.toLocaleDateString([], { weekday: "short" });
  return d.toLocaleDateString([], { day: "numeric", month: "short" });
}

const statusLabel = (s: InboxConversation["status"]) =>
  s === "closed" ? "Resolved" : s === "pending" ? "Pending" : "Open";

export default function InboxPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const templateParam = searchParams.get("template");

  const conversationsQuery = useConversations();
  const conversations = useMemo(() => conversationsQuery.data ?? [], [conversationsQuery.data]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const active = conversations.find((c) => c.id === activeId) ?? null;

  const messagesQuery = useMessages(activeId);
  const messages = messagesQuery.data ?? [];
  const members = useTeamMembers().data ?? [];

  const sendText = useSendText(activeId ?? "");
  const markRead = useMarkRead();
  const setStatus = useSetConversationStatus();
  const assign = useAssignConversation();
  const setAi = useSetConversationAi();
  const updateContact = useUpdateContact();

  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [draft, setDraft] = useState("");
  const [tag, setTag] = useState("");
  const [notes, setNotes] = useState("");
  const [templateOpen, setTemplateOpen] = useState(false);
  const [templateFromLink, setTemplateFromLink] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const me = useSession().user?.id ?? null;

  // "Use template" on the Templates page lands here with ?template=<id>; it is sent once a chat is open.
  useEffect(() => {
    if (!templateParam) return;
    setTemplateFromLink(templateParam);
    setSearchParams({}, { replace: true });
  }, [templateParam, setSearchParams]);
  useEffect(() => {
    if (templateFromLink && active) setTemplateOpen(true);
  }, [templateFromLink, active]);

  // Opening a chat (or a new customer message arriving in it) clears the unread badge.
  const unreadHere = active?.unreadCount ?? 0;
  useEffect(() => {
    if (activeId && unreadHere > 0 && !markRead.isPending) markRead.mutate(activeId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, unreadHere]);

  // Keep the notes box in step with the chat that is open.
  useEffect(() => {
    setNotes(active?.contact.notes ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.id, active?.contact.notes]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [activeId, messages.length]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return conversations.filter((c) => {
      const passes =
        filter === "all" ||
        (filter === "unread" && c.unreadCount > 0) ||
        (filter === "open" && c.status === "open") ||
        (filter === "pending" && c.status === "pending") ||
        (filter === "resolved" && c.status === "closed") ||
        (filter === "unassigned" && !c.assignedAgentId) ||
        (filter === "assigned to me" && !!me && c.assignedAgentId === me);
      if (!passes) return false;
      return (
        !q ||
        contactName(c.contact).toLowerCase().includes(q) ||
        c.contact.waId.includes(q.replace(/\D/g, "") || "\u0000") ||
        (c.lastMessage?.preview ?? "").toLowerCase().includes(q)
      );
    });
  }, [conversations, query, filter, me]);

  const unreadCount = conversations.filter((c) => c.unreadCount > 0).length;
  const windowOpen = active ? isWindowOpen(active) : false;

  const apiError = (err: unknown, fallback: string) =>
    toast.error(err instanceof ApiError ? err.message : fallback);

  const send = () => {
    const text = draft.trim();
    if (!text || !active || sendText.isPending) return;
    sendText.mutate(text, {
      onSuccess: () => setDraft(""),
      onError: (err) => apiError(err, "Could not send the message"),
    });
  };

  const addTag = () => {
    if (!active || !tag.trim()) return;
    updateContact.mutate(
      { id: active.contact.id, body: { tags: [...new Set([...active.contactTags, tag.trim()])] } },
      {
        onSuccess: () => {
          setTag("");
          void conversationsQuery.refetch();
        },
        onError: (err) => apiError(err, "Could not add the label"),
      },
    );
  };

  const saveNotes = () => {
    if (!active) return;
    updateContact.mutate(
      { id: active.contact.id, body: { notes } },
      {
        onSuccess: () => {
          toast.success("Notes saved");
          void conversationsQuery.refetch();
        },
        onError: (err) => apiError(err, "Could not save the notes"),
      },
    );
  };

  return (
    <div className="flex h-[calc(100dvh-9.5rem)] min-h-[480px] overflow-hidden rounded-xl border bg-card shadow-card">
      {/* Conversation list */}
      <aside
        className={cn(
          "w-full flex-col border-r md:flex md:w-60 md:shrink-0 lg:w-64",
          active ? "hidden md:flex" : "flex",
        )}
      >
        <div className="space-y-2.5 border-b p-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="h-9 bg-chat-bg pl-9"
              placeholder="Search conversations…"
              aria-label="Search conversations"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {FILTERS.map((f) => (
              <Button
                variant="ghost"
                key={f}
                onClick={() => setFilter(f)}
                className={cn(
                  "h-auto rounded-full px-3 py-1 text-xs font-medium capitalize transition-colors",
                  filter === f
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:text-foreground",
                )}
              >
                {f}
                {f === "unread" && <span className="ml-1.5">{unreadCount}</span>}
              </Button>
            ))}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {conversationsQuery.isPending && (
            <p className="p-6 text-center text-sm text-muted-foreground">Loading conversations…</p>
          )}
          {conversationsQuery.isError && (
            <p role="alert" className="p-6 text-center text-sm text-destructive">
              Could not load conversations.
            </p>
          )}
          {conversationsQuery.isSuccess && visible.length === 0 && (
            <p className="p-6 text-center text-sm text-muted-foreground">
              {conversations.length === 0
                ? "No conversations yet. They appear here when a customer messages your WhatsApp number or replies to a campaign."
                : "No conversations found."}
            </p>
          )}
          {visible.map((c) => {
            const name = contactName(c.contact);
            return (
              <Button
                variant="ghost"
                key={c.id}
                onClick={() => setActiveId(c.id)}
                className={cn(
                  "flex h-auto w-full items-center justify-start gap-3 whitespace-normal rounded-none border-b px-3 py-3 text-left transition-colors hover:bg-muted/60",
                  c.id === activeId && "bg-primary-soft/50",
                )}
              >
                <Avatar className="h-11 w-11 shrink-0">
                  <AvatarFallback className="bg-wa-teal/15 text-sm font-semibold text-wa-deep">
                    {initialsOf(name)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className={cn("truncate text-sm", c.unreadCount > 0 ? "font-semibold" : "font-medium")}>
                      {name}
                    </span>
                    <span
                      className={cn(
                        "shrink-0 text-[11px]",
                        c.unreadCount > 0 ? "font-semibold text-primary" : "text-muted-foreground",
                      )}
                    >
                      {shortTime(c.lastMessage?.createdAt ?? c.lastMessageAt)}
                    </span>
                  </div>
                  <div className="mt-0.5 flex items-center justify-between gap-2">
                    <span
                      className={cn(
                        "truncate text-xs",
                        c.unreadCount > 0 ? "text-foreground" : "text-muted-foreground",
                      )}
                    >
                      {c.lastMessage?.direction === "outbound" ? "You: " : ""}
                      {c.lastMessage?.preview ?? "No messages yet"}
                    </span>
                    {c.unreadCount > 0 && (
                      <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-wa-bright px-1.5 text-[11px] font-semibold text-wa-deep">
                        {c.unreadCount}
                      </span>
                    )}
                  </div>
                </div>
              </Button>
            );
          })}
        </div>
      </aside>

      {/* Chat thread */}
      {active ? (
        <section className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center gap-3 border-b bg-card px-3 py-2.5">
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              aria-label="Back"
              onClick={() => setActiveId(null)}
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <Avatar className="h-9 w-9">
              <AvatarFallback className="bg-wa-teal/15 text-xs font-semibold text-wa-deep">
                {initialsOf(contactName(active.contact))}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1 leading-tight">
              <p className="truncate text-sm font-semibold">{contactName(active.contact)}</p>
              <p className="truncate text-xs text-muted-foreground">{contactPhone(active.contact)}</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              disabled={setStatus.isPending}
              onClick={() =>
                setStatus.mutate(
                  { id: active.id, status: active.status === "closed" ? "open" : "closed" },
                  { onError: (err) => apiError(err, "Could not update the conversation") },
                )
              }
            >
              {active.status === "closed" ? "Reopen" : "Resolve"}
            </Button>
          </div>

          <div ref={scrollRef} className="flex-1 space-y-1.5 overflow-y-auto bg-chat-bg px-4 py-4">
            {messagesQuery.isPending && (
              <p className="text-center text-sm text-muted-foreground">Loading messages…</p>
            )}
            {messages.map((m) => {
              const mine = m.direction === "outbound";
              return (
                <div key={m.id} className={cn("flex", mine ? "justify-end" : "justify-start")}>
                  <div
                    className={cn(
                      "max-w-[75%] rounded-lg px-3 py-1.5 shadow-sm",
                      mine ? "rounded-tr-none bg-bubble-out" : "rounded-tl-none bg-card",
                    )}
                  >
                    {mine && m.senderType === "bot" && (
                      <p className="mb-0.5 text-[10px] font-medium uppercase text-muted-foreground">Auto-reply</p>
                    )}
                    <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{m.text}</p>
                    <div className="mt-0.5 flex items-center justify-end gap-1">
                      <span className="text-[10px] text-muted-foreground">
                        {shortTime(m.createdAt)}
                      </span>
                      {mine && m.status === "failed" ? (
                        <span className="text-[10px] font-medium text-destructive" title={m.errorDetail?.message}>
                          Failed
                        </span>
                      ) : (
                        mine && (
                          <DeliveryTick
                            status={m.status === "delivered" || m.status === "read" ? m.status : "sent"}
                          />
                        )
                      )}
                    </div>
                    {mine && m.status === "failed" && m.errorDetail?.message && (
                      <p className="mt-0.5 text-[11px] text-destructive">{m.errorDetail.message}</p>
                    )}
                  </div>
                </div>
              );
            })}
            {messagesQuery.isSuccess && messages.length === 0 && (
              <p className="text-center text-sm text-muted-foreground">No messages in this conversation.</p>
            )}
          </div>

          <div className="border-t bg-card p-2.5">
            {!windowOpen && (
              <div className="mb-2 flex items-start gap-2 rounded-lg border border-amber-300/60 bg-amber-50 p-2.5 text-xs text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <p>
                  The 24-hour reply window is closed. WhatsApp only allows an approved template until{" "}
                  {contactName(active.contact)} replies.
                </p>
              </div>
            )}
            <div className="flex items-end gap-1.5">
              <Button
                variant="ghost"
                size="icon"
                aria-label="Emoji"
                disabled={!windowOpen}
                onClick={() => setDraft((d) => d + " 😊")}
              >
                <Smile className="h-5 w-5 text-muted-foreground" />
              </Button>
              <Button
                variant={windowOpen ? "ghost" : "default"}
                size={windowOpen ? "icon" : "sm"}
                aria-label="Send a template"
                onClick={() => setTemplateOpen(true)}
              >
                <FileText className="h-5 w-5" />
                {!windowOpen && "Send template"}
              </Button>
              {windowOpen && (
                <>
                  <Input
                    className="h-10 flex-1 rounded-full bg-chat-bg"
                    placeholder="Type a message"
                    aria-label="Message"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        send();
                      }
                    }}
                  />
                  <Button
                    size="icon"
                    className="h-10 w-10 rounded-full"
                    aria-label="Send"
                    onClick={send}
                    disabled={!draft.trim() || sendText.isPending}
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                </>
              )}
            </div>
          </div>

          <SendTemplateDialog
            open={templateOpen}
            onOpenChange={(open) => {
              setTemplateOpen(open);
              if (!open) setTemplateFromLink(null);
            }}
            conversationId={active.id}
            customerName={contactName(active.contact)}
            initialTemplateId={templateFromLink}
          />
        </section>
      ) : (
        <section className="hidden flex-1 items-center justify-center bg-chat-bg md:flex">
          <p className="text-sm text-muted-foreground">Select a conversation to start replying.</p>
        </section>
      )}

      {/* Customer details */}
      {active && (
        <aside className="hidden w-60 shrink-0 flex-col overflow-y-auto border-l bg-card xl:flex">
          <div className="flex flex-col items-center gap-2 border-b p-5 text-center">
            <Avatar className="h-16 w-16">
              <AvatarFallback className="bg-wa-teal/15 text-lg font-semibold text-wa-deep">
                {initialsOf(contactName(active.contact))}
              </AvatarFallback>
            </Avatar>
            <div>
              <p className="font-semibold">{contactName(active.contact)}</p>
              <p className="text-xs text-muted-foreground">{contactPhone(active.contact)}</p>
            </div>
            {active.assignedAgent && (
              <Badge variant="secondary" className="text-[11px]">
                Assigned to {active.assignedAgent.displayName}
              </Badge>
            )}
            {active.contact.optedOut && (
              <Badge variant="destructive" className="text-[11px]">
                Opted out
              </Badge>
            )}
          </div>
          <div className="space-y-4 p-4">
            <Badge variant="outline">{statusLabel(active.status)}</Badge>
            <label className="flex flex-col gap-2 text-xs font-medium">
              Assigned agent
              <select
                aria-label="Assigned agent"
                className="h-9 rounded-md border bg-card px-3 text-sm font-normal"
                value={active.assignedAgentId ?? ""}
                disabled={assign.isPending}
                onChange={(e) =>
                  assign.mutate(
                    { id: active.id, agentUserId: e.target.value || null },
                    { onError: (err) => apiError(err, "Could not assign the conversation") },
                  )
                }
              >
                <option value="">Unassigned</option>
                {members
                  .filter((m) => m.isActive !== false)
                  .map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.displayName}
                    </option>
                  ))}
              </select>
            </label>
            <label className="flex items-center justify-between gap-3 text-xs font-medium">
              <span>
                AI agent replies
                <span className="block font-normal text-muted-foreground">
                  {active.aiPaused ? "Off for this chat: a person is handling it." : "On, if an AI agent is active."}
                </span>
              </span>
              <Switch
                aria-label="AI agent replies in this chat"
                checked={!active.aiPaused}
                disabled={setAi.isPending}
                onCheckedChange={(on) =>
                  setAi.mutate(
                    { id: active.id, paused: !on },
                    { onError: (err) => apiError(err, "Could not change the AI setting") },
                  )
                }
              />
            </label>
            {active.contact.email && (
              <p className="break-all text-xs text-muted-foreground">{active.contact.email}</p>
            )}
            <div>
              <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                <Tag className="h-3.5 w-3.5" /> TAGS
              </p>
              <div className="flex flex-wrap gap-1.5">
                {active.contactTags.map((t) => (
                  <Badge key={t} variant="outline" className="text-[11px]">
                    {t}
                  </Badge>
                ))}
              </div>
              <div className="mt-2 flex gap-1">
                <Input
                  aria-label="New contact tag"
                  placeholder="Add label"
                  value={tag}
                  onChange={(e) => setTag(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addTag()}
                />
                <Button variant="outline" size="sm" disabled={!tag.trim() || updateContact.isPending} onClick={addTag}>
                  Add
                </Button>
              </div>
            </div>
            <Separator />
            <div>
              <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                <StickyNote className="h-3.5 w-3.5" /> NOTES
              </p>
              <Textarea
                aria-label="Contact notes"
                rows={4}
                placeholder="Notes about this customer"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
              <Button
                className="mt-2"
                variant="outline"
                size="sm"
                disabled={notes === (active.contact.notes ?? "") || updateContact.isPending}
                onClick={saveNotes}
              >
                Save notes
              </Button>
            </div>
          </div>
        </aside>
      )}
    </div>
  );
}
