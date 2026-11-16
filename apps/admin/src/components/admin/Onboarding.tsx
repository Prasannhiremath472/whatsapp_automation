import { useMemo, useState } from "react";
import { Kanban, List, Plus, Search, UserPlus, Clock, ShieldCheck, MessageCircle, Rocket, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useCollection, type Row } from "@/lib/admin/store";
import { db, OnboardingService, addNote, audit } from "@/services/admin";
import { MANAGERS, ONBOARDING_STAGES, PLANS } from "@/lib/demo-data/seed";
import { date, dateTime } from "@/lib/admin/format";
import { ActivityTimeline, Avatar, MetricGrid, PageHeader, StatusBadge } from "@/components/admin-ui/primitives";
import { FieldInput, validate, type Field } from "@/components/admin-ui/forms";
import { useCan } from "@/components/admin-layout/useCan";
import { cn } from "@/lib/utils";

const pct = (o: Row) => Math.round((o.checklist.filter((c: any) => c.done).length / o.checklist.length) * 100);
const ICONS = [UserPlus, Clock, ShieldCheck, MessageCircle, Rocket, CheckCircle2];

const STEPS: { title: string; fields: Field[] }[] = [
  { title: "Business", fields: [
    { key: "name", label: "Business name", required: true }, { key: "industry", label: "Industry", type: "select", options: ["Retail", "Healthcare", "Education", "Food & Beverage", "Real Estate", "Fitness", "Hospitality", "E-commerce", "Logistics", "Travel", "Financial Services", "Beauty & Wellness", "Home Services"], required: true, half: true },
    { key: "website", label: "Website", half: true, placeholder: "https://" }, { key: "address", label: "Business address" }, { key: "description", label: "Business description", type: "textarea" },
  ] },
  { title: "Owner", fields: [
    { key: "owner", label: "Owner name", required: true }, { key: "email", label: "Email", type: "email", required: true, half: true }, { key: "phone", label: "Phone", required: true, half: true },
    { key: "designation", label: "Designation", half: true }, { key: "contactPref", label: "Contact preference", type: "select", options: ["WhatsApp", "Email", "Phone"], half: true },
  ] },
  { title: "Subscription", fields: [
    { key: "plan", label: "Plan", type: "select", options: [...PLANS], required: true, half: true }, { key: "cycle", label: "Billing", type: "select", options: ["Monthly", "Annual"], required: true, half: true, default: "Monthly" },
    { key: "trial", label: "Trial duration (days)", type: "number", half: true, default: 14 }, { key: "price", label: "Custom price (₹, optional)", type: "number", half: true },
    { key: "messages", label: "Message allowance", type: "number", half: true }, { key: "tokens", label: "AI token allowance", type: "number", half: true }, { key: "start", label: "Start date", type: "date" },
  ] },
  { title: "WhatsApp", fields: [
    { key: "metaId", label: "Meta Business Account ID", half: true }, { key: "waba", label: "WABA ID", half: true }, { key: "phoneId", label: "Phone Number ID" },
    { key: "waNotes", label: "Setup notes", type: "textarea" },
  ] },
  { title: "Team & config", fields: [
    { key: "manager", label: "Account manager", type: "select", options: MANAGERS, required: true, half: true }, { key: "team", label: "Team size", type: "number", half: true },
    { key: "features", label: "Required features" }, { key: "notes", label: "Initial configuration notes", type: "textarea" },
  ] },
];

