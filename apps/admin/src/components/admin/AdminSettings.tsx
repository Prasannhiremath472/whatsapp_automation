import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { PageHeader, Panel } from "@/components/admin-ui/primitives";
import { FieldInput, validate, type Field } from "@/components/admin-ui/forms";
import { useCollection, resetAllDemoData } from "@/lib/admin/store";
import { db, audit } from "@/services/admin";
import { ALL_GROUPS, DEFAULT_MATRIX, ROLE_LABEL, type Role } from "@/lib/permissions/roles";
import { useSession, sessionStore } from "@/lib/admin/session";
import { cn } from "@/lib/utils";

export function RolesMatrix() {
  const [matrix, setMatrix] = useState(DEFAULT_MATRIX);
  const roles = Object.keys(ROLE_LABEL) as Role[];
  const cycle = (r: Role, g: (typeof ALL_GROUPS)[number]) => {
    if (r === "super_admin") { toast.error("Super Admin always has full access"); return; }
    const order = ["none", "view", "manage"] as const;
    const next = order[(order.indexOf(matrix[r][g]) + 1) % 3];
    setMatrix((m) => ({ ...m, [r]: { ...m[r], [g]: next } }));
    audit("Permission change", "Role", r, matrix[r][g], `${g}: ${next}`);
  };
  return (
    <div>
      <PageHeader title="Roles & Permissions" description="Least-privilege defaults. Click a cell to cycle none → view → manage. UI simulation only — enforce server-side in production." />
      <Panel>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground"><th className="py-2 pr-4">Permission group</th>{roles.map((r) => <th key={r} className="px-3 py-2 text-center">{ROLE_LABEL[r]}</th>)}</tr></thead>
            <tbody>
              {ALL_GROUPS.map((g) => (
                <tr key={g} className="border-b last:border-0">
                  <td className="py-2.5 pr-4 font-medium capitalize">{g}</td>
                  {roles.map((r) => (
                    <td key={r} className="px-3 py-2 text-center">
                      <button
                        onClick={() => cycle(r, g)}
                        className={cn("w-20 rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset", matrix[r][g] === "manage" ? "bg-success/10 text-success ring-success/20" : matrix[r][g] === "view" ? "bg-info/10 text-info ring-info/20" : "bg-muted text-muted-foreground ring-border")}
                      >
                        {matrix[r][g]}
                      </button>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}

const SECTIONS: { title: string; fields: Field[] }[] = [
  { title: "Platform identity & branding", fields: [{ key: "platformName", label: "Platform name", required: true, half: true }, { key: "supportEmail", label: "Support email", type: "email", required: true, half: true }, { key: "primaryColor", label: "Brand colour", half: true }] },
  { title: "Currency & timezone", fields: [{ key: "currency", label: "Currency", type: "select", options: ["INR", "USD", "AED", "EUR"], half: true }, { key: "timezone", label: "Timezone", type: "select", options: ["Asia/Kolkata", "Asia/Dubai", "Europe/London", "America/New_York"], half: true }] },
  { title: "Email configuration", fields: [{ key: "emailFrom", label: "From address", required: true }] },
  { title: "WhatsApp & AI", fields: [{ key: "waApiVersion", label: "Graph API version", half: true }, { key: "defaultAiProvider", label: "Default AI provider", type: "select", options: ["OpenAI", "Anthropic", "Google Gemini"], half: true }] },
  { title: "Billing & tax", fields: [{ key: "invoicePrefix", label: "Invoice prefix", half: true }, { key: "gstRate", label: "GST rate (%)", type: "number", half: true }] },
  { title: "Notifications", fields: [{ key: "notifyEmail", label: "Email alerts for incidents", type: "switch" }, { key: "notifySlack", label: "Slack alerts (connect later)", type: "switch" }] },
  { title: "Feature flags", fields: [{ key: "flagAiMemory", label: "AI Agent memory", type: "switch" }, { key: "flagFlowsV2", label: "Flow builder v2", type: "switch" }] },
  { title: "Maintenance & usage policy", fields: [{ key: "maintenance", label: "Maintenance mode", type: "switch" }, { key: "maxMsgPerMin", label: "Max messages / minute / business", type: "number" }, { key: "fairUse", label: "Fair-use policy", type: "textarea" }] },
];

export function GlobalSettings() {
  const settings = useCollection(db.settings)[0];
  const [v, setV] = useState<Record<string, any>>(settings);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const all = SECTIONS.flatMap((s) => s.fields);
  const save = () => {
    const e = validate(all, v);
    setErrors(e);
    if (Object.keys(e).length) { toast.error("Fix the highlighted fields"); return; }
    const changed = all.filter((f) => v[f.key] !== settings[f.key]).map((f) => f.label);
    db.settings.update("global", v);
    audit("Configuration change", "Settings", "global", "—", changed.join(", ") || "No changes");
    toast.success("Settings saved locally");
  };
  return (
    <div>
      <PageHeader title="Global Settings" description="Platform-wide configuration (saved locally in demo mode)." actions={<Button size="sm" onClick={save}>Save changes</Button>} />
      <div className="grid gap-4 lg:grid-cols-2">
        {SECTIONS.map((s) => (
          <Panel key={s.title} title={s.title}>
            <div className="grid grid-cols-2 gap-4">
              {s.fields.map((f) => <FieldInput key={f.key} f={f} value={v[f.key]} error={errors[f.key]} onChange={(x) => setV((p) => ({ ...p, [f.key]: x }))} />)}
            </div>
          </Panel>
        ))}
        <Panel title="Demo data">
          <p className="mb-3 text-sm text-muted-foreground">Restore all seeded demo records. Your local changes will be lost.</p>
          <Button variant="outline" onClick={() => { resetAllDemoData(); toast.success("Demo data reset"); }}>Reset demo data</Button>
        </Panel>
      </div>
    </div>
  );
}

export function AccountSettings() {
  const s = useSession()!;
  const [mfa, setMfa] = useState(true);
  const [name, setName] = useState(s.name);
  return (
    <div>
      <PageHeader title="Account settings" description="Your profile and security preferences." />
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Profile">
          <div className="space-y-3">
            <div><Label htmlFor="acc-name" className="mb-1.5 block text-xs">Full name</Label><Input id="acc-name" value={name} onChange={(e) => setName(e.target.value)} /></div>
            <div><Label htmlFor="acc-email" className="mb-1.5 block text-xs">Email</Label><Input id="acc-email" value={s.email} disabled /></div>
            <Button size="sm" disabled={!name.trim()} onClick={() => { sessionStore.signIn({ ...s, name: name.trim() }, true); toast.success("Profile updated"); }}>Save</Button>
          </div>
        </Panel>
        <Panel title="Security">
          <div className="flex items-center justify-between rounded-md border p-3">
            <div><p className="text-sm font-medium">Two-factor authentication</p><p className="text-xs text-muted-foreground">UI preview — wire to real MFA with the backend.</p></div>
            <Switch checked={mfa} onCheckedChange={(c) => { setMfa(c); toast.success(c ? "MFA enabled (demo)" : "MFA disabled (demo)"); }} aria-label="Two-factor authentication" />
          </div>
        </Panel>
      </div>
    </div>
  );
}
