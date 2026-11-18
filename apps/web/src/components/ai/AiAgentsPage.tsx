import { useEffect, useRef, useState, type FormEvent } from "react";
import { Bot, Pencil, Plus, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AI_PROVIDERS, type AiAgentDto, type AiKnowledgeDto, type AiProvider } from "@whatsapp-crm/shared-types";
import {
  useAiAgents,
  useAiSettings,
  useDeleteAiAgent,
  useDeleteKnowledge,
  useRemoveAiKey,
  useSaveAiAgent,
  useSaveKnowledge,
  useSetAiAgentStatus,
  useSetAiKey,
  useTestAiAgent,
} from "@/api/ai";
import { Metrics, Modal, Status } from "@/components/genie/ui";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/lib/api";
import { useSession } from "@/lib/auth";
import { cn } from "@/lib/utils";

const errorText = (err: unknown, fallback: string) => (err instanceof ApiError ? err.message : fallback);
const fmt = (n: number) => n.toLocaleString();

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4 rounded-xl border bg-card p-5">
      <div>
        <h2 className="font-semibold">{title}</h2>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {children}
    </section>
  );
}

export function AiAgentsPage() {
  const { user } = useSession();
  const isAdmin = user.role === "tenant_admin";
  const settings = useAiSettings();
  const agentsQuery = useAiAgents();
  const agents = agentsQuery.data ?? [];
  const setStatus = useSetAiAgentStatus();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const selected = agents.find((a) => a.id === selectedId) ?? agents[0] ?? null;

  const hasKey = settings.data?.hasKey ?? false;
  const provider: AiProvider = settings.data?.provider ?? "anthropic";
  const totals = agents.reduce(
    (t, a) => ({
      requests: t.requests + a.usage.requests,
      tokens: t.tokens + a.usage.inputTokens + a.usage.outputTokens,
      handovers: t.handovers + a.usage.handovers,
    }),
    { requests: 0, tokens: 0, handovers: 0 },
  );

  return (
    <div className="space-y-5">
      <PageHeader
        title="Genie AI Agents"
        subtitle="An AI assistant answers your customers on WhatsApp, and hands over to your team when needed."
        actions={
          isAdmin && (
            <Button onClick={() => setCreating(true)}>
              <Plus />
              New agent
            </Button>
          )
        }
      />

      <Metrics
        items={[
          { label: "Agents on", value: agents.filter((a) => a.status === "active").length },
          { label: "AI replies (30 days)", value: fmt(totals.requests) },
          { label: "Handed to your team", value: fmt(totals.handovers) },
          { label: "Tokens used (30 days)", value: fmt(totals.tokens) },
        ]}
      />

      <KeySection hasKey={hasKey} provider={provider} last4={settings.data?.keyLast4 ?? null} lastError={settings.data?.lastError ?? null} isAdmin={isAdmin} />

      {agentsQuery.isSuccess && agents.length === 0 && (
        <p className="rounded-xl border bg-card p-6 text-center text-sm text-muted-foreground">
          No agents yet. Create one, describe what it should do, add a few facts about your business, test it, then turn it on.
        </p>
      )}

      {agents.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {agents.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => setSelectedId(a.id)}
              className={cn(
                "flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm",
                selected?.id === a.id ? "border-primary bg-primary-soft text-primary" : "bg-card hover:bg-muted",
              )}
            >
              <Bot className="size-4" />
              {a.name}
              <Status>{a.status === "active" ? "Active" : "Paused"}</Status>
            </button>
          ))}
        </div>
      )}

      {selected && (
        <AgentPanel
          key={selected.id}
          agent={selected}
          isAdmin={isAdmin}
          hasKey={hasKey}
          provider={provider}
          onToggle={(on) =>
            setStatus.mutate(
              { id: selected.id, status: on ? "active" : "paused" },
              {
                onSuccess: () => toast.success(on ? `${selected.name} is now answering customers` : `${selected.name} is paused`),
                onError: (err) => toast.error(errorText(err, "Could not change the agent")),
              },
            )
          }
          toggling={setStatus.isPending}
        />
      )}

      <AgentEditor open={creating} agent={null} provider={provider} onClose={() => setCreating(false)} onSaved={(a) => setSelectedId(a.id)} />
    </div>
  );
}

