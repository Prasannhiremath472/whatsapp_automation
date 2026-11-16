import { useState } from "react";
import { Link } from "react-router-dom";
import { Building2, CheckCircle2, UserPlus, CreditCard, IndianRupee, Wallet, MessageCircle, Coins } from "lucide-react";
import { useCollection } from "@/lib/admin/store";
import { db } from "@/services/admin";
import { Chart, DAYS30, MONTHS, WEEKS, YEARS, series } from "@/components/admin-ui/charts";
import { ActivityTimeline, Avatar, MetricGrid, PageHeader, Panel, StatusBadge } from "@/components/admin-ui/primitives";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { compact, date, inr, num, relative } from "@/lib/admin/format";
import { PLANS } from "@/lib/demo-data/seed";

const PERIODS = {
  Daily: { labels: DAYS30, base: 9000, g: 120 },
  Weekly: { labels: WEEKS, base: 62000, g: 1800 },
  Monthly: { labels: MONTHS, base: 240000, g: 16000 },
  Yearly: { labels: YEARS, base: 900000, g: 900000 },
};

function ViewAll({ to }: { to: string }) {
  return <Link to={to} className="text-xs font-medium text-primary hover:underline">View all</Link>;
}

export function Dashboard() {
  const biz = useCollection(db.businesses);
  const onb = useCollection(db.onboarding);
  const subs = useCollection(db.subscriptions);
  const tx = useCollection(db.transactions);
  const req = useCollection(db.requests);
  const tickets = useCollection(db.tickets);
  const audit = useCollection(db.audit);
  const services = useCollection(db.services);
  const tokens = useCollection(db.tokens);
  const [period, setPeriod] = useState<keyof typeof PERIODS>("Monthly");
  const p = PERIODS[period];
  const mrr = biz.reduce((a, b) => a + (b.mrr || 0), 0);

  return (
    <div>
      <PageHeader title="Dashboard" description="The health of the entire Genie ecosystem at a glance." />
      <MetricGrid
        metrics={[
          { label: "Total Businesses", value: num(biz.length), change: 8.2, hint: "vs last month", icon: Building2 },
          { label: "Active Businesses", value: num(biz.filter((b) => b.status === "Active").length), change: 5.4, hint: "vs last month", icon: CheckCircle2 },
          { label: "New Registrations", value: num(onb.filter((o) => o.stage === "New Registration").length + 9), change: 12.5, hint: "last 30 days", icon: UserPlus },
          { label: "Active Subscriptions", value: num(subs.filter((s) => s.status === "Active").length), change: 4.1, hint: "paying", icon: CreditCard },
          { label: "MRR", value: inr(mrr), change: 9.8, hint: "vs last month", icon: IndianRupee },
          { label: "Total Revenue", value: inr(mrr * 14.6), change: 14.2, hint: "lifetime", icon: Wallet },
          { label: "WhatsApp Messages", value: "4.82M", change: 18.3, hint: "this month", icon: MessageCircle },
          { label: "AI Tokens Consumed", value: compact(tokens.reduce((a, t) => a + t.consumed, 0)), change: 21.4, hint: "this month", icon: Coins },
        ]}
      />

      <div className="mb-4 grid gap-4 xl:grid-cols-3">
        <Panel
          title="Revenue overview"
          className="xl:col-span-2"
          action={
            <Tabs value={period} onValueChange={(v) => setPeriod(v as keyof typeof PERIODS)}>
              <TabsList className="h-8">{Object.keys(PERIODS).map((k) => <TabsTrigger key={k} value={k} className="text-xs">{k}</TabsTrigger>)}</TabsList>
            </Tabs>
          }
        >
          <Chart spec={{ title: "", type: "area", data: series(p.labels, { revenue: [p.base, p.g] }, p.labels.length), series: [{ key: "revenue", label: "Revenue" }], format: (n) => "₹" + compact(n) }} height={260} />
        </Panel>
        <Panel title="Subscription distribution">
          <Chart spec={{ title: "", type: "pie", data: PLANS.map((pl) => ({ label: pl, v: biz.filter((b) => b.plan === pl).length })), series: [{ key: "v", label: "Businesses" }], format: (n) => String(n) }} height={260} />
        </Panel>
      </div>

      <div className="mb-4 grid gap-4 lg:grid-cols-3">
        <Panel title="Business growth">
          <Chart spec={{ title: "", type: "bar", data: series(MONTHS.slice(-6), { reg: [14, 2], active: [90, 6], churn: [3, 0] }, 2), series: [{ key: "reg", label: "New" }, { key: "active", label: "Active" }, { key: "churn", label: "Churn" }] }} />
        </Panel>
        <Panel title="WhatsApp activity">
          <Chart spec={{ title: "", type: "line", data: series(MONTHS.slice(-6), { sent: [620000, 60000], delivered: [600000, 58000], failed: [9000, 300] }, 6), series: [{ key: "sent", label: "Sent" }, { key: "delivered", label: "Delivered" }, { key: "failed", label: "Failed" }] }} />
        </Panel>
        <Panel title="AI consumption">
          <Chart spec={{ title: "", type: "area", data: series(MONTHS.slice(-6), { tokens: [18000, 2600], cost: [7600, 1100] }, 7), series: [{ key: "tokens", label: "Tokens (K)" }, { key: "cost", label: "Est. cost (₹)" }] }} />
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-4">
        <Panel title="Recent registrations" action={<ViewAll to="/businesses" />}>
          <ul className="space-y-3">
            {[...biz].sort((a, b) => b.registeredAt.localeCompare(a.registeredAt)).slice(0, 5).map((b) => (
              <li key={b.id} className="flex items-center gap-3 text-sm"><Avatar name={b.name} /><div className="min-w-0 flex-1"><p className="truncate font-medium">{b.name}</p><p className="text-xs text-muted-foreground">{b.plan} · {date(b.registeredAt)}</p></div><StatusBadge value={b.status} /></li>
            ))}
          </ul>
        </Panel>
        <Panel title="Pending onboarding" action={<ViewAll to="/onboarding" />}>
          <ul className="space-y-3">
            {onb.filter((o) => o.stage !== "Completed Onboarding").slice(0, 5).map((o) => {
              const pct = Math.round((o.checklist.filter((c: any) => c.done).length / o.checklist.length) * 100);
              return (
                <li key={o.id} className="text-sm">
                  <div className="flex justify-between"><span className="font-medium">{o.name}</span><span className="text-xs text-muted-foreground">{pct}%</span></div>
                  <div className="mt-1 h-1.5 rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} /></div>
                  <p className="mt-0.5 text-xs text-muted-foreground">{o.stage}</p>
                </li>
              );
            })}
          </ul>
        </Panel>
        <Panel title="Upcoming renewals" action={<ViewAll to="/plans" />}>
          <ul className="space-y-3">
            {[...subs].filter((s) => s.status === "Active").sort((a, b) => a.renewal.localeCompare(b.renewal)).slice(0, 5).map((s) => (
              <li key={s.id} className="flex justify-between text-sm"><div><p className="font-medium">{s.business}</p><p className="text-xs text-muted-foreground">{s.plan} · {inr(s.amount)}</p></div><span className="text-xs text-muted-foreground">{relative(s.renewal)}</span></li>
            ))}
          </ul>
        </Panel>
        <Panel title="Failed payments" action={<ViewAll to="/payments" />}>
          <ul className="space-y-3">
            {tx.filter((t) => t.status === "Failed").slice(0, 5).map((t) => (
              <li key={t.id} className="flex justify-between text-sm"><div><p className="font-medium">{t.business}</p><p className="font-mono text-xs text-muted-foreground">{t.invoice}</p></div><span className="font-semibold text-destructive">{inr(t.amount)}</span></li>
            ))}
          </ul>
        </Panel>
        <Panel title="New customer requests" action={<ViewAll to="/requests" />}>
          <ul className="space-y-3">
            {req.filter((r) => r.status === "New").slice(0, 5).map((r) => (
              <li key={r.id} className="text-sm"><p className="truncate font-medium">{r.type}</p><p className="text-xs text-muted-foreground">{r.business} · {relative(r.submittedAt)}</p></li>
            ))}
          </ul>
        </Panel>
        <Panel title="Open support tickets" action={<ViewAll to="/tickets" />}>
          <ul className="space-y-3">
            {tickets.filter((t) => t.status === "Open" || t.status === "In Progress").slice(0, 5).map((t) => (
              <li key={t.id} className="flex items-start justify-between gap-2 text-sm"><div className="min-w-0"><p className="truncate font-medium">{t.subject}</p><p className="text-xs text-muted-foreground">{t.business}</p></div><StatusBadge value={t.priority} /></li>
            ))}
          </ul>
        </Panel>
        <Panel title="Recent activity" action={<ViewAll to="/audit-logs" />}>
          <ActivityTimeline items={[...audit].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 5).map((a) => ({ at: a.at, title: a.action, text: `${a.resource} · ${a.next}`, by: a.actor }))} />
        </Panel>
        <Panel title="System status" action={<ViewAll to="/system-monitoring" />}>
          <ul className="space-y-2">
            {services.map((s) => (
              <li key={s.id} className="flex items-center justify-between text-sm"><span>{s.name}</span><StatusBadge value={s.status} /></li>
            ))}
          </ul>
        </Panel>
      </div>
    </div>
  );
}
