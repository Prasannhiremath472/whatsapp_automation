import { useState } from "react";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Chart, DAYS30, MONTHS, WEEKS, series, type ChartSpec } from "@/components/admin-ui/charts";
import { MetricGrid, PageHeader, Panel, type Metric } from "@/components/admin-ui/primitives";
import { PLANS } from "@/lib/demo-data/seed";
import { downloadCsv, compact } from "@/lib/admin/format";

type Range = "30 days" | "12 weeks" | "12 months";
const LABELS: Record<Range, string[]> = { "30 days": DAYS30, "12 weeks": WEEKS, "12 months": MONTHS };
const SCALE: Record<Range, number> = { "30 days": 0.035, "12 weeks": 0.25, "12 months": 1 };

export interface AnalyticsConfig {
  title: string;
  description: string;
  metrics: (scale: number) => Metric[];
  charts: (labels: string[], scale: number, planFactor: number) => ChartSpec[];
}

export function AnalyticsPage({ config }: { config: AnalyticsConfig }) {
  const [range, setRange] = useState<Range>("12 months");
  const [plan, setPlan] = useState("All plans");
  const pf = plan === "All plans" ? 1 : [0.35, 0.3, 0.22, 0.13][PLANS.indexOf(plan as (typeof PLANS)[number])];
  const charts = config.charts(LABELS[range], SCALE[range], pf);
  return (
    <div>
      <PageHeader
        title={config.title}
        description={config.description}
        actions={
          <>
            <Select value={range} onValueChange={(v) => setRange(v as Range)}>
              <SelectTrigger aria-label="Date range" className="w-36 bg-card"><SelectValue /></SelectTrigger>
              <SelectContent>{Object.keys(LABELS).map((r) => <SelectItem key={r} value={r}>Last {r}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={plan} onValueChange={setPlan}>
              <SelectTrigger aria-label="Plan" className="w-36 bg-card"><SelectValue /></SelectTrigger>
              <SelectContent>{["All plans", ...PLANS].map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={() => {
              const rows = charts[0].data;
              downloadCsv(`${config.title.toLowerCase().replace(/\s+/g, "-")}.csv`, rows, Object.keys(rows[0]).map((k) => ({ key: k, label: k })));
              toast.success("Export ready");
            }}><Download /> Export</Button>
          </>
        }
      />
      <MetricGrid metrics={config.metrics(SCALE[range] * pf)} />
      <div className="grid gap-4 lg:grid-cols-2">
        {charts.map((c) => <Panel key={c.title} title={c.title}><Chart spec={c} height={260} /></Panel>)}
      </div>
    </div>
  );
}

const pctf = (n: number) => n + "%";
export const ANALYTICS: Record<string, AnalyticsConfig> = {
  platform: {
    title: "Platform Analytics", description: "Business lifecycle and product adoption across Genie.",
    metrics: (s) => [
      { label: "New registrations", value: compact(220 * s), change: 12 }, { label: "Active businesses", value: "1,284", change: 5 },
      { label: "Retention (90d)", value: "91.4%", change: 1.2 }, { label: "Churn", value: "2.1%", change: -0.4 }, { label: "Trial conversion", value: "38%", change: 3.1 },
    ],
    charts: (l, s, p) => [
      { title: "Registrations vs churn", type: "bar", data: series(l, { reg: [18 * s * 12 * p + 2, 1], churn: [2 * s * 12 * p + 1, 0] }, 1), series: [{ key: "reg", label: "Registrations" }, { key: "churn", label: "Churned" }] },
      { title: "Product adoption", type: "bar", data: [["Inbox", 94], ["Campaigns", 61], ["Templates", 77], ["AI Agents", 49], ["Automations", 42]].map(([label, v]) => ({ label, v })), series: [{ key: "v", label: "Adoption" }], format: pctf },
      { title: "Active businesses", type: "area", data: series(l, { active: [900 * p, 30 * p] }, 2), series: [{ key: "active", label: "Active" }] },
      { title: "Trial conversion rate", type: "line", data: series(l, { conv: [32, 0.5] }, 3), series: [{ key: "conv", label: "Conversion" }], format: pctf },
    ],
  },
  business: {
    title: "Business Analytics", description: "How customer businesses use Genie, by industry and plan.",
    metrics: () => [
      { label: "Avg contacts / business", value: "4,820" }, { label: "Avg staff seats", value: "6.2" }, { label: "Avg campaigns / mo", value: "11" }, { label: "AI-enabled", value: "58%", change: 6 },
    ],
    charts: (l, _s, p) => [
      { title: "Businesses by industry", type: "pie", data: [["Healthcare", 22], ["Retail", 18], ["Education", 14], ["Food & Beverage", 16], ["Other", 30]].map(([label, v]) => ({ label, v })), series: [{ key: "v", label: "Businesses" }] },
      { title: "Businesses by plan", type: "bar", data: PLANS.map((pl, i) => ({ label: pl, v: [480, 410, 290, 104][i] })), series: [{ key: "v", label: "Businesses" }] },
      { title: "Messages per business", type: "line", data: series(l, { v: [3400 * p, 60] }, 4), series: [{ key: "v", label: "Messages" }] },
      { title: "Feature usage depth", type: "stacked", data: series(l.slice(-6), { inbox: [60, 1], campaigns: [25, 1], ai: [15, 1] }, 5), series: [{ key: "inbox", label: "Inbox" }, { key: "campaigns", label: "Campaigns" }, { key: "ai", label: "AI" }], format: pctf },
    ],
  },
  revenue: {
    title: "Revenue Analytics", description: "Recurring revenue, expansion and collections. Demo values only.",
    metrics: (s) => [
      { label: "Revenue", value: "₹" + compact(3600000 * s), change: 14 }, { label: "MRR", value: "₹6.1L", change: 9.8 }, { label: "ARR", value: "₹73.2L" },
      { label: "Expansion MRR", value: "₹42K", change: 22 }, { label: "Payment success", value: "96.8%", change: 0.6 },
    ],
    charts: (l, s, p) => [
      { title: "Revenue trend", type: "area", data: series(l, { v: [300000 * s * 12 * p, 9000 * p] }, 6), series: [{ key: "v", label: "Revenue" }], format: (n) => "₹" + compact(n) },
      { title: "MRR movement", type: "stacked", data: series(l.slice(-6), { newm: [40000, 2000], exp: [22000, 1500], churn: [9000, 0] }, 7), series: [{ key: "newm", label: "New" }, { key: "exp", label: "Expansion" }, { key: "churn", label: "Churned" }], format: (n) => "₹" + compact(n) },
      { title: "Revenue by plan", type: "pie", data: PLANS.map((pl, i) => ({ label: pl, v: [72000, 164000, 261000, 125000][i] })), series: [{ key: "v", label: "MRR" }], format: (n) => "₹" + compact(n) },
      { title: "Payment success rate", type: "line", data: series(l, { v: [95, 0.1] }, 8), series: [{ key: "v", label: "Success" }], format: pctf },
    ],
  },
  usage: {
    title: "Usage Analytics", description: "Platform consumption across messaging, AI, API and storage.",
    metrics: (s) => [
      { label: "WhatsApp messages", value: compact(58000000 * s), change: 18 }, { label: "AI tokens", value: compact(420000000 * s), change: 21 },
      { label: "API requests", value: compact(18000000 * s) }, { label: "Storage", value: "2.4 TB" }, { label: "Automation runs", value: compact(3100000 * s) }, { label: "Active team members", value: "6,912" },
    ],
    charts: (l, s, p) => [
      { title: "WhatsApp messages", type: "area", data: series(l, { v: [4800000 * s * p, 60000 * p] }, 9), series: [{ key: "v", label: "Messages" }] },
      { title: "AI tokens", type: "bar", data: series(l, { v: [35000000 * s * p, 400000 * p] }, 10), series: [{ key: "v", label: "Tokens" }] },
      { title: "API requests", type: "line", data: series(l, { v: [1500000 * s * p, 20000] }, 11), series: [{ key: "v", label: "Requests" }] },
      { title: "Automation executions", type: "area", data: series(l, { v: [260000 * s * p, 4000] }, 12), series: [{ key: "v", label: "Executions" }] },
    ],
  },
  ai: {
    title: "AI Usage Analytics", description: "Token consumption by provider, model and business. Costs are estimates.",
    metrics: (s) => [
      { label: "Tokens", value: compact(420000000 * s), change: 21 }, { label: "Requests", value: compact(2200000 * s) }, { label: "Est. cost", value: "₹" + compact(176000 * s) },
      { label: "Avg latency", value: "1.4s" }, { label: "Error rate", value: "0.7%", change: -0.2 },
    ],
    charts: (l, s, p) => [
      { title: "Tokens by provider", type: "stacked", data: series(l, { openai: [20000000 * s * p, 200000], anthropic: [9000000 * s * p, 120000], gemini: [6000000 * s * p, 90000] }, 13), series: [{ key: "openai", label: "OpenAI" }, { key: "anthropic", label: "Anthropic" }, { key: "gemini", label: "Gemini" }] },
      { title: "Model share", type: "pie", data: [["gpt-5-mini", 46], ["claude-sonnet", 26], ["gemini-2.5-flash", 21], ["other", 7]].map(([label, v]) => ({ label, v })), series: [{ key: "v", label: "Share" }], format: pctf },
      { title: "Estimated cost (₹)", type: "area", data: series(l, { v: [14000 * s * 12 * p, 300] }, 14), series: [{ key: "v", label: "Cost" }], format: (n) => "₹" + compact(n) },
      { title: "Input vs output", type: "line", data: series(l, { input: [22000000 * s * p, 200000], output: [13000000 * s * p, 120000] }, 15), series: [{ key: "input", label: "Input" }, { key: "output", label: "Output" }] },
    ],
  },
};