function KeySection({
  hasKey,
  provider,
  last4,
  lastError,
  isAdmin,
}: {
  hasKey: boolean;
  provider: AiProvider;
  last4: string | null;
  lastError: string | null;
  isAdmin: boolean;
}) {
  const setKey = useSetAiKey();
  const removeKey = useRemoveAiKey();
  const [choice, setChoice] = useState<AiProvider>(provider);
  const [value, setValue] = useState("");

  useEffect(() => setChoice(provider), [provider]);
  const info = AI_PROVIDERS.find((p) => p.id === choice)!;
  const current = AI_PROVIDERS.find((p) => p.id === provider)!;
  const switching = hasKey && choice !== provider;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (switching && !confirm(`Switch to ${info.label}? Your agents will be paused and moved to ${info.defaultModel}.`)) return;
    setKey.mutate(
      { provider: choice, apiKey: value.trim() },
      {
        onSuccess: () => {
          setValue("");
          toast.success("API key saved");
        },
        onError: (err) => toast.error(errorText(err, "Could not save the key")),
      },
    );
  };

  return (
    <Section
      title="Your AI provider key"
      description="Genie uses your own account with Anthropic (Claude) or OpenAI (GPT), so usage is billed to you by that company. The key is checked, stored encrypted and never shown again."
    >
      <div className="flex flex-wrap items-center gap-3">
        <Status>{hasKey ? "Connected" : "Not connected"}</Status>
        {hasKey && (
          <span className="text-sm text-muted-foreground">
            {current.label} · key ending in {last4}
          </span>
        )}
        {hasKey && isAdmin && (
          <Button
            variant="outline"
            size="sm"
            disabled={removeKey.isPending}
            onClick={() => {
              if (!confirm("Remove the key? All your agents will be paused.")) return;
              removeKey.mutate(undefined, { onSuccess: () => toast.success("Key removed") });
            }}
          >
            Remove key
          </Button>
        )}
      </div>
      {lastError && (
        <p role="alert" className="rounded-md bg-destructive/10 p-2 text-xs text-destructive">
          The last AI reply failed: {lastError}
        </p>
      )}
      {isAdmin && (
        <form className="space-y-3" onSubmit={submit}>
          <div className="grid gap-3 sm:grid-cols-[14rem_1fr_auto]">
            <div className="space-y-1.5">
              <Label htmlFor="ai-provider">Provider</Label>
              <select id="ai-provider" className="h-9 w-full rounded-md border bg-card px-3 text-sm" value={choice} onChange={(e) => setChoice(e.target.value as AiProvider)}>
                {AI_PROVIDERS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ai-key">API key</Label>
              <Input id="ai-key" type="password" autoComplete="off" placeholder={hasKey && !switching ? `Paste a new key to replace it (${info.keyHint})` : info.keyHint} value={value} onChange={(e) => setValue(e.target.value)} />
            </div>
            <div className="flex items-end">
              <Button type="submit" disabled={value.trim().length < 20 || setKey.isPending}>
                {setKey.isPending ? "Checking the key…" : switching ? `Switch to ${choice === "openai" ? "OpenAI" : "Anthropic"}` : hasKey ? "Replace key" : "Save key"}
              </Button>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">Get a key at {info.keyUrl}.{switching ? " Switching pauses your agents and moves them to the new provider's default model." : ""}</p>
        </form>
      )}
    </Section>
  );
}

