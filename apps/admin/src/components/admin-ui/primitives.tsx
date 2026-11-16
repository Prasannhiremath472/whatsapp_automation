import type { ReactNode } from "react";
import { ArrowDownRight, ArrowUpRight, Inbox, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { dateTime, initials } from "@/lib/admin/format";

const TONE: Record<string, string> = {
  success: "bg-success/10 text-success ring-success/20",
  warning: "bg-warning/15 text-foreground ring-warning/30",
  danger: "bg-destructive/10 text-destructive ring-destructive/20",
  info: "bg-info/10 text-info ring-info/20",
  neutral: "bg-muted text-muted-foreground ring-border",
};

const MAP: Record<string, keyof typeof TONE> = {};
const set = (tone: keyof typeof TONE, words: string[]) => words.forEach((w) => (MAP[w.toLowerCase()] = tone));
set("success", ["active", "connected", "healthy", "approved", "paid", "succeeded", "operational", "completed", "resolved", "published", "high", "configured", "enabled", "done", "completed onboarding", "yes"]);
set("warning", ["trial", "pending", "past due", "attention required", "under review", "waiting for client", "in review", "paused", "degraded", "medium", "near limit", "scheduled", "pending submission", "acknowledged", "warning", "in progress", "ready to launch", "verification pending", "information pending", "whatsapp setup pending"]);
set("danger", ["suspended", "expired", "failed", "rejected", "at risk", "disconnected", "error", "failing", "critical", "urgent", "refunded", "revoked", "blocked", "low", "disabled", "unpaid", "cancelled"]);
set("info", ["new", "submitted", "open", "new registration", "draft", "in progress"]);

export function StatusBadge({ value, className }: { value: string; className?: string }) {
  const tone = MAP[String(value).toLowerCase()] ?? "neutral";
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset", TONE[tone], className)}>
      <span className="size-1.5 rounded-full bg-current opacity-70" />
      {value}
    </span>
  );
}

export function DemoBadge() {
  return <span className="rounded border border-dashed border-warning px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Demo</span>;
}

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold text-foreground">{title}</h1>
          <DemoBadge />
        </div>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export interface Metric { label: string; value: string; change?: number; hint?: string; icon?: LucideIcon }

export function MetricCard({ label, value, change, hint, icon: Icon }: Metric) {
  const up = (change ?? 0) >= 0;
  return (
    <div className="rounded-lg border bg-card p-4 shadow-card">
      <div className="flex items-start justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        {Icon && <span className="rounded-md bg-accent p-1.5 text-accent-foreground"><Icon className="size-4" /></span>}
      </div>
      <p className="mt-2 text-2xl font-bold text-foreground">{value}</p>
      <div className="mt-1 flex items-center gap-2 text-xs">
        {change !== undefined && (
          <span className={cn("inline-flex items-center font-semibold", up ? "text-success" : "text-destructive")}>
            {up ? <ArrowUpRight className="size-3.5" /> : <ArrowDownRight className="size-3.5" />}
            {Math.abs(change)}%
          </span>
        )}
        {hint && <span className="text-muted-foreground">{hint}</span>}
      </div>
    </div>
  );
}

export function MetricGrid({ metrics }: { metrics: Metric[] }) {
  return <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6">{metrics.map((m) => <MetricCard key={m.label} {...m} />)}</div>;
}

export function Panel({ title, action, children, className }: { title?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-lg border bg-card shadow-card", className)}>
      {title && (
        <header className="flex items-center justify-between border-b px-4 py-3">
          <h2 className="text-sm font-semibold text-foreground">{title}</h2>
          {action}
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

export function EmptyState({ title = "Nothing here yet", text = "Try adjusting filters or search." }: { title?: string; text?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <Inbox className="size-8 text-muted-foreground" />
      <p className="mt-3 text-sm font-semibold text-foreground">{title}</p>
      <p className="text-xs text-muted-foreground">{text}</p>
    </div>
  );
}

export function Avatar({ name, className }: { name: string; className?: string }) {
  return <span className={cn("inline-flex size-8 shrink-0 items-center justify-center rounded-md bg-accent text-xs font-bold text-accent-foreground", className)}>{initials(name)}</span>;
}

export function ActivityTimeline({ items }: { items: { at: string; title: string; text?: string; by?: string }[] }) {
  if (!items.length) return <EmptyState title="No activity yet" text="Actions on this record will appear here." />;
  return (
    <ol className="relative space-y-4 border-l pl-5">
      {items.map((it, i) => (
        <li key={i} className="relative">
          <span className="absolute -left-[25px] top-1 size-2.5 rounded-full border-2 border-card bg-primary" />
          <p className="text-sm font-medium text-foreground">{it.title}</p>
          {it.text && <p className="text-xs text-muted-foreground">{it.text}</p>}
          <p className="mt-0.5 text-[11px] text-muted-foreground">{it.by ? `${it.by} · ` : ""}{dateTime(it.at)}</p>
        </li>
      ))}
    </ol>
  );
}

export function UsageBar({ value }: { value: number }) {
  const tone = value > 90 ? "bg-destructive" : value > 70 ? "bg-warning" : "bg-primary";
  return (
    <div className="flex min-w-24 items-center gap-2">
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted"><div className={cn("h-full rounded-full", tone)} style={{ width: `${Math.min(100, value)}%` }} /></div>
      <span className="w-9 text-right text-xs tabular-nums text-muted-foreground">{value}%</span>
    </div>
  );
}
