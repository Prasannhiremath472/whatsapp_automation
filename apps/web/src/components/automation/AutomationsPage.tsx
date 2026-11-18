import { useEffect, useState, type FormEvent } from "react";
import { ArrowDown, ArrowUp, History, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { variableCount } from "@whatsapp-crm/shared-types";
import type {
  AutomationDto,
  AutomationStep,
  AutomationTrigger,
  SaveAutomationRequest,
} from "@whatsapp-crm/shared-types";
import {
  useAutomationRuns,
  useAutomations,
  useDeleteAutomation,
  useSaveAutomation,
  useSetAutomationStatus,
} from "@/api/automations";
import { useTeamUsers } from "@/api/account";
import { useApprovedTemplates } from "@/api/templates";
import { Empty, Modal, Status, Table } from "@/components/genie/ui";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/lib/api";
import { useSession } from "@/lib/auth";

const errorText = (err: unknown, fallback: string) => (err instanceof ApiError ? err.message : fallback);

const TRIGGER_LABEL: Record<AutomationTrigger, string> = {
  first_message: "A customer's first message",
  keyword: "A message contains a keyword",
  any_message: "Any message",
};

export function describeTrigger(a: Pick<AutomationDto, "triggerType" | "triggerConfig">): string {
  if (a.triggerType === "keyword") {
    const words = a.triggerConfig.keywords.join(", ");
    return a.triggerConfig.match === "equals" ? `Message is exactly: ${words}` : `Message contains: ${words}`;
  }
  return TRIGGER_LABEL[a.triggerType];
}

const STEP_LABEL: Record<AutomationStep["type"], string> = {
  send_text: "Send a message",
  send_template: "Send a template",
  add_tag: "Add a tag",
  assign: "Assign to a team member",
  set_status: "Set the chat status",
  wait: "Wait",
  handover_human: "Pause the AI agent for this chat",
};

export function describeStep(step: AutomationStep): string {
  switch (step.type) {
    case "send_text":
      return `Send: "${step.text.length > 40 ? `${step.text.slice(0, 40)}…` : step.text}"`;
    case "send_template":
      return "Send a template";
    case "add_tag":
      return `Add tag "${step.tag}"`;
    case "assign":
      return step.agentUserId ? "Assign to a team member" : "Unassign";
    case "set_status":
      return `Mark as ${step.status === "closed" ? "resolved" : step.status}`;
    case "wait":
      return step.minutes % 1440 === 0 ? `Wait ${step.minutes / 1440} day(s)` : step.minutes % 60 === 0 ? `Wait ${step.minutes / 60} hour(s)` : `Wait ${step.minutes} minute(s)`;
    case "handover_human":
      return "Pause the AI agent for this chat";
  }
}

const blankStep = (type: AutomationStep["type"]): AutomationStep => {
  switch (type) {
    case "send_text":
      return { type, text: "" };
    case "send_template":
      return { type, templateId: "", bodyVars: [] };
    case "add_tag":
      return { type, tag: "" };
    case "assign":
      return { type, agentUserId: null };
    case "set_status":
      return { type, status: "pending" };
    case "wait":
      return { type, minutes: 60 };
    case "handover_human":
      return { type };
  }
};

interface Draft {
  name: string;
  description: string;
  triggerType: AutomationTrigger;
  keywords: string;
  match: "contains" | "equals";
  cooldownMinutes: number;
  steps: AutomationStep[];
}

const emptyDraft: Draft = {
  name: "",
  description: "",
  triggerType: "keyword",
  keywords: "",
  match: "contains",
  cooldownMinutes: 60,
  steps: [{ type: "send_text", text: "" }],
};

const fromDto = (a: AutomationDto): Draft => ({
  name: a.name,
  description: a.description ?? "",
  triggerType: a.triggerType,
  keywords: a.triggerConfig.keywords.join(", "),
  match: a.triggerConfig.match,
  cooldownMinutes: a.cooldownMinutes,
  steps: a.steps,
});

const toRequest = (d: Draft): SaveAutomationRequest => ({
  name: d.name.trim(),
  ...(d.description.trim() ? { description: d.description.trim() } : {}),
  triggerType: d.triggerType,
  triggerConfig: {
    keywords: d.keywords.split(",").map((k) => k.trim()).filter(Boolean),
    match: d.match,
  },
  steps: d.steps,
  cooldownMinutes: d.cooldownMinutes,
});

export function AutomationsPage() {
  const { user } = useSession();
  const isAdmin = user.role === "tenant_admin";
  const query = useAutomations();
  const automations = query.data ?? [];
  const setStatus = useSetAutomationStatus();
  const remove = useDeleteAutomation();

  const [editing, setEditing] = useState<{ id?: string; draft: Draft } | null>(null);
  const [runsFor, setRunsFor] = useState<AutomationDto | null>(null);

  const toggle = (a: AutomationDto, on: boolean) =>
    setStatus.mutate(
      { id: a.id, status: on ? "active" : "paused" },
      { onError: (err) => toast.error(errorText(err, "Could not change the automation")) },
    );

  return (
    <div className="space-y-5">
      <PageHeader
        title="Automations"
        subtitle="Reply, tag and route customers automatically."
        actions={
          isAdmin && (
            <Button onClick={() => setEditing({ draft: emptyDraft })}>
              <Plus />
              New automation
            </Button>
          )
        }
      />

      <p className="max-w-3xl rounded-lg border bg-card p-3 text-xs text-muted-foreground">
        When a customer messages you, Genie runs the <strong>first matching</strong> automation: keyword rules first, then
        "first message", then "any message". If none match, your AI agent answers (if you turned one on). Customers who opted out are never
        messaged, and the same automation will not repeat in a chat within its cooldown.
      </p>

      {query.isError && (
        <p role="alert" className="text-sm text-destructive">
          Could not load your automations.
        </p>
      )}
      {query.isSuccess && automations.length === 0 && (
        <Empty
          title="No automations yet"
          action={
            isAdmin ? (
              <Button variant="outline" onClick={() => setEditing({ draft: emptyDraft })}>
                Create your first automation
              </Button>
            ) : undefined
          }
        />
      )}

      <div className="grid gap-3 lg:grid-cols-2">
        {automations.map((a) => (
          <article key={a.id} className="space-y-3 rounded-xl border bg-card p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="truncate font-semibold">{a.name}</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">{describeTrigger(a)}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Status>{a.status === "active" ? "Active" : a.status === "paused" ? "Paused" : "Draft"}</Status>
                {isAdmin && (
                  <Switch
                    aria-label={`${a.name} is on`}
                    checked={a.status === "active"}
                    disabled={setStatus.isPending}
                    onCheckedChange={(on) => toggle(a, on)}
                  />
                )}
              </div>
            </div>
            <ol className="space-y-1 text-xs text-muted-foreground">
              {a.steps.map((s, i) => (
                <li key={i} className="flex gap-2">
                  <span className="w-4 shrink-0 text-right">{i + 1}.</span>
                  <span className="min-w-0 truncate">{describeStep(s)}</span>
                </li>
              ))}
            </ol>
            <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3 text-xs text-muted-foreground">
              <span>
                {a.runCount.toLocaleString()} run{a.runCount === 1 ? "" : "s"}
                {a.lastRunAt ? ` · last ${new Date(a.lastRunAt).toLocaleDateString([], { day: "numeric", month: "short" })}` : ""}
              </span>
              <span className="flex gap-1">
                <Button variant="ghost" size="sm" onClick={() => setRunsFor(a)}>
                  <History /> Runs
                </Button>
                {isAdmin && (
                  <>
                    <Button variant="ghost" size="sm" onClick={() => setEditing({ id: a.id, draft: fromDto(a) })}>
                      <Pencil /> Edit
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Delete ${a.name}`}
                      onClick={() => {
                        if (!confirm(`Delete "${a.name}"? Its run history is deleted too.`)) return;
                        remove.mutate(a.id, {
                          onSuccess: () => toast.success("Automation deleted"),
                          onError: (err) => toast.error(errorText(err, "Could not delete it")),
                        });
                      }}
                    >
                      <Trash2 className="text-destructive" />
                    </Button>
                  </>
                )}
              </span>
            </div>
          </article>
        ))}
      </div>

      <AutomationEditor editing={editing} onClose={() => setEditing(null)} />
      <RunsDialog automation={runsFor} onClose={() => setRunsFor(null)} />
    </div>
  );
}

function RunsDialog({ automation, onClose }: { automation: AutomationDto | null; onClose: () => void }) {
  const runs = useAutomationRuns(automation?.id ?? null);
  return (
    <Modal open={!!automation} onClose={onClose} title={automation ? `Runs of "${automation.name}"` : "Runs"} wide description="The latest 30 times this automation ran.">
      {runs.isPending && <p className="text-sm text-muted-foreground">Loading…</p>}
      {runs.isSuccess && runs.data.length === 0 && <p className="text-sm text-muted-foreground">It has not run yet.</p>}
      {runs.isSuccess && runs.data.length > 0 && (
        <Table headers={["When", "Customer", "Result"]}>
          {runs.data.map((r) => (
            <tr key={r.id}>
              <td className="whitespace-nowrap text-xs">{new Date(r.createdAt).toLocaleString([], { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</td>
              <td>{r.contactName}</td>
              <td>
                <Status>{r.status === "completed" ? "Completed" : r.status === "waiting" ? "Pending: waiting" : r.status === "failed" ? "Failed" : "Running"}</Status>
                {r.error && <p className="mt-1 text-xs text-destructive">{r.error}</p>}
              </td>
            </tr>
          ))}
        </Table>
      )}
    </Modal>
  );
}

function AutomationEditor({ editing, onClose }: { editing: { id?: string; draft: Draft } | null; onClose: () => void }) {
  const save = useSaveAutomation();
  const templates = useApprovedTemplates().data ?? [];
  const members = (useTeamUsers().data ?? []).filter((u) => u.isActive);
  const [draft, setDraft] = useState<Draft>(emptyDraft);

  useEffect(() => {
    if (editing) setDraft(editing.draft);
  }, [editing]);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const setStep = (i: number, step: AutomationStep) => set("steps", draft.steps.map((s, j) => (j === i ? step : s)));
  const move = (i: number, by: -1 | 1) => {
    const next = [...draft.steps];
    const target = i + by;
    if (target < 0 || target >= next.length) return;
    [next[i], next[target]] = [next[target]!, next[i]!];
    set("steps", next);
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    save.mutate(
      { id: editing?.id, body: toRequest(draft) },
      {
        onSuccess: () => {
          toast.success(editing?.id ? "Automation saved" : "Automation created. Turn it on when you are ready.");
          onClose();
        },
        onError: (err) => toast.error(errorText(err, "Could not save the automation")),
      },
    );
  };

  const lastIsWait = draft.steps[draft.steps.length - 1]?.type === "wait";

  return (
    <Modal open={!!editing} onClose={onClose} title={editing?.id ? "Edit automation" : "New automation"} wide>
      <form className="space-y-5" onSubmit={submit}>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="au-name">Name</Label>
            <Input id="au-name" value={draft.name} onChange={(e) => set("name", e.target.value)} required maxLength={100} placeholder="e.g. Pricing questions" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="au-cooldown">Do not repeat in the same chat for (minutes)</Label>
            <Input id="au-cooldown" type="number" min={0} value={draft.cooldownMinutes} onChange={(e) => set("cooldownMinutes", Math.max(0, Number(e.target.value) || 0))} />
          </div>
        </div>

        <fieldset className="space-y-3 rounded-lg border p-3">
          <legend className="px-1 text-xs font-semibold text-muted-foreground">WHEN</legend>
          <div className="space-y-1.5">
            <Label htmlFor="au-trigger">Run this automation when</Label>
            <select id="au-trigger" className="h-9 w-full rounded-md border bg-card px-3 text-sm" value={draft.triggerType} onChange={(e) => set("triggerType", e.target.value as AutomationTrigger)}>
              {(Object.keys(TRIGGER_LABEL) as AutomationTrigger[]).map((t) => (
                <option key={t} value={t}>
                  {TRIGGER_LABEL[t]}
                </option>
              ))}
            </select>
          </div>
          {draft.triggerType === "keyword" && (
            <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
              <div className="space-y-1.5">
                <Label htmlFor="au-keywords">Keywords (separate with commas)</Label>
                <Input id="au-keywords" value={draft.keywords} onChange={(e) => set("keywords", e.target.value)} placeholder="price, cost, rate" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="au-match">Match</Label>
                <select id="au-match" className="h-9 w-full rounded-md border bg-card px-3 text-sm" value={draft.match} onChange={(e) => set("match", e.target.value as "contains" | "equals")}>
                  <option value="contains">Message contains the word</option>
                  <option value="equals">Message is exactly</option>
                </select>
              </div>
            </div>
          )}
        </fieldset>

        <fieldset className="space-y-3 rounded-lg border p-3">
          <legend className="px-1 text-xs font-semibold text-muted-foreground">THEN</legend>
          {draft.steps.map((step, i) => (
            <div key={i} className="space-y-2 rounded-lg bg-muted/40 p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold">
                  {i + 1}. {STEP_LABEL[step.type]}
                </span>
                <span className="flex gap-0.5">
                  <Button type="button" variant="ghost" size="icon" aria-label={`Move step ${i + 1} up`} disabled={i === 0} onClick={() => move(i, -1)}>
                    <ArrowUp />
                  </Button>
                  <Button type="button" variant="ghost" size="icon" aria-label={`Move step ${i + 1} down`} disabled={i === draft.steps.length - 1} onClick={() => move(i, 1)}>
                    <ArrowDown />
                  </Button>
                  <Button type="button" variant="ghost" size="icon" aria-label={`Remove step ${i + 1}`} disabled={draft.steps.length === 1} onClick={() => set("steps", draft.steps.filter((_, j) => j !== i))}>
                    <Trash2 className="text-destructive" />
                  </Button>
                </span>
              </div>
              <StepFields step={step} onChange={(s) => setStep(i, s)} templates={templates} members={members} />
            </div>
          ))}
          {lastIsWait && <p role="alert" className="text-xs text-destructive">A wait cannot be the last step. Add something after it.</p>}
          <div className="flex flex-wrap gap-2">
            {(Object.keys(STEP_LABEL) as AutomationStep["type"][]).map((t) => (
              <Button key={t} type="button" variant="outline" size="sm" onClick={() => set("steps", [...draft.steps, blankStep(t)])}>
                <Plus /> {STEP_LABEL[t]}
              </Button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            In messages you can use {"{{first_name}}"}, {"{{name}}"} and {"{{phone}}"}. Free-text messages only work within 24 hours of the customer's last message; after a wait, use a template.
          </p>
        </fieldset>

        <div className="flex justify-end gap-2 border-t pt-4">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={save.isPending || lastIsWait || !draft.name.trim()}>
            {save.isPending ? "Saving…" : "Save automation"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function StepFields({
  step,
  onChange,
  templates,
  members,
}: {
  step: AutomationStep;
  onChange: (s: AutomationStep) => void;
  templates: { id: string; name: string; language: string; body: string }[];
  members: { id: string; displayName: string }[];
}) {
  switch (step.type) {
    case "send_text":
      return (
        <Textarea aria-label="Message text" rows={3} maxLength={1024} placeholder="Hi {{first_name}}, thanks for your message…" value={step.text} onChange={(e) => onChange({ ...step, text: e.target.value })} />
      );
    case "send_template": {
      const template = templates.find((t) => t.id === step.templateId);
      const count = template ? variableCount(template.body) : 0;
      return (
        <div className="space-y-2">
          <select
            aria-label="Template"
            className="h-9 w-full rounded-md border bg-card px-3 text-sm"
            value={step.templateId}
            onChange={(e) => {
              const t = templates.find((x) => x.id === e.target.value);
              onChange({ ...step, templateId: e.target.value, bodyVars: Array.from({ length: t ? variableCount(t.body) : 0 }, () => "") });
            }}
          >
            <option value="">Choose an approved template</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} ({t.language})
              </option>
            ))}
          </select>
          {template && <p className="text-xs text-muted-foreground">{template.body}</p>}
          {Array.from({ length: count }, (_, i) => (
            <Input
              key={i}
              aria-label={`Value for {{${i + 1}}}`}
              placeholder={`Value for {{${i + 1}}}, e.g. {{first_name}}`}
              value={step.bodyVars[i] ?? ""}
              onChange={(e) => onChange({ ...step, bodyVars: Array.from({ length: count }, (_, j) => (j === i ? e.target.value : step.bodyVars[j] ?? "")) })}
            />
          ))}
        </div>
      );
    }
    case "add_tag":
      return <Input aria-label="Tag" placeholder="e.g. interested" value={step.tag} maxLength={50} onChange={(e) => onChange({ ...step, tag: e.target.value })} />;
    case "assign":
      return (
        <select aria-label="Team member" className="h-9 w-full rounded-md border bg-card px-3 text-sm" value={step.agentUserId ?? ""} onChange={(e) => onChange({ ...step, agentUserId: e.target.value || null })}>
          <option value="">Unassigned</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.displayName}
            </option>
          ))}
        </select>
      );
    case "set_status":
      return (
        <select aria-label="Status" className="h-9 w-full rounded-md border bg-card px-3 text-sm" value={step.status} onChange={(e) => onChange({ ...step, status: e.target.value as "open" | "pending" | "closed" })}>
          <option value="open">Open</option>
          <option value="pending">Pending (needs a person)</option>
          <option value="closed">Resolved</option>
        </select>
      );
    case "wait": {
      const unit = step.minutes % 1440 === 0 ? 1440 : step.minutes % 60 === 0 ? 60 : 1;
      return (
        <div className="flex gap-2">
          <Input aria-label="Wait amount" type="number" min={1} className="w-28" value={step.minutes / unit} onChange={(e) => onChange({ ...step, minutes: Math.max(1, Number(e.target.value) || 1) * unit })} />
          <select aria-label="Wait unit" className="h-9 rounded-md border bg-card px-3 text-sm" value={unit} onChange={(e) => onChange({ ...step, minutes: (step.minutes / unit) * Number(e.target.value) })}>
            <option value={1}>minutes</option>
            <option value={60}>hours</option>
            <option value={1440}>days</option>
          </select>
        </div>
      );
    }
    case "handover_human":
      return <p className="text-xs text-muted-foreground">The AI agent stops answering this chat, so a team member takes over.</p>;
  }
}