function AgentPanel({ agent, isAdmin, hasKey, provider, onToggle, toggling }: { agent: AiAgentDto; isAdmin: boolean; hasKey: boolean; provider: AiProvider; onToggle: (on: boolean) => void; toggling: boolean }) {
  const remove = useDeleteAiAgent();
  const [editing, setEditing] = useState(false);
  const modelLabel = AI_PROVIDERS.flatMap((p) => p.models).find((m) => m.id === agent.model)?.label ?? agent.model;

  return (
    <div className="space-y-5">
      <Section title={agent.name}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">{modelLabel}</p>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm">
              Answer customers
              <Switch aria-label={`${agent.name} answers customers`} checked={agent.status === "active"} disabled={!isAdmin || toggling || (!hasKey && agent.status !== "active")} onCheckedChange={onToggle} />
            </label>
            {isAdmin && (
              <>
                <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
                  <Pencil /> Edit
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Delete ${agent.name}`}
                  onClick={() => {
                    if (!confirm(`Delete ${agent.name}?`)) return;
                    remove.mutate(agent.id, { onSuccess: () => toast.success("Agent deleted") });
                  }}
                >
                  <Trash2 className="text-destructive" />
                </Button>
              </>
            )}
          </div>
        </div>
        {!hasKey && <p className="text-xs text-muted-foreground">Add your AI API key above to turn an agent on.</p>}
        <div>
          <p className="mb-1 text-xs font-semibold text-muted-foreground">INSTRUCTIONS</p>
          <p className="whitespace-pre-wrap text-sm">{agent.instructions}</p>
        </div>
        <p className="text-xs text-muted-foreground">
          Last 30 days: {fmt(agent.usage.requests)} replies · {fmt(agent.usage.handovers)} handed over · {fmt(agent.usage.errors)} errors · {fmt(agent.usage.inputTokens + agent.usage.outputTokens)} tokens
        </p>
      </Section>

      <div className="grid gap-5 xl:grid-cols-2">
        <KnowledgeSection agent={agent} isAdmin={isAdmin} />
        <TestChat agent={agent} hasKey={hasKey} />
      </div>
      <AgentEditor open={editing} agent={agent} provider={provider} onClose={() => setEditing(false)} />
    </div>
  );
}

function AgentEditor({ open, agent, provider, onClose, onSaved }: { open: boolean; agent: AiAgentDto | null; provider: AiProvider; onClose: () => void; onSaved?: (a: AiAgentDto) => void }) {
  const save = useSaveAiAgent();
  const [name, setName] = useState("");
  const [instructions, setInstructions] = useState("");
  const info = AI_PROVIDERS.find((p) => p.id === provider)!;
  const [model, setModel] = useState<string>(info.defaultModel);
  const [customModel, setCustomModel] = useState(false);
  const [handover, setHandover] = useState("");

  useEffect(() => {
    if (!open) return;
    setName(agent?.name ?? "");
    setInstructions(agent?.instructions ?? "");
    const start = agent?.model ?? info.defaultModel;
    setModel(start);
    setCustomModel(!info.models.some((m) => m.id === start));
    setHandover(agent?.handoverMessage ?? "Thanks! A member of our team will take over from here shortly.");
  }, [open, agent, info]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    save.mutate(
      { id: agent?.id, body: { name: name.trim(), instructions: instructions.trim(), model: model.trim(), handoverMessage: handover.trim() } },
      {
        onSuccess: (saved) => {
          toast.success(agent ? "Agent saved" : "Agent created. Test it, then turn it on.");
          onSaved?.(saved);
          onClose();
        },
        onError: (err) => toast.error(errorText(err, "Could not save the agent")),
      },
    );
  };

  return (
    <Modal open={open} onClose={onClose} title={agent ? "Edit agent" : "New agent"} wide>
      <form className="space-y-4" onSubmit={submit}>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="ag-name">Name</Label>
            <Input id="ag-name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={100} placeholder="e.g. Asha, our assistant" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ag-model">Model ({info.label})</Label>
            <select
              id="ag-model"
              className="h-9 w-full rounded-md border bg-card px-3 text-sm"
              value={customModel ? "__custom" : model}
              onChange={(e) => {
                if (e.target.value === "__custom") {
                  setCustomModel(true);
                } else {
                  setCustomModel(false);
                  setModel(e.target.value);
                }
              }}
            >
              {info.models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
              <option value="__custom">Other model (type its name)</option>
            </select>
            {customModel && (
              <Input aria-label="Model name" className="mt-2" value={model} onChange={(e) => setModel(e.target.value)} placeholder={info.defaultModel} required maxLength={100} />
            )}
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ag-instructions">What should this agent do?</Label>
          <Textarea
            id="ag-instructions"
            rows={8}
            required
            minLength={10}
            maxLength={8000}
            placeholder="You answer questions about our shop: products, prices, delivery and opening hours. Be friendly and brief. If someone wants to place an order, ask for their name and city and pass them to the team."
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">Add facts like prices and hours under Knowledge after saving. The agent only answers from what you give it.</p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ag-handover">Message sent when the agent hands over to your team</Label>
          <Input id="ag-handover" value={handover} onChange={(e) => setHandover(e.target.value)} required maxLength={500} />
        </div>
        <div className="flex justify-end gap-2 border-t pt-4">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={save.isPending || !name.trim() || instructions.trim().length < 10}>
            {save.isPending ? "Saving…" : "Save agent"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function KnowledgeSection({ agent, isAdmin }: { agent: AiAgentDto; isAdmin: boolean }) {
  const save = useSaveKnowledge(agent.id);
  const remove = useDeleteKnowledge(agent.id);
  const [editing, setEditing] = useState<{ id?: string; title: string; content: string } | null>(null);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    save.mutate(
      { id: editing.id, body: { title: editing.title.trim(), content: editing.content.trim() } },
      {
        onSuccess: () => setEditing(null),
        onError: (err) => toast.error(errorText(err, "Could not save")),
      },
    );
  };

  return (
    <Section title="Knowledge" description="Facts the agent can use: prices, hours, policies, FAQs. One topic per entry.">
      {agent.knowledge.length === 0 && <p className="text-sm text-muted-foreground">Nothing yet.</p>}
      <ul className="space-y-2">
        {agent.knowledge.map((k: AiKnowledgeDto) => (
          <li key={k.id} className="rounded-lg border p-3">
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-medium">{k.title}</p>
              {isAdmin && (
                <span className="flex shrink-0">
                  <Button variant="ghost" size="icon" aria-label={`Edit ${k.title}`} onClick={() => setEditing({ id: k.id, title: k.title, content: k.content })}>
                    <Pencil />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Delete ${k.title}`}
                    onClick={() => {
                      if (confirm(`Delete "${k.title}"?`)) remove.mutate(k.id);
                    }}
                  >
                    <Trash2 className="text-destructive" />
                  </Button>
                </span>
              )}
            </div>
            <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-xs text-muted-foreground">{k.content}</p>
          </li>
        ))}
      </ul>
      {isAdmin && (
        <Button variant="outline" size="sm" onClick={() => setEditing({ title: "", content: "" })}>
          <Plus /> Add knowledge
        </Button>
      )}
      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing?.id ? "Edit knowledge" : "Add knowledge"}>
        {editing && (
          <form className="space-y-4" onSubmit={submit}>
            <div className="space-y-1.5">
              <Label htmlFor="kn-title">Title</Label>
              <Input id="kn-title" value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} required maxLength={150} placeholder="e.g. Delivery charges" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="kn-content">Details</Label>
              <Textarea id="kn-content" rows={7} value={editing.content} onChange={(e) => setEditing({ ...editing, content: e.target.value })} required maxLength={6000} />
            </div>
            <Button type="submit" disabled={save.isPending || !editing.title.trim() || !editing.content.trim()}>
              {save.isPending ? "Saving…" : "Save"}
            </Button>
          </form>
        )}
      </Modal>
    </Section>
  );
}

