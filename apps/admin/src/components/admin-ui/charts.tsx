import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { compact } from "@/lib/admin/format";

export const CHART_COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];

export interface ChartSpec {
  title: string;
  type: "area" | "bar" | "line" | "pie" | "stacked";
  data: Record<string, any>[];
  x?: string;
  series: { key: string; label: string }[];
  format?: (n: number) => string;
}

const axis = { stroke: "var(--muted-foreground)", fontSize: 11, tickLine: false, axisLine: false };
const tip = { contentStyle: { background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 } };

export function Chart({ spec, height = 240 }: { spec: ChartSpec; height?: number }) {
  const fmt = spec.format ?? compact;
  const x = spec.x ?? "label";
  return (
    <ResponsiveContainer width="100%" height={height}>
      {spec.type === "pie" ? (
        <PieChart>
          <Pie data={spec.data} dataKey={spec.series[0].key} nameKey={x} innerRadius="55%" outerRadius="85%" paddingAngle={2}>
            {spec.data.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % 5]} />)}
          </Pie>
          <Tooltip {...tip} formatter={(v: number) => fmt(v)} />
          <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
        </PieChart>
      ) : spec.type === "bar" || spec.type === "stacked" ? (
        <BarChart data={spec.data}>
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis dataKey={x} {...axis} />
          <YAxis {...axis} tickFormatter={fmt} width={48} />
          <Tooltip {...tip} formatter={(v: number) => fmt(v)} cursor={{ fill: "var(--muted)" }} />
          {spec.series.length > 1 && <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />}
          {spec.series.map((s, i) => <Bar key={s.key} dataKey={s.key} name={s.label} fill={CHART_COLORS[i]} radius={spec.type === "stacked" ? 0 : [3, 3, 0, 0]} stackId={spec.type === "stacked" ? "a" : undefined} maxBarSize={28} />)}
        </BarChart>
      ) : spec.type === "line" ? (
        <LineChart data={spec.data}>
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis dataKey={x} {...axis} />
          <YAxis {...axis} tickFormatter={fmt} width={48} />
          <Tooltip {...tip} formatter={(v: number) => fmt(v)} />
          {spec.series.length > 1 && <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />}
          {spec.series.map((s, i) => <Line key={s.key} dataKey={s.key} name={s.label} stroke={CHART_COLORS[i]} strokeWidth={2} dot={false} type="monotone" />)}
        </LineChart>
      ) : (
        <AreaChart data={spec.data}>
          <defs>
            {spec.series.map((s, i) => (
              <linearGradient key={s.key} id={`g-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={CHART_COLORS[i]} stopOpacity={0.25} />
                <stop offset="100%" stopColor={CHART_COLORS[i]} stopOpacity={0} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis dataKey={x} {...axis} />
          <YAxis {...axis} tickFormatter={fmt} width={48} />
          <Tooltip {...tip} formatter={(v: number) => fmt(v)} />
          {spec.series.length > 1 && <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />}
          {spec.series.map((s, i) => <Area key={s.key} dataKey={s.key} name={s.label} stroke={CHART_COLORS[i]} fill={`url(#g-${s.key})`} strokeWidth={2} type="monotone" />)}
        </AreaChart>
      )}
    </ResponsiveContainer>
  );
}

/** Deterministic demo series generator. */
export function series(labels: string[], keys: Record<string, [number, number]>, seed = 1) {
  let s = seed * 9301;
  const r = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  return labels.map((label, i) => {
    const row: Record<string, any> = { label };
    for (const [k, [base, growth]] of Object.entries(keys)) row[k] = Math.round(base + growth * i + base * 0.12 * (r() - 0.5));
    return row;
  });
}

export const MONTHS = ["Dec", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov"];
export const DAYS30 = Array.from({ length: 30 }, (_, i) => `${i + 1}`);
export const WEEKS = Array.from({ length: 12 }, (_, i) => `W${i + 1}`);
export const YEARS = ["2022", "2023", "2024", "2025", "2026"];