function Wizard({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [step, setStep] = useState(0);
  const [v, setV] = useState<Record<string, any>>({ cycle: "Monthly", trial: 14 });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const review = step === STEPS.length;
  const next = () => {
    const e = validate(STEPS[step].fields, v);
    setErrors(e);
    if (!Object.keys(e).length) setStep((s) => s + 1);
  };
  const close = (o: boolean) => { onOpenChange(o); if (!o) { setStep(0); setV({ cycle: "Monthly", trial: 14 }); setErrors({}); } };
  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Onboard a new business</DialogTitle>
          <DialogDescription>Creates a demo business record and initialises its onboarding checklist.</DialogDescription>
        </DialogHeader>
        <ol className="flex gap-1">
          {[...STEPS.map((s) => s.title), "Review"].map((t, i) => (
            <li key={t} className="flex-1">
              <div className={cn("h-1 rounded-full", i <= step ? "bg-primary" : "bg-muted")} />
              <p className={cn("mt-1 text-[11px]", i === step ? "font-semibold text-foreground" : "text-muted-foreground")}>{i + 1}. {t}</p>
            </li>
          ))}
        </ol>
        {!review ? (
          <div className="grid grid-cols-2 gap-4">
            {STEPS[step].fields.map((f) => <FieldInput key={f.key} f={f} value={v[f.key]} error={errors[f.key]} onChange={(x) => setV((s) => ({ ...s, [f.key]: x }))} />)}
          </div>
        ) : (
          <div className="space-y-3">
            {STEPS.map((s) => (
              <div key={s.title} className="rounded-md border p-3">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{s.title}</p>
                <dl className="grid grid-cols-2 gap-2 text-sm">
                  {s.fields.map((f) => <div key={f.key}><dt className="text-xs text-muted-foreground">{f.label}</dt><dd className="font-medium">{v[f.key] || "—"}</dd></div>)}
                </dl>
              </div>
            ))}
          </div>
        )}
        <div className="flex justify-between border-t pt-4">
          <Button variant="outline" disabled={step === 0} onClick={() => setStep((s) => s - 1)}>Back</Button>
          {review ? (
            <Button onClick={() => { const rec = OnboardingService.create(v); toast.success(`${rec.name} onboarded`, { description: "Added to Businesses and the onboarding board." }); close(false); }}>Create business</Button>
          ) : (
            <Button onClick={next}>Continue</Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Detail({ id, onClose }: { id: string | null; onClose: () => void }) {
  const o = useCollection(db.onboarding).find((x) => x.id === id);
  const auditRows = useCollection(db.audit);
  const canManage = useCan("onboarding", "manage");
  const [note, setNote] = useState("");
  return (
    <Sheet open={!!o} onOpenChange={(x) => !x && onClose()}>
      <SheetContent className="w-full overflow-y-auto p-0 sm:max-w-2xl">
        {o && (
          <>
            <SheetHeader className="border-b p-5">
              <div className="flex items-center gap-3">
                <Avatar name={o.name} className="size-11 text-sm" />
                <div>
                  <SheetTitle>{o.name}</SheetTitle>
                  <SheetDescription>{o.industry} · {o.owner} · registered {date(o.registeredAt)}</SheetDescription>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 pt-2">
                <StatusBadge value={o.stage} />
                <span className="text-xs text-muted-foreground">{pct(o)}% complete</span>
                {canManage && (
                  <Select value={o.stage} onValueChange={(s) => { OnboardingService.move(o.id, s); toast.success(`Moved to ${s}`); }}>
                    <SelectTrigger aria-label="Stage" className="ml-auto h-8 w-56"><SelectValue /></SelectTrigger>
                    <SelectContent>{ONBOARDING_STAGES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                  </Select>
                )}
              </div>
            </SheetHeader>
            <Tabs defaultValue="checklist" className="p-5">
              <TabsList className="flex-wrap">
                {["Overview", "Checklist", "Subscription", "WhatsApp", "Team", "Documents", "Notes", "Activity"].map((t) => <TabsTrigger key={t} value={t.toLowerCase()}>{t}</TabsTrigger>)}
              </TabsList>
              <TabsContent value="overview">
                <dl className="grid grid-cols-2 gap-3 pt-2 text-sm">
                  {[["Owner", o.owner], ["Email", o.email], ["Phone", o.phone], ["Industry", o.industry], ["Manager", o.manager], ["Plan", o.plan]].map(([k, val]) => <div key={k}><dt className="text-xs text-muted-foreground">{k}</dt><dd className="font-medium">{val}</dd></div>)}
                </dl>
              </TabsContent>
              <TabsContent value="checklist" className="space-y-2">
                {o.checklist.map((c: any, i: number) => (
                  <label key={c.task} className={cn("flex items-center gap-3 rounded-md border p-3 text-sm", c.done && "bg-accent/50")}>
                    <Checkbox checked={c.done} disabled={!canManage} onCheckedChange={() => OnboardingService.toggleTask(o.id, i)} />
                    <span className={cn("flex-1", c.done && "text-muted-foreground line-through")}>{c.task}</span>
                    <span className="text-xs text-muted-foreground">{c.owner} · due {date(c.due)}</span>
                  </label>
                ))}
              </TabsContent>
              <TabsContent value="subscription"><p className="pt-2 text-sm">Plan <b>{o.plan}</b>. Payment/trial confirmation is tracked in the checklist.</p></TabsContent>
              <TabsContent value="whatsapp"><p className="pt-2 text-sm text-muted-foreground">WABA connection status: <StatusBadge value={o.checklist[4].done ? "Connected" : "Pending"} />. Tokens are never shown here.</p></TabsContent>
              <TabsContent value="team">
                <div className="flex items-center gap-2 pt-2">
                  <span className="text-sm">Onboarding manager:</span>
                  <Select value={o.manager} disabled={!canManage} onValueChange={(m) => { db.onboarding.update(o.id, { manager: m }); audit("Manager assigned", "Onboarding", o.id, o.manager, m); toast.success("Manager assigned"); }}>
                    <SelectTrigger aria-label="Manager" className="w-48"><SelectValue /></SelectTrigger>
                    <SelectContent>{MANAGERS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </TabsContent>
              <TabsContent value="documents"><div className="mt-2 rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">GST certificate.pdf · Business PAN.pdf (demo placeholders). Uploads connect once storage is live.</div></TabsContent>
              <TabsContent value="notes" className="space-y-3">
                {canManage && <><Textarea aria-label="Internal note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add an internal note…" />
                <Button size="sm" disabled={!note.trim()} onClick={() => { addNote("onboarding", o.id, note.trim()); setNote(""); toast.success("Note added"); }}>Add note</Button></>}
                {(o.notes ?? []).map((n: any, i: number) => <div key={i} className="rounded-md border bg-muted/40 p-3 text-sm">{n.text}<p className="mt-1 text-[11px] text-muted-foreground">{n.by} · {dateTime(n.at)}</p></div>)}
              </TabsContent>
              <TabsContent value="activity"><div className="pt-2"><ActivityTimeline items={auditRows.filter((a) => a.resourceId === o.id).map((a) => ({ at: a.at, title: a.action, text: `${a.prev} → ${a.next}`, by: a.actor }))} /></div></TabsContent>
            </Tabs>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

export function Onboarding() {
  const rows = useCollection(db.onboarding);
  const canManage = useCan("onboarding", "manage");
  const [view, setView] = useState<"kanban" | "table">("kanban");
  const [q, setQ] = useState("");
  const [manager, setManager] = useState("__all");
  const [wizard, setWizard] = useState(false);
  const [detail, setDetail] = useState<string | null>(null);
  const [drag, setDrag] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);

  const filtered = useMemo(() => rows.filter((r) => (!q || `${r.name} ${r.owner}`.toLowerCase().includes(q.toLowerCase())) && (manager === "__all" || r.manager === manager)), [rows, q, manager]);

  return (
    <div>
      <PageHeader title="Onboarding" description="Move new businesses from registration to production launch." actions={canManage && <Button size="sm" onClick={() => setWizard(true)}><Plus /> Onboard business</Button>} />
      <MetricGrid metrics={ONBOARDING_STAGES.map((s, i) => ({ label: s, value: String(rows.filter((r) => r.stage === s).length), icon: ICONS[i] }))} />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-52 flex-1">
          <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
          <Input aria-label="Search onboarding" className="bg-card pl-8" placeholder="Search businesses or owners…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Select value={manager} onValueChange={setManager}>
          <SelectTrigger aria-label="Manager" className="w-48 bg-card"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="__all">All managers</SelectItem>{MANAGERS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
        </Select>
        <div className="flex rounded-md border bg-card p-0.5">
          <Button size="sm" variant={view === "kanban" ? "secondary" : "ghost"} onClick={() => setView("kanban")}><Kanban /> Kanban</Button>
          <Button size="sm" variant={view === "table" ? "secondary" : "ghost"} onClick={() => setView("table")}><List /> Table</Button>
        </div>
      </div>

      {view === "kanban" ? (
        <div className="flex gap-3 overflow-x-auto pb-4">
          {ONBOARDING_STAGES.map((stage) => {
            const items = filtered.filter((r) => r.stage === stage);
            return (
              <div
                key={stage}
                onDragOver={(e) => { if (canManage) { e.preventDefault(); setOver(stage); } }}
                onDragLeave={() => setOver(null)}
                onDrop={() => { if (drag) { OnboardingService.move(drag, stage); toast.success(`Moved to ${stage}`); } setDrag(null); setOver(null); }}
                className={cn("flex w-72 shrink-0 flex-col rounded-lg border bg-muted/50 p-2 transition-colors", over === stage && "border-primary bg-accent")}
              >
                <div className="mb-2 flex items-center justify-between px-1">
                  <p className="text-xs font-semibold text-foreground">{stage}</p>
                  <span className="rounded bg-card px-1.5 text-xs text-muted-foreground">{items.length}</span>
                </div>
                <div className="flex min-h-24 flex-col gap-2">
                  {items.map((o) => (
                    <button
                      key={o.id}
                      draggable={canManage}
                      onDragStart={() => setDrag(o.id)}
                      onClick={() => setDetail(o.id)}
                      className="rounded-md border bg-card p-3 text-left shadow-card transition hover:border-primary/40"
                    >
                      <div className="flex items-center gap-2">
                        <Avatar name={o.name} className="size-7 text-[10px]" />
                        <div className="min-w-0"><p className="truncate text-sm font-semibold">{o.name}</p><p className="truncate text-xs text-muted-foreground">{o.owner}</p></div>
                      </div>
                      <div className="mt-3 h-1.5 rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${pct(o)}%` }} /></div>
                      <div className="mt-2 flex justify-between text-[11px] text-muted-foreground">
                        <span>{o.manager}</span>
                        <span>{o.checklist.filter((c: any) => !c.done).length} tasks left</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-card shadow-card">
          <table className="w-full text-sm">
            <thead><tr className="border-b bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">{["Business", "Owner", "Contact", "Registered", "Manager", "Stage", "Completion", "Outstanding"].map((h) => <th key={h} className="px-4 py-2.5 font-medium">{h}</th>)}</tr></thead>
            <tbody>
              {filtered.map((o) => (
                <tr key={o.id} className="cursor-pointer border-b last:border-0 hover:bg-muted/40" onClick={() => setDetail(o.id)}>
                  <td className="px-4 py-3"><span className="flex items-center gap-2"><Avatar name={o.name} className="size-7 text-[10px]" /><b className="font-medium">{o.name}</b></span></td>
                  <td className="px-4 py-3">{o.owner}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{o.email}<br />{o.phone}</td>
                  <td className="px-4 py-3">{date(o.registeredAt)}</td>
                  <td className="px-4 py-3">{o.manager}</td>
                  <td className="px-4 py-3"><StatusBadge value={o.stage} /></td>
                  <td className="px-4 py-3">{pct(o)}%</td>
                  <td className="px-4 py-3">{o.checklist.filter((c: any) => !c.done).length}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Wizard open={wizard} onOpenChange={setWizard} />
      <Detail id={detail} onClose={() => setDetail(null)} />
    </div>
  );
}
