import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Panel } from "./Panel";
import { activity, campaignPerf, delivery } from "./data";

const tooltipStyle = {
  background: "var(--card)",
  border: "1px solid var(--border)",
  borderRadius: 10,
  fontSize: 12,
  boxShadow: "var(--shadow-card)",
};
const axis = { fontSize: 11, fill: "var(--muted-foreground)" };

function Legend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <div className="flex flex-wrap gap-4">
      {items.map((i) => (
        <span key={i.label} className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="h-2 w-2 rounded-full" style={{ background: i.color }} /> {i.label}
        </span>
      ))}
    </div>
  );
}

export function ActivityChart({factor=1}:{factor?:number}) {
  return (
    <Panel
      title="Message activity"
      subtitle="Sent, delivered and read messages this week"
      className="lg:col-span-2"
      action={<Legend items={[{ label: "Sent", color: "var(--chart-2)" }, { label: "Delivered", color: "var(--chart-1)" }, { label: "Read", color: "var(--chart-3)" }]} />}
    >
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={activity.map(d=>({...d,sent:Math.round(d.sent*factor),delivered:Math.round(d.delivered*factor),read:Math.round(d.read*factor)}))} margin={{ left: -16, right: 4, top: 4 }}>
            <defs>
              <linearGradient id="gDel" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.22} />
                <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 3" />
            <XAxis dataKey="day" tickLine={false} axisLine={false} tick={axis} />
            <YAxis tickLine={false} axisLine={false} tick={axis} tickFormatter={(v) => `${v / 1000}k`} />
            <Tooltip contentStyle={tooltipStyle} cursor={{ stroke: "var(--border)" }} />
            <Area isAnimationActive={false} type="monotone" dataKey="sent" stroke="var(--chart-2)" strokeWidth={2} fill="none" />
            <Area isAnimationActive={false} type="monotone" dataKey="delivered" stroke="var(--chart-1)" strokeWidth={2} fill="url(#gDel)" />
            <Area isAnimationActive={false} type="monotone" dataKey="read" stroke="var(--chart-3)" strokeWidth={2} strokeDasharray="4 4" fill="none" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </Panel>
  );
}

export function DeliveryChart() {
  return (
    <Panel title="Delivery performance" subtitle="Status of messages sent">
      <div className="relative mx-auto h-44 w-44">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie isAnimationActive={false} data={delivery} dataKey="value" innerRadius={58} outerRadius={80} paddingAngle={2} stroke="none">
              {delivery.map((d) => <Cell key={d.name} fill={d.color} />)}
            </Pie>
            <Tooltip contentStyle={tooltipStyle} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-semibold">96.1%</span>
          <span className="text-xs text-muted-foreground">delivered</span>
        </div>
      </div>
      <div className="mt-4 space-y-2">
        {delivery.map((d) => (
          <div key={d.name} className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-2 text-muted-foreground"><span className="h-2 w-2 rounded-full" style={{ background: d.color }} />{d.name}</span>
            <span className="font-medium tabular-nums">{d.value}%</span>
          </div>
        ))}
      </div>
    </Panel>
  );
}

export function CampaignChart() {
  return (
    <Panel title="Campaign performance" subtitle="Read vs click-through rate (%)" action={<Legend items={[{ label: "Read", color: "var(--chart-1)" }, { label: "Clicked", color: "var(--chart-2)" }]} />}>
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={campaignPerf} margin={{ left: -24, right: 4 }} barGap={4}>
            <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 3" />
            <XAxis dataKey="name" tickLine={false} axisLine={false} tick={axis} interval={0} />
            <YAxis tickLine={false} axisLine={false} tick={axis} />
            <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "var(--muted)" }} />
            <Bar isAnimationActive={false} dataKey="read" fill="var(--chart-1)" radius={[4, 4, 0, 0]} maxBarSize={18} />
            <Bar isAnimationActive={false} dataKey="clicked" fill="var(--chart-2)" radius={[4, 4, 0, 0]} maxBarSize={18} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Panel>
  );
}
