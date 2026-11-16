import { Link } from "react-router-dom";
import { CheckCircle2, Phone, ShieldCheck, Zap } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { Panel } from "./Panel";
import { campaigns, conversations, type CampaignStatus } from "./data";

const statusStyle: Record<CampaignStatus, string> = {
  Completed: "bg-primary-soft text-primary",
  Running: "bg-info/10 text-info",
  Scheduled: "bg-warning/15 text-foreground",
  Draft: "bg-muted text-muted-foreground",
};

const viewAll = (to: string) => (
  <Link to={to} className="text-xs font-medium text-primary hover:underline">View all</Link>
);

export function RecentCampaigns() {
  return (
    <Panel title="Recent campaigns" subtitle="Your latest broadcasts" action={viewAll("/campaigns")} className="lg:col-span-2">
      <div className="-mx-5 -mb-5 overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="border-y bg-muted/50 text-left text-xs text-muted-foreground">
              <th className="px-5 py-2.5 font-medium">Campaign</th>
              <th className="px-3 py-2.5 font-medium">Status</th>
              <th className="px-3 py-2.5 text-right font-medium">Audience</th>
              <th className="px-3 py-2.5 font-medium">Read rate</th>
              <th className="px-5 py-2.5 text-right font-medium">Date</th>
            </tr>
          </thead>
          <tbody>
            {campaigns.map((c) => {
              const rate = c.sent ? Math.round((c.read / c.sent) * 100) : 0;
              return (
                <tr key={c.name} className="border-b last:border-0 hover:bg-muted/40">
                  <td className="px-5 py-3 font-medium">{c.name}</td>
                  <td className="px-3 py-3">
                    <span className={cn("rounded-md px-2 py-0.5 text-xs font-medium", statusStyle[c.status])}>{c.status}</span>
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums text-muted-foreground">{c.audience.toLocaleString("en-IN")}</td>
                  <td className="px-3 py-3">
                    {c.sent ? (
                      <div className="flex items-center gap-2">
                        <Progress value={rate} className="h-1.5 w-20" />
                        <span className="text-xs tabular-nums">{rate}%</span>
                      </div>
                    ) : <span className="text-xs text-muted-foreground">—</span>}
                  </td>
                  <td className="px-5 py-3 text-right text-muted-foreground">{c.date}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

export function RecentConversations() {
  return (
    <Panel title="Recent conversations" action={viewAll("/inbox")}>
      <ul className="-mx-2 -my-1 space-y-0.5">
        {conversations.map((c) => (
          <li key={c.name}>
            <Link to="/inbox" className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-muted/60">
              <Avatar className="h-9 w-9">
                <AvatarFallback className="bg-secondary text-xs font-semibold">{c.initials}</AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium">{c.name}</span>
                  <span className="shrink-0 text-[11px] text-muted-foreground">{c.time}</span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-xs text-muted-foreground">{c.message}</span>
                  {c.unread > 0 && (
                    <span className="flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">{c.unread}</span>
                  )}
                </div>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

export function ConnectionCard() {
  const rows = [
    { icon: Phone, label: "Phone number", value: "+91 98765 43210" },
    { icon: ShieldCheck, label: "Quality rating", value: "High" },
    { icon: Zap, label: "Messaging limit", value: "10K / 24h" },
  ];
  return (
    <Panel title="WhatsApp API" subtitle="Business account status">
      <div className="flex items-center gap-3 rounded-lg bg-primary-soft p-3">
        <CheckCircle2 className="h-5 w-5 text-primary" />
        <div>
          <div className="text-sm font-semibold">Connected</div>
          <div className="text-xs text-muted-foreground">Acme Retail · Verified business</div>
        </div>
      </div>
      <dl className="mt-4 space-y-3">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center justify-between text-sm">
            <dt className="flex items-center gap-2 text-muted-foreground"><r.icon className="h-4 w-4" />{r.label}</dt>
            <dd className="font-medium">{r.value}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-4">
        <div className="mb-1.5 flex justify-between text-xs text-muted-foreground"><span>Daily usage</span><span>6,420 / 10,000</span></div>
        <Progress value={64} className="h-1.5" />
      </div>
    </Panel>
  );
}
