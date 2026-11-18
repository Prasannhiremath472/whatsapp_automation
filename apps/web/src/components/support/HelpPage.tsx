import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowLeft, Plus } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { TICKET_CATEGORIES, type TicketDto } from "@whatsapp-crm/shared-types";
import { useCloseTicket, useCreateTicket, useReplyTicket, useTicket, useTickets } from "@/api/support";
import { Modal, Status } from "@/components/genie/ui";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";

const errorText = (err: unknown, fallback: string) => (err instanceof ApiError ? err.message : fallback);
const statusLabel = (s: TicketDto["status"]) => ({ open: "Open", in_progress: "In progress", resolved: "Resolved", closed: "Closed" })[s];
const stamp = (iso: string) => new Date(iso).toLocaleString([], { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

const GUIDES = [
  { title: "Connect your WhatsApp number", text: "Add your Phone number ID, Business Account ID and a permanent access token.", to: "/whatsapp-accounts" },
  { title: "Get a template approved", text: "Messages to new customers must use a template Meta has approved.", to: "/templates" },
  { title: "Send a campaign", text: "Pick contacts, choose an approved template and send or schedule it.", to: "/campaigns" },
  { title: "Reply to customers", text: "Free replies work for 24 hours after a customer writes to you.", to: "/inbox" },
  { title: "Let AI answer for you", text: "Add your Anthropic key, describe your business and turn an agent on.", to: "/ai-agents" },
  { title: "Connect your own software", text: "Create an API key and send messages from your systems.", to: "/developer" },
];

export function HelpPage() {
  const tickets = useTickets();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  if (selectedId) return <TicketView id={selectedId} onBack={() => setSelectedId(null)} />;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Help & Support"
        subtitle="Guides for common tasks, and a direct line to our team."
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus />
            New ticket
          </Button>
        }
      />

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Quick guides</h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {GUIDES.map((g) => (
            <Link key={g.title} to={g.to} className="rounded-xl border bg-card p-4 hover:bg-muted/50">
              <h3 className="font-semibold">{g.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{g.text}</p>
            </Link>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Your tickets</h2>
        {tickets.isError && (
          <p role="alert" className="text-sm text-destructive">
            Could not load your tickets.
          </p>
        )}
        {tickets.isSuccess && tickets.data.length === 0 && <p className="text-sm text-muted-foreground">No tickets yet. If something is not working, open one and we will help.</p>}
        <ul className="space-y-2">
          {(tickets.data ?? []).map((t) => (
            <li key={t.id}>
              <button type="button" onClick={() => setSelectedId(t.id)} className="flex w-full flex-wrap items-center justify-between gap-2 rounded-xl border bg-card p-3 text-left hover:bg-muted/50">
                <span className="min-w-0">
                  <span className="block truncate font-medium">{t.subject}</span>
                  <span className="text-xs text-muted-foreground">
                    {t.category} · by {t.createdByName} · {stamp(t.lastMessageAt)}
                  </span>
                </span>
                <Status>{statusLabel(t.status)}</Status>
              </button>
            </li>
          ))}
        </ul>
      </section>

      <NewTicketDialog open={creating} onClose={() => setCreating(false)} onCreated={(id) => setSelectedId(id)} />
    </div>
  );
}

function NewTicketDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (id: string) => void }) {
  const create = useCreateTicket();
  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState<(typeof TICKET_CATEGORIES)[number]>("Other");
  const [priority, setPriority] = useState<"low" | "normal" | "high">("normal");
  const [message, setMessage] = useState("");

  const close = () => {
    setSubject("");
    setMessage("");
    setCategory("Other");
    setPriority("normal");
    onClose();
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    create.mutate(
      { subject: subject.trim(), category, priority, message: message.trim() },
      {
        onSuccess: (t) => {
          toast.success("Ticket opened. We will reply here.");
          close();
          onCreated(t.id);
        },
        onError: (err) => toast.error(errorText(err, "Could not open the ticket")),
      },
    );
  };

  return (
    <Modal open={open} onClose={close} title="New support ticket" description="Tell us what is happening and what you expected.">
      <form className="space-y-4" onSubmit={submit}>
        <div className="space-y-1.5">
          <Label htmlFor="tk-subject">Subject</Label>
          <Input id="tk-subject" value={subject} onChange={(e) => setSubject(e.target.value)} required minLength={3} maxLength={200} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="tk-category">Topic</Label>
            <select id="tk-category" className="h-9 w-full rounded-md border bg-card px-3 text-sm" value={category} onChange={(e) => setCategory(e.target.value as typeof category)}>
              {TICKET_CATEGORIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tk-priority">Urgency</Label>
            <select id="tk-priority" className="h-9 w-full rounded-md border bg-card px-3 text-sm" value={priority} onChange={(e) => setPriority(e.target.value as typeof priority)}>
              <option value="low">Low: a question</option>
              <option value="normal">Normal</option>
              <option value="high">High: I cannot send messages</option>
            </select>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="tk-message">Details</Label>
          <Textarea id="tk-message" rows={6} value={message} onChange={(e) => setMessage(e.target.value)} required minLength={10} maxLength={5000} placeholder="What did you do, what happened, and any error you saw?" />
        </div>
        <div className="flex justify-end gap-2 border-t pt-4">
          <Button type="button" variant="outline" onClick={close}>
            Cancel
          </Button>
          <Button type="submit" disabled={create.isPending || subject.trim().length < 3 || message.trim().length < 10}>
            {create.isPending ? "Sending…" : "Open ticket"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function TicketView({ id, onBack }: { id: string; onBack: () => void }) {
  const ticket = useTicket(id);
  const reply = useReplyTicket(id);
  const close = useCloseTicket(id);
  const [draft, setDraft] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const t = ticket.data;

  useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: "end" });
  }, [t?.messages.length]);

  const send = (e: FormEvent) => {
    e.preventDefault();
    const message = draft.trim();
    if (!message) return;
    reply.mutate(message, {
      onSuccess: () => setDraft(""),
      onError: (err) => toast.error(errorText(err, "Could not send your reply")),
    });
  };

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" onClick={onBack}>
        <ArrowLeft /> All tickets
      </Button>
      {ticket.isPending && <p className="text-sm text-muted-foreground">Loading…</p>}
      {ticket.isError && (
        <p role="alert" className="text-sm text-destructive">
          Could not load this ticket.
        </p>
      )}
      {t && (
        <>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-xl font-semibold">{t.subject}</h1>
              <p className="mt-1 text-xs text-muted-foreground">
                {t.category} · {t.priority} priority · opened by {t.createdByName} on {stamp(t.createdAt)}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Status>{statusLabel(t.status)}</Status>
              {t.status !== "closed" && (
                <Button variant="outline" size="sm" disabled={close.isPending} onClick={() => close.mutate(undefined, { onSuccess: () => toast.success("Ticket closed") })}>
                  Close ticket
                </Button>
              )}
            </div>
          </div>

          <div className="space-y-3 rounded-xl border bg-card p-4">
            {t.messages.map((m) => (
              <div key={m.id} className={cn("flex", m.authorType === "support" ? "justify-start" : "justify-end")}>
                <div className={cn("max-w-[85%] rounded-lg px-3 py-2 text-sm", m.authorType === "support" ? "bg-muted" : "bg-primary-soft")}>
                  <p className="text-[11px] font-medium text-muted-foreground">
                    {m.authorName} · {stamp(m.createdAt)}
                  </p>
                  <p className="mt-1 whitespace-pre-wrap">{m.body}</p>
                </div>
              </div>
            ))}
            <div ref={endRef} />
          </div>

          <form className="space-y-2" onSubmit={send}>
            <Label htmlFor="tk-reply" className="sr-only">
              Your reply
            </Label>
            <Textarea id="tk-reply" rows={3} placeholder={t.status === "closed" ? "Replying will reopen this ticket" : "Write a reply"} value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={5000} />
            <Button type="submit" disabled={!draft.trim() || reply.isPending}>
              {reply.isPending ? "Sending…" : "Send reply"}
            </Button>
          </form>
        </>
      )}
    </div>
  );
}