function TestChat({ agent, hasKey }: { agent: AiAgentDto; hasKey: boolean }) {
  const test = useTestAiAgent(agent.id);
  const [thread, setThread] = useState<{ role: "user" | "assistant"; text: string; note?: string }[]>([]);
  const [draft, setDraft] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = endRef.current?.parentElement;
    if (el) el.scrollTop = el.scrollHeight;
  }, [thread.length]);

  const send = (e: FormEvent) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text || test.isPending) return;
    const next = [...thread, { role: "user" as const, text }];
    setThread(next);
    setDraft("");
    test.mutate(
      next.map(({ role, text: t }) => ({ role, text: t })),
      {
        onSuccess: (reply) =>
          setThread((t) => [...t, { role: "assistant", text: reply.text || "(no reply)", ...(reply.handedOver ? { note: "The agent handed this chat to your team." } : {}) }]),
        onError: (err) => toast.error(errorText(err, "The test failed")),
      },
    );
  };

  return (
    <Section title="Try it" description="Chat with the agent as a customer would. Nothing is sent to WhatsApp.">
      <div className="h-64 space-y-2 overflow-y-auto rounded-lg bg-chat-bg p-3">
        {thread.length === 0 && <p className="text-center text-xs text-muted-foreground">Ask something a customer might ask.</p>}
        {thread.map((m, i) => (
          <div key={i} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
            <div className={cn("max-w-[80%] rounded-lg px-3 py-1.5 text-sm shadow-sm", m.role === "user" ? "bg-bubble-out" : "bg-card")}>
              <p className="whitespace-pre-wrap">{m.text}</p>
              {m.note && <p className="mt-1 text-[11px] font-medium text-primary">{m.note}</p>}
            </div>
          </div>
        ))}
        {test.isPending && <p className="text-xs text-muted-foreground">Thinking…</p>}
        <div ref={endRef} />
      </div>
      <form className="flex gap-2" onSubmit={send}>
        <Input aria-label="Test message" placeholder={hasKey ? "Type a customer message" : "Add your API key to test"} value={draft} onChange={(e) => setDraft(e.target.value)} disabled={!hasKey} maxLength={2000} />
        <Button type="submit" size="icon" aria-label="Send test message" disabled={!hasKey || !draft.trim() || test.isPending}>
          <Send />
        </Button>
        {thread.length > 0 && (
          <Button type="button" variant="outline" onClick={() => setThread([])}>
            Clear
          </Button>
        )}
      </form>
    </Section>
  );
}
