import { useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ArrowRight, Check, CheckCheck, Clock, Download, MessageSquare, Plus, Send, TrendingDown, TrendingUp, Users } from "lucide-react";
import type { AnalyticsOverview, AnalyticsRange } from "@whatsapp-crm/shared-types";
import { changePercent, formatDuration, percent, useAnalytics } from "@/api/analytics";
import { contactName, useConversations } from "@/api/inbox";
import { useApprovedTemplates } from "@/api/templates";
import { useWhatsappAccounts } from "@/api/whatsapp";
import { DateRangeSelect } from "@/components/dashboard/DateRangeSelect";
import { Panel } from "@/components/dashboard/Panel";
import { Status, Table } from "@/components/genie/ui";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { useSession } from "@/lib/auth";
import { cn } from "@/lib/utils";

const tooltipStyle = {
  background: "var(--card)",
  border: "1px solid var(--border)",
  borderRadius: 10,
  fontSize: 12,
};
const axis = { fontSize: 11, fill: "var(--muted-foreground)" };
const fmt = (n: number) => n.toLocaleString();

const shortDay = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString([], { day: "numeric", month: "short" });

function useRange(): [AnalyticsRange, (r: string) => void] {
  const [range, setRange] = useState<AnalyticsRange>("7d");
  return [range, (r) => setRange(r as AnalyticsRange)];
}

function Delta({ current, previous }: { current: number; previous: number }) {
  const change = changePercent(current, previous);
  if (change === null) return <span className="text-muted-foreground">new this period</span>;
  const up = change >= 0;
  return (
    <span className={cn("inline-flex items-center gap-1", up ? "text-primary" : "text-destructive")}>
      {up ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
      {up ? "+" : ""}
      {change}% <span className="text-muted-foreground">vs previous period</span>
    </span>
  );
}

function Stat({
  label,
  value,
  icon: Icon,
  note,
}: {
  label: string;
  value: string;
  icon: typeof Send;
  note?: ReactNode;
}) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex items-center justify-between gap-1">
        <p className="text-[11px] text-muted-foreground">{label}</p>
        <Icon className="size-4 text-primary" />
      </div>
      <p className="mt-3 text-2xl font-semibold tabular-nums">{value}</p>
      {note && <p className="mt-2 text-[11px]">{note}</p>}
    </div>
  );
}

function Loading({ error }: { error: boolean }) {
  return (
    <p role={error ? "alert" : "status"} className={cn("py-10 text-center text-sm", error ? "text-destructive" : "text-muted-foreground")}>
      {error ? "Could not load the numbers. Try again in a moment." : "Loading…"}
    </p>
  );
}

function ActivityChart({ data }: { data: AnalyticsOverview["daily"] }) {
  const rows = data.map((d) => ({ day: shortDay(d.date), Sent: d.outbound, Received: d.inbound }));
  return (
    <Panel title="Message activity" subtitle="Messages you sent and messages customers sent you" className="lg:col-span-2">
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={rows} margin={{ left: -16, right: 4, top: 4 }}>
            <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 3" />
            <XAxis dataKey="day" tickLine={false} axisLine={false} tick={axis} minTickGap={16} />
            <YAxis tickLine={false} axisLine={false} tick={axis} allowDecimals={false} />
            <Tooltip contentStyle={tooltipStyle} />
            <Area isAnimationActive={false} type="monotone" dataKey="Sent" stroke="var(--chart-1)" strokeWidth={2} fill="var(--chart-1)" fillOpacity={0.12} />
            <Area isAnimationActive={false} type="monotone" dataKey="Received" stroke="var(--chart-2)" strokeWidth={2} fill="none" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </Panel>
  );
}

