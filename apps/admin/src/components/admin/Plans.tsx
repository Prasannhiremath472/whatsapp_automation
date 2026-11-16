import { useState } from "react";
import { Check, Pencil } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useCollection, type Row } from "@/lib/admin/store";
import { db, audit } from "@/services/admin";
import { compact, inr } from "@/lib/admin/format";
import { ResourcePage } from "@/components/admin-ui/ResourcePage";
import { FormDrawer } from "@/components/admin-ui/forms";
import { MODULES } from "@/lib/admin/modules";
import { useCan } from "@/components/admin-layout/useCan";
import { cn } from "@/lib/utils";

const FIELDS = [
  { key: "description", label: "Description", type: "textarea" as const },
  { key: "monthly", label: "Monthly price (₹)", type: "number" as const, required: true, half: true },
  { key: "annual", label: "Annual price (₹)", type: "number" as const, required: true, half: true },
  { key: "trial", label: "Trial period (days)", type: "number" as const, half: true },
  { key: "staff", label: "Maximum staff", type: "number" as const, half: true },
  { key: "numbers", label: "Max WhatsApp numbers", type: "number" as const, half: true },
  { key: "messages", label: "Monthly message quota", type: "number" as const, half: true },
  { key: "tokens", label: "AI token quota", type: "number" as const, half: true },
  { key: "contacts", label: "Contact quota", type: "number" as const, half: true },
  { key: "storage", label: "Storage (GB)", type: "number" as const, half: true },
  { key: "automations", label: "Automation allowance", type: "number" as const, half: true },
];

export function Plans() {
  const plans = useCollection(db.plans);
  const biz = useCollection(db.businesses);
  const canManage = useCan("subscriptions", "manage");
  const [edit, setEdit] = useState<Row | null>(null);

  const cards = (
    <div className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {plans.map((p) => (
        <div key={p.id} className={cn("rounded-lg border bg-card p-5 shadow-card", p.id === "Growth" && "border-primary ring-1 ring-primary")}>
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-bold">{p.name}</p>
              <p className="mt-1 text-xs text-muted-foreground">{p.description}</p>
            </div>
            {canManage && <Button variant="ghost" size="icon" aria-label={`Edit ${p.name}`} onClick={() => setEdit(p)}><Pencil /></Button>}
          </div>
          <p className="mt-4 text-2xl font-bold">{inr(p.monthly)}<span className="text-xs font-normal text-muted-foreground"> /mo</span></p>
          <p className="text-xs text-muted-foreground">{inr(p.annual)} billed annually · {p.trial ? `${p.trial}-day trial` : "no trial"}</p>
          <dl className="mt-4 grid grid-cols-2 gap-y-1 text-xs">
            <dt className="text-muted-foreground">Staff</dt><dd className="text-right font-medium">{p.staff >= 999 ? "Unlimited" : p.staff}</dd>
            <dt className="text-muted-foreground">Messages</dt><dd className="text-right font-medium">{compact(p.messages)}</dd>
            <dt className="text-muted-foreground">AI tokens</dt><dd className="text-right font-medium">{compact(p.tokens)}</dd>
            <dt className="text-muted-foreground">Contacts</dt><dd className="text-right font-medium">{compact(p.contacts)}</dd>
          </dl>
          <ul className="mt-4 space-y-1 border-t pt-3">
            {p.features.map((f: string) => <li key={f} className="flex items-center gap-2 text-xs"><Check className="size-3.5 text-primary" />{f}</li>)}
          </ul>
          <p className="mt-4 text-xs text-muted-foreground">{biz.filter((b) => b.plan === p.id).length} businesses on this plan</p>
        </div>
      ))}
    </div>
  );

  return (
    <>
      <ResourcePage config={{ ...MODULES.subscriptions, title: "Plans & Subscriptions", description: "Plan catalogue and every business subscription.", top: () => cards }} />
      <FormDrawer
        open={!!edit}
        onOpenChange={(o) => !o && setEdit(null)}
        title={`Edit ${edit?.name} plan`}
        fields={FIELDS}
        initial={edit ?? undefined}
        onSubmit={(v) => {
          const patch = Object.fromEntries(FIELDS.map((f) => [f.key, f.type === "number" ? Number(v[f.key]) : v[f.key]]));
          db.plans.update(edit!.id, patch);
          audit("Plan updated", "Plan", edit!.id, inr(edit!.monthly), inr(Number(v.monthly)));
          toast.success("Plan updated");
        }}
      />
    </>
  );
}