function DeliveryChart({ messages }: { messages: AnalyticsOverview["messages"] }) {
  const slices = [
    { name: "Read", value: messages.read, color: "var(--chart-3)" },
    { name: "Delivered", value: messages.delivered - messages.read, color: "var(--chart-1)" },
    { name: "Sent", value: Math.max(messages.sent - messages.delivered, 0), color: "var(--chart-2)" },
    { name: "Failed", value: messages.failed, color: "var(--destructive)" },
  ];
  const total = slices.reduce((n, s) => n + s.value, 0);
  return (
    <Panel title="Delivery" subtitle="What happened to the messages you sent">
      {total === 0 ? (
        <p className="py-16 text-center text-sm text-muted-foreground">No messages sent in this period.</p>
      ) : (
        <>
          <div className="h-40">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie isAnimationActive={false} data={slices} dataKey="value" nameKey="name" innerRadius={48} outerRadius={70} paddingAngle={2}>
                  {slices.map((s) => (
                    <Cell key={s.name} fill={s.color} />
                  ))}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <ul className="mt-2 space-y-1.5 text-xs">
            {slices.map((s) => (
              <li key={s.name} className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-muted-foreground">
                  <span className="size-2 rounded-full" style={{ background: s.color }} />
                  {s.name}
                </span>
                <span className="tabular-nums">
                  {fmt(s.value)} · {percent(s.value, total)}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </Panel>
  );
}

function CampaignChart({ campaigns }: { campaigns: AnalyticsOverview["campaigns"]["recent"] }) {
  const rows = [...campaigns].reverse().map((c) => ({ name: c.name.length > 14 ? `${c.name.slice(0, 13)}…` : c.name, Sent: c.sent, Delivered: c.delivered, Read: c.read }));
  return (
    <Panel title="Campaign performance" subtitle="Your latest campaigns">
      {rows.length === 0 ? (
        <p className="py-16 text-center text-sm text-muted-foreground">No campaigns yet.</p>
      ) : (
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rows} margin={{ left: -16, right: 4 }}>
              <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 3" />
              <XAxis dataKey="name" tickLine={false} axisLine={false} tick={axis} />
              <YAxis tickLine={false} axisLine={false} tick={axis} allowDecimals={false} />
              <Tooltip contentStyle={tooltipStyle} />
              <Bar isAnimationActive={false} dataKey="Sent" fill="var(--chart-2)" radius={[3, 3, 0, 0]} />
              <Bar isAnimationActive={false} dataKey="Delivered" fill="var(--chart-1)" radius={[3, 3, 0, 0]} />
              <Bar isAnimationActive={false} dataKey="Read" fill="var(--chart-3)" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </Panel>
  );
}

export function DashboardPage() {
  const { user, tenant } = useSession();
  const [range, setRange] = useRange();
  const analytics = useAnalytics(range);
  const conversations = useConversations();
  const accounts = useWhatsappAccounts();
  const templates = useApprovedTemplates();
  const data = analytics.data;

  const checklist = useMemo(
    () => [
      { label: "Connect your WhatsApp number", to: "/whatsapp-accounts", done: accounts.data?.some((a) => a.status === "connected") ?? true },
      { label: "Get a template approved", to: "/templates", done: (templates.data?.length ?? 1) > 0 },
      { label: "Add your contacts", to: "/contacts", done: (data?.contacts.total ?? 1) > 0 },
      { label: "Send your first campaign", to: "/campaigns", done: (data?.campaigns.total ?? 1) > 0 },
    ],
    [accounts.data, templates.data, data],
  );
  const remaining = checklist.filter((c) => !c.done);

  return (
    <div className="genie-table space-y-5">
      <PageHeader
        title={`Hello, ${user.displayName.split(" ")[0]}`}
        subtitle={`Here's what's happening at ${tenant.name}.`}
        actions={
          <>
            <DateRangeSelect value={range} onChange={setRange} />
            <Button asChild>
              <Link to="/campaigns">
                <Plus />
                Create campaign
              </Link>
            </Button>
          </>
        }
      />

      {remaining.length > 0 && (
        <section className="rounded-xl border bg-card p-4">
          <h2 className="text-sm font-semibold">Get your business ready</h2>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {checklist.map((c, i) => (
              <Link key={c.label} to={c.to} className="flex items-center gap-3 rounded-lg p-2 hover:bg-muted">
                <span className={cn("flex size-7 shrink-0 items-center justify-center rounded-full text-xs", c.done ? "bg-primary-soft text-primary" : "border bg-card text-muted-foreground")}>
                  {c.done ? <Check className="size-4" /> : i + 1}
                </span>
                <span className={cn("text-xs font-medium", c.done && "text-muted-foreground line-through")}>{c.label}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {!data ? (
        <Loading error={analytics.isError} />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-6">
            <Stat label="Contacts" value={fmt(data.contacts.total)} icon={Users} note={`${fmt(data.contacts.new)} new this period`} />
            <Stat label="Messages sent" value={fmt(data.messages.sent)} icon={Send} note={<Delta current={data.messages.sent} previous={data.messages.previousSent} />} />
            <Stat label="Delivered" value={fmt(data.messages.delivered)} icon={CheckCheck} note={`${percent(data.messages.delivered, data.messages.sent)} of sent`} />
            <Stat label="Read" value={fmt(data.messages.read)} icon={MessageSquare} note={`${percent(data.messages.read, data.messages.sent)} of sent`} />
            <Stat label="Conversations" value={fmt(data.conversations.started)} icon={MessageSquare} note={<Delta current={data.conversations.started} previous={data.conversations.previousStarted} />} />
            <Stat label="Avg. first reply" value={formatDuration(data.conversations.avgFirstResponseSeconds)} icon={Clock} note={`${fmt(data.conversations.unread)} unread now`} />
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <ActivityChart data={data.daily} />
            <DeliveryChart messages={data.messages} />
          </div>

          <div className="grid gap-5 xl:grid-cols-[2fr_1fr]">
            <section className="min-w-0 space-y-3">
              <div className="flex justify-between">
                <h2 className="text-sm font-semibold">Recent campaigns</h2>
                <Link to="/campaigns" className="text-xs text-primary">
                  View all <ArrowRight className="ml-1 inline size-3" />
                </Link>
              </div>
              {data.campaigns.recent.length === 0 ? (
                <p className="text-sm text-muted-foreground">No campaigns yet.</p>
              ) : (
                <Table headers={["Campaign", "Status", "Audience", "Delivered", "Read rate"]}>
                  {data.campaigns.recent.slice(0, 5).map((c) => (
                    <tr key={c.id}>
                      <td>
                        <Link to="/campaigns" className="font-medium">
                          {c.name}
                        </Link>
                      </td>
                      <td>
                        <Status>{c.status[0]!.toUpperCase() + c.status.slice(1)}</Status>
                      </td>
                      <td>{fmt(c.total)}</td>
                      <td>{fmt(c.delivered)}</td>
                      <td>{percent(c.read, c.sent)}</td>
                    </tr>
                  ))}
                </Table>
              )}
            </section>
            <CampaignChart campaigns={data.campaigns.recent} />
          </div>

          <div className="grid gap-6 border-t pt-5 lg:grid-cols-2">
            <section className="space-y-3">
              <div className="flex justify-between">
                <h2 className="text-sm font-semibold">Recent conversations</h2>
                <Link to="/inbox" className="text-xs text-primary">
                  Open inbox
                </Link>
              </div>
              {(conversations.data ?? []).length === 0 && <p className="text-sm text-muted-foreground">No conversations yet.</p>}
              {(conversations.data ?? []).slice(0, 5).map((c) => (
                <Link key={c.id} to="/inbox" className="flex items-center gap-3 border-b py-2">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary-soft text-xs font-semibold text-primary">
                    {contactName(c.contact).replace(/^\+/, "").slice(0, 2).toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium">{contactName(c.contact)}</p>
                    <p className="truncate text-xs text-muted-foreground">{c.lastMessage?.preview ?? "No messages yet"}</p>
                  </div>
                  {c.unreadCount > 0 && <span className="rounded-full bg-wa-bright px-1.5 text-[11px] font-semibold text-wa-deep">{c.unreadCount}</span>}
                </Link>
              ))}
            </section>
            <section className="space-y-3">
              <h2 className="text-sm font-semibold">WhatsApp account status</h2>
              {(accounts.data ?? []).length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No WhatsApp number connected. <Link className="text-primary underline" to="/whatsapp-accounts">Connect one</Link>.
                </p>
              )}
              {(accounts.data ?? []).map((a) => (
                <Link key={a.id} to="/whatsapp-accounts" className="flex flex-wrap items-center justify-between gap-2 border-b py-2 text-xs">
                  <span>{a.displayPhoneNumber ?? a.phoneNumberId}</span>
                  <Status>{a.status[0]!.toUpperCase() + a.status.slice(1)}</Status>
                </Link>
              ))}
            </section>
          </div>
        </>
      )}
    </div>
  );
}

export function AnalyticsPage() {
  const [range, setRange] = useRange();
  const analytics = useAnalytics(range);
  const data = analytics.data;

  const exportCsv = () => {
    if (!data) return;
    const rows: [string, string | number][] = [
      ["Period start", data.since],
      ["Messages sent", data.messages.sent],
      ["Delivered", data.messages.delivered],
      ["Read", data.messages.read],
      ["Failed", data.messages.failed],
      ["Messages received", data.messages.inbound],
      ["Conversations started", data.conversations.started],
      ["Avg first reply (seconds)", data.conversations.avgFirstResponseSeconds ?? ""],
      ["New contacts", data.contacts.new],
      ["Opted-out contacts", data.contacts.optedOut],
    ];
    const csv =
      "Metric,Value\n" +
      rows.map(([k, v]) => `"${k}","${v}"`).join("\n") +
      "\n\nDate,Sent,Received,New contacts\n" +
      data.daily.map((d) => `${d.date},${d.outbound},${d.inbound},${d.newContacts}`).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `genie-analytics-${range}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Analytics"
        subtitle="A clearer picture of every conversation."
        actions={
          <>
            <DateRangeSelect value={range} onChange={setRange} />
            <Button variant="outline" onClick={exportCsv} disabled={!data}>
              <Download />
              Export report
            </Button>
          </>
        }
      />
      {!data ? (
        <Loading error={analytics.isError} />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <Stat label="Messages sent" value={fmt(data.messages.sent)} icon={Send} note={<Delta current={data.messages.sent} previous={data.messages.previousSent} />} />
            <Stat label="Delivered" value={fmt(data.messages.delivered)} icon={CheckCheck} note={`${percent(data.messages.delivered, data.messages.sent)} delivery rate`} />
            <Stat label="Read" value={fmt(data.messages.read)} icon={CheckCheck} note={`${percent(data.messages.read, data.messages.sent)} read rate`} />
            <Stat label="Failed" value={fmt(data.messages.failed)} icon={TrendingDown} note={`${percent(data.messages.failed, data.messages.failed + data.messages.sent)} failure rate`} />
            <Stat label="Messages received" value={fmt(data.messages.inbound)} icon={MessageSquare} note={<Delta current={data.messages.inbound} previous={data.messages.previousInbound} />} />
            <Stat label="Conversations started" value={fmt(data.conversations.started)} icon={MessageSquare} note={<Delta current={data.conversations.started} previous={data.conversations.previousStarted} />} />
            <Stat label="Avg. first reply" value={formatDuration(data.conversations.avgFirstResponseSeconds)} icon={Clock} note="Customer's first message to a team reply" />
            <Stat label="New contacts" value={`+${fmt(data.contacts.new)}`} icon={Users} note={<Delta current={data.contacts.new} previous={data.contacts.previousNew} />} />
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <ActivityChart data={data.daily} />
            <DeliveryChart messages={data.messages} />
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <CampaignChart campaigns={data.campaigns.recent} />
            <Panel title="Contact growth" subtitle="New contacts per day">
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={data.daily.map((d) => ({ day: shortDay(d.date), "New contacts": d.newContacts }))} margin={{ left: -16, right: 4 }}>
                    <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 3" />
                    <XAxis dataKey="day" tickLine={false} axisLine={false} tick={axis} minTickGap={16} />
                    <YAxis tickLine={false} axisLine={false} tick={axis} allowDecimals={false} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Line isAnimationActive={false} type="monotone" dataKey="New contacts" stroke="var(--primary)" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Panel>
          </div>
          <p className="text-xs text-muted-foreground">
            {fmt(data.contacts.optedOut)} contact(s) have opted out and are never included in campaigns. Numbers update every minute.
          </p>
        </>
      )}
    </div>
  );
}
