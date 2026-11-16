import {
  Building2, CheckCircle2, Clock, PauseCircle, XCircle, Inbox, Users, IndianRupee, AlertTriangle, RotateCcw, Coins, Cpu,
  MessageCircle, Link2Off, Workflow, Ticket, FileText, Megaphone, Server, Bug, ShieldAlert, KeyRound, HeartPulse, TicketPercent,
} from "lucide-react";
import type { ResourceConfig } from "@/components/admin-ui/ResourcePage";
import { Avatar, StatusBadge, UsageBar } from "@/components/admin-ui/primitives";
import { Chart, MONTHS, series } from "@/components/admin-ui/charts";
import { BusinessService, RequestService, TokenService, audit, db } from "@/services/admin";
import { MANAGERS, PLANS, PLAN_PRICE, STAFF } from "@/lib/demo-data/seed";
import { compact, date, dateTime, inr, num, relative } from "./format";
import { uid, type Row } from "./store";
import { TicketThread } from "@/components/admin/TicketThread";
import { TemplatePreview } from "@/components/admin/TemplatePreview";

const bonusLive = (r: Row) => new Date(r.bonusExpiry).getTime() > Date.now();
const count = (rows: Row[], k: string, v: string) => rows.filter((r) => r[k] === v).length;
const bizName = (r: Row) => (
  <span className="flex items-center gap-2.5"><Avatar name={r.name ?? r.business} className="size-7 text-[10px]" /><span className="font-medium">{r.name ?? r.business}</span></span>
);
const st = (r: Row) => <StatusBadge value={r.status} />;
const mono = (k: string) => (r: Row) => <span className="font-mono text-xs text-muted-foreground">{r[k]}</span>;
const prio = (r: Row) => <StatusBadge value={r.priority} />;

export const businesses: ResourceConfig = {
  title: "Businesses", description: "Every customer business on the Genie platform.", collection: "businesses", entity: "Business", perm: "businesses",
  searchKeys: ["name", "owner", "email", "phone", "industry"], filters: [{ key: "status", label: "Status" }, { key: "plan", label: "Plan" }, { key: "industry", label: "Industry" }, { key: "manager", label: "Manager" }],
  dateKey: "registeredAt", notes: true,
  metrics: (r) => [
    { label: "Total Businesses", value: num(r.length), icon: Building2, change: 8.2, hint: "vs last month" },
    { label: "Active", value: num(count(r, "status", "Active")), icon: CheckCircle2, change: 5.1 },
    { label: "Trial", value: num(count(r, "status", "Trial")), icon: Clock },
    { label: "Suspended", value: num(count(r, "status", "Suspended")), icon: PauseCircle },
    { label: "Expired", value: num(count(r, "status", "Expired")), icon: XCircle },
    { label: "MRR", value: inr(r.reduce((a, b) => a + (b.mrr || 0), 0)), icon: IndianRupee, change: 11.4 },
  ],
  columns: [
    { key: "name", label: "Business", render: bizName },
    { key: "owner", label: "Owner" },
    { key: "email", label: "Email", className: "text-muted-foreground" },
    { key: "phone", label: "Phone", className: "font-mono text-xs" },
    { key: "industry", label: "Industry" },
    { key: "registeredAt", label: "Registered", render: (r) => date(r.registeredAt) },
    { key: "plan", label: "Subscription" },
    { key: "whatsapp", label: "WhatsApp", render: (r) => <StatusBadge value={r.whatsapp} /> },
    { key: "aiUsage", label: "AI Usage", render: (r) => <UsageBar value={r.aiUsage} /> },
    { key: "status", label: "Status", render: st },
    { key: "manager", label: "Account Manager" },
  ],
  edit: [
    { key: "name", label: "Business name", required: true }, { key: "owner", label: "Owner", required: true, half: true },
    { key: "phone", label: "Phone", half: true }, { key: "email", label: "Email", type: "email", required: true }, { key: "industry", label: "Industry" },
  ],
  actions: [
    { label: "Activate", run: (r) => BusinessService.setStatus(r.id, "Active"), show: (r) => r.status !== "Active" && r.status !== "Archived" },
    { label: "Suspend", run: (r) => BusinessService.setStatus(r.id, "Suspended"), confirm: "The business will lose access to the Client Panel until restored (demo).", destructive: true, show: (r) => r.status === "Active" || r.status === "Trial" },
    { label: "Restore", run: (r) => BusinessService.setStatus(r.id, "Active"), show: (r) => r.status === "Suspended" || r.status === "Archived" },
    { label: "Change Plan", fields: [{ key: "plan", label: "New plan", type: "select", options: [...PLANS], required: true }], run: (r, v) => BusinessService.changePlan(r.id, v!.plan) },
    { label: "Assign Manager", fields: [{ key: "manager", label: "Account manager", type: "select", options: MANAGERS, required: true }], run: (r, v) => { db.businesses.update(r.id, { manager: v!.manager }); audit("Manager assigned", "Business", r.id, r.manager, v!.manager); } },
    { label: "Archive", run: (r) => BusinessService.setStatus(r.id, "Archived"), confirm: "Archived businesses are hidden from day-to-day lists.", destructive: true, show: (r) => r.status !== "Archived" },
  ],
  detailTabs: [
    { label: "Usage", render: (r) => <Chart spec={{ title: "", type: "area", data: series(MONTHS.slice(-6), { messages: [2000 + r.aiUsage * 40, 600], tokens: [1000 + r.aiUsage * 30, 400] }, r.aiUsage), series: [{ key: "messages", label: "Messages" }, { key: "tokens", label: "AI tokens (K)" }] }} height={220} /> },
  ],
};

export const clientSuccess: ResourceConfig = {
  title: "Client Success", description: "Account health, risk signals and follow-ups across your portfolio.", collection: "followups", entity: "Follow-up", perm: "businesses",
  searchKeys: ["client", "manager", "risk"], filters: [{ key: "health", label: "Health" }, { key: "priority", label: "Priority" }, { key: "manager", label: "Manager" }, { key: "status", label: "Status" }],
  titleKey: "client",
  metrics: () => {
    const b = db.businesses.getAll();
    return [
      { label: "Healthy", value: num(count(b, "health", "Healthy")), icon: HeartPulse, change: 3.2 },
      { label: "Attention Required", value: num(count(b, "health", "Attention Required")), icon: AlertTriangle },
      { label: "At Risk", value: num(count(b, "health", "At Risk")), icon: ShieldAlert, change: -12 },
      { label: "Inactive", value: num(count(b, "health", "Inactive")), icon: PauseCircle },
      { label: "Avg Feature Adoption", value: Math.round(b.reduce((a, x) => a + x.adoption, 0) / b.length) + "%", icon: CheckCircle2, change: 4.5 },
      { label: "Renewals ≤ 30 days", value: num(b.filter((x) => new Date(x.renewal).getTime() - Date.now() < 30 * 864e5).length), icon: Clock },
    ];
  },
  charts: () => [
    { title: "Health distribution", type: "pie", data: ["Healthy", "Attention Required", "At Risk", "Inactive"].map((h) => ({ label: h, value: count(db.businesses.getAll(), "health", h) })), series: [{ key: "value", label: "Businesses" }] },
    { title: "Feature adoption by module", type: "bar", data: [["Inbox", 92], ["Campaigns", 64], ["Templates", 78], ["AI Agents", 51], ["Automations", 43]].map(([label, v]) => ({ label, v })), series: [{ key: "v", label: "Adoption %" }], format: (n) => n + "%" },
  ],
  columns: [
    { key: "client", label: "Client", render: (r) => bizName({ ...r, name: r.client }) },
    { key: "health", label: "Health", render: (r) => <StatusBadge value={r.health} /> },
    { key: "risk", label: "Risk Indicator" },
    { key: "manager", label: "Assigned Manager" },
    { key: "followUp", label: "Follow-up", render: (r) => date(r.followUp) },
    { key: "priority", label: "Priority", render: prio },
    { key: "status", label: "Status", render: st },
    { key: "notes", label: "Notes", className: "max-w-60 truncate text-muted-foreground" },
  ],
  create: {
    label: "New follow-up",
    fields: () => [
      { key: "client", label: "Client", type: "select", options: db.businesses.getAll().map((b) => b.name), required: true },
      { key: "manager", label: "Assigned manager", type: "select", options: MANAGERS, required: true, half: true },
      { key: "priority", label: "Priority", type: "select", options: ["Low", "Medium", "High"], required: true, half: true },
      { key: "followUp", label: "Follow-up date", type: "date", required: true },
      { key: "risk", label: "Risk indicator", type: "select", options: ["No login for 20 days", "WhatsApp disconnected", "Subscription expiring soon", "Payment overdue", "AI quota nearly exhausted"] },
      { key: "notes", label: "Notes", type: "textarea" },
    ],
    build: (v) => ({ id: uid("FUP"), ...v, health: "Attention Required", status: "Scheduled", followUp: new Date(v.followUp).toISOString() }),
  },
  actions: [{ label: "Mark done", status: "Done" }, { label: "Reopen", status: "Open" }],
  canDelete: true,
};

export const REQ_FLOW: Record<string, string[]> = {
  New: ["Under Review", "Approved", "Rejected", "Waiting for Client"],
  "Under Review": ["Approved", "Rejected", "Waiting for Client"],
  "Waiting for Client": ["Under Review", "Rejected"],
  Approved: ["In Progress", "Completed"],
  "In Progress": ["Completed", "Waiting for Client"],
  Completed: ["Closed"],
  Rejected: ["Closed"],
  Closed: [],
};
export const TICKET_FLOW: Record<string, string[]> = {
  Open: ["In Progress", "Waiting for Client", "Resolved"],
  "In Progress": ["Waiting for Client", "Resolved"],
  "Waiting for Client": ["In Progress", "Resolved"],
  Resolved: ["Closed", "Open"],
  Closed: ["Open"],
};
const tk = (s: string) => (r: Row) => (TICKET_FLOW[r.status] ?? []).includes(s);
const REQ_ACTIONS = (["Under Review", "Approved", "Rejected", "Waiting for Client", "In Progress", "Completed", "Closed"] as const).map((s) => ({
  label: s === "Under Review" ? "Start review" : s === "Approved" ? "Approve" : s === "Rejected" ? "Reject" : s === "Waiting for Client" ? "Request more information" : s === "In Progress" ? "Mark in progress" : s === "Completed" ? "Resolve" : "Close",
  run: (r: Row) => RequestService.setStatus(r.id, s),
  confirm: s === "Rejected" ? "The client will be notified that this request was rejected (demo)." : undefined,
  destructive: s === "Rejected",
  show: (r: Row) => (REQ_FLOW[r.status] ?? []).includes(s),
}));

export const requests: ResourceConfig = {
  title: "Client Requests & Queries", description: "Commercial and account requests raised by client businesses.", collection: "requests", entity: "Request", perm: "requests",
  searchKeys: ["business", "subject", "type", "assignee"], filters: [{ key: "status", label: "Status" }, { key: "type", label: "Type" }, { key: "priority", label: "Priority" }, { key: "assignee", label: "Assignee" }],
  dateKey: "submittedAt", notes: true, titleKey: "subject",
  metrics: (r) => [
    { label: "Total Requests", value: num(r.length), icon: Inbox },
    { label: "New", value: num(count(r, "status", "New")), icon: Clock },
    { label: "Pending / In Review", value: num(r.filter((x) => ["Under Review", "Waiting for Client", "In Progress"].includes(x.status)).length), icon: AlertTriangle },
    { label: "Approved", value: num(count(r, "status", "Approved")), icon: CheckCircle2 },
    { label: "Rejected", value: num(count(r, "status", "Rejected")), icon: XCircle },
    { label: "Resolved", value: num(r.filter((x) => ["Completed", "Closed"].includes(x.status)).length), icon: CheckCircle2 },
  ],
  columns: [
    { key: "id", label: "Request ID", render: mono("id") },
    { key: "business", label: "Business", render: bizName },
    { key: "type", label: "Type" },
    { key: "subject", label: "Subject", className: "max-w-64 truncate" },
    { key: "submittedAt", label: "Submitted", render: (r) => date(r.submittedAt) },
    { key: "priority", label: "Priority", render: prio },
    { key: "assignee", label: "Assigned" },
    { key: "status", label: "Status", render: st },
  ],
  create: {
    label: "Log request",
    fields: () => [
      { key: "business", label: "Business", type: "select", options: db.businesses.getAll().map((b) => b.name), required: true },
      { key: "type", label: "Request type", type: "select", options: ["Subscription upgrade", "Subscription downgrade", "Plan cancellation", "Custom pricing", "Additional WhatsApp number", "AI token limit increase", "Additional message quota", "Feature activation", "Integration request", "Account verification", "Billing complaint", "Refund request", "Technical assistance", "General inquiry"], required: true, half: true },
      { key: "priority", label: "Priority", type: "select", options: ["Low", "Medium", "High", "Urgent"], required: true, half: true },
      { key: "assignee", label: "Assign to", type: "select", options: STAFF, required: true },
      { key: "subject", label: "Subject", required: true },
      { key: "description", label: "Description", type: "textarea", required: true },
    ],
    build: (v) => ({ id: uid("REQ"), ...v, submittedAt: new Date().toISOString(), status: "New", notes: [] }),
  },
  actions: [...REQ_ACTIONS, { label: "Reassign", fields: [{ key: "assignee", label: "Assign to", type: "select", options: STAFF, required: true }], run: (r, v) => { db.requests.update(r.id, { assignee: v!.assignee }); audit("Request reassigned", "Client request", r.id, r.assignee, v!.assignee); } }],
  detailTabs: [{ label: "Description", render: (r) => <div className="space-y-3 pt-2 text-sm"><p className="text-foreground">{r.description}</p><div className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">Attachments: request-details.pdf (demo placeholder)</div></div> }],
};

export const subscriptions: ResourceConfig = {
  title: "Subscriptions", description: "", collection: "subscriptions", entity: "Subscription", perm: "subscriptions",
  create: {
    label: "Assign plan",
    fields: () => [
      { key: "businessId", label: "Business without a subscription", type: "select", required: true, options: db.businesses.getAll().filter((b) => !db.subscriptions.getAll().some((s) => s.businessId === b.id)).map((b) => b.id + " · " + b.name) },
      { key: "plan", label: "Plan", type: "select", options: [...PLANS], required: true, half: true },
      { key: "cycle", label: "Billing cycle", type: "select", options: ["Monthly", "Annual"], required: true, half: true, default: "Monthly" },
      { key: "trial", label: "Trial days (0 = start paid)", type: "number", default: 0, min: 0 },
    ],
    build: (v) => {
      const id = String(v.businessId).split(" · ")[0];
      const b = db.businesses.get(id)!;
      const trial = Number(v.trial) || 0;
      return { id: uid("SUB"), businessId: id, business: b.name, plan: v.plan, cycle: v.cycle, amount: v.cycle === "Annual" ? PLAN_PRICE[v.plan] * 10 : PLAN_PRICE[v.plan], startDate: new Date().toISOString(), renewal: new Date(Date.now() + (trial || (v.cycle === "Annual" ? 365 : 30)) * 864e5).toISOString(), status: trial ? "Trial" : "Active", payment: trial ? "N/A" : "Unpaid" };
    },
    after: (r) => { BusinessService.changePlan(r.businessId, r.plan); BusinessService.setStatus(r.businessId, r.status === "Trial" ? "Trial" : "Active"); },
  },
  searchKeys: ["business", "plan", "id"], filters: [{ key: "status", label: "Status" }, { key: "plan", label: "Plan" }, { key: "cycle", label: "Cycle" }], titleKey: "business",
  columns: [
    { key: "business", label: "Business", render: bizName },
    { key: "plan", label: "Plan" },
    { key: "cycle", label: "Billing Cycle" },
    { key: "amount", label: "Amount", render: (r) => inr(r.amount) },
    { key: "startDate", label: "Start", render: (r) => date(r.startDate) },
    { key: "renewal", label: "Renewal", render: (r) => date(r.renewal) },
    { key: "status", label: "Status", render: st },
    { key: "payment", label: "Payment", render: (r) => <StatusBadge value={r.payment} /> },
  ],
  actions: [
    { label: "Change plan", fields: [{ key: "plan", label: "Plan", type: "select", options: [...PLANS], required: true }], run: (r, v) => { BusinessService.changePlan(r.businessId, v!.plan); } },
    { label: "Extend trial", fields: [{ key: "days", label: "Extra days", type: "number", required: true, default: 7 }], show: (r) => r.status === "Trial", run: (r, v) => { const renewal = new Date(new Date(r.renewal).getTime() + Number(v!.days) * 864e5).toISOString(); db.subscriptions.update(r.id, { renewal }); audit("Trial extended", "Subscription", r.id, date(r.renewal), date(renewal)); } },
    { label: "Custom pricing", fields: [{ key: "amount", label: "Custom amount (₹)", type: "number", required: true }], run: (r, v) => { db.subscriptions.update(r.id, { amount: Number(v!.amount) }); audit("Custom pricing", "Subscription", r.id, inr(r.amount), inr(Number(v!.amount))); } },
    { label: "Renew", show: (r) => ["Expired", "Past Due", "Cancelled"].includes(r.status), run: (r) => { const renewal = new Date(Date.now() + (r.cycle === "Annual" ? 365 : 30) * 864e5).toISOString(); db.subscriptions.update(r.id, { status: "Active", payment: "Paid", renewal }); audit("Subscription renewed", "Subscription", r.id, r.status, "Active"); } },
    { label: "Cancel", show: (r) => !["Cancelled", "Expired"].includes(r.status), confirm: "Cancels the subscription (demo).", destructive: true, run: (r) => { db.subscriptions.update(r.id, { status: "Cancelled" }); db.businesses.update(r.businessId, { mrr: 0 }); audit("Subscription cancelled", "Subscription", r.id, r.status, "Cancelled"); } },
  ],
};

export const payments: ResourceConfig = {
  title: "Payments & Revenue", description: "Transactions and revenue performance. No real money moves in this demo.", collection: "transactions", entity: "Transaction", perm: "finance",
  searchKeys: ["business", "invoice", "id"], filters: [{ key: "status", label: "Status" }, { key: "method", label: "Method" }], dateKey: "date", titleKey: "invoice",
  metrics: (r) => {
    const ok = r.filter((x) => x.status === "Succeeded").reduce((a, b) => a + b.amount, 0);
    const mrr = db.businesses.getAll().reduce((a, b) => a + (b.mrr || 0), 0);
    return [
      { label: "Total Revenue", value: inr(ok * 6.2), icon: IndianRupee, change: 14.2 },
      { label: "MRR", value: inr(mrr), icon: IndianRupee, change: 9.8 },
      { label: "ARR", value: inr(mrr * 12), icon: IndianRupee },
      { label: "New Revenue", value: inr(ok * 0.3), change: 6.1 },
      { label: "Refunds", value: inr(r.filter((x) => x.status === "Refunded").reduce((a, b) => a + b.amount, 0)), icon: RotateCcw },
      { label: "Failed Payments", value: num(count(r, "status", "Failed")), icon: AlertTriangle, change: -3 },
    ];
  },
  charts: () => [
    { title: "Revenue trend", type: "area", data: series(MONTHS, { revenue: [180000, 14000] }, 3), series: [{ key: "revenue", label: "Revenue" }], format: (n) => "₹" + compact(n) },
    { title: "Revenue by plan", type: "bar", data: PLANS.map((p) => ({ label: p, v: db.businesses.getAll().filter((b) => b.plan === p).reduce((a, b) => a + b.mrr, 0) })), series: [{ key: "v", label: "MRR" }], format: (n) => "₹" + compact(n) },
  ],
  columns: [
    { key: "id", label: "Transaction ID", render: mono("id") },
    { key: "business", label: "Business", render: bizName },
    { key: "invoice", label: "Invoice", render: mono("invoice") },
    { key: "amount", label: "Amount", render: (r) => inr(r.amount) },
    { key: "currency", label: "Currency" },
    { key: "method", label: "Method" },
    { key: "date", label: "Date", render: (r) => date(r.date) },
    { key: "status", label: "Status", render: st },
  ],
  actions: [{ label: "Refund (demo)", status: "Refunded", confirm: "Marks this transaction as refunded locally. No payment gateway is called.", destructive: true, show: (r) => r.status === "Succeeded" }],
};

export const offers: ResourceConfig = {
  title: "Custom Offers & Coupons", description: "Promotions, coupon codes and business-specific deals.", collection: "offers", entity: "Offer", perm: "subscriptions",
  searchKeys: ["name", "code", "audience"], filters: [{ key: "status", label: "Status" }, { key: "type", label: "Type" }],
  derive: (r) => (r.status === "Active" || r.status === "Paused") && new Date(r.expiry).getTime() < Date.now() ? { ...r, status: "Expired" } : r,
  metrics: (r) => [
    { label: "Active Offers", value: num(count(r, "status", "Active")), icon: TicketPercent },
    { label: "Total Redemptions", value: num(r.reduce((a, b) => a + b.redemptions, 0)), change: 18 },
    { label: "Paused", value: num(count(r, "status", "Paused")) },
    { label: "Expired", value: num(count(r, "status", "Expired")) },
  ],
  columns: [
    { key: "name", label: "Offer Name", render: (r) => <span className="font-medium">{r.name}</span> },
    { key: "code", label: "Code", render: (r) => <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">{r.code}</span> },
    { key: "type", label: "Type" },
    { key: "audience", label: "Target Audience" },
    { key: "discount", label: "Discount" },
    { key: "startDate", label: "Start", render: (r) => date(r.startDate) },
    { key: "expiry", label: "Expiry", render: (r) => date(r.expiry) },
    { key: "redemptions", label: "Redemptions", render: (r) => `${r.redemptions} / ${r.maxRedemptions}` },
    { key: "status", label: "Status", render: st },
  ],
  create: {
    label: "Create offer",
    fields: [
      { key: "name", label: "Offer name", required: true }, { key: "code", label: "Coupon code", required: true, half: true },
      { key: "type", label: "Offer type", type: "select", options: ["Percentage", "Flat", "Bonus Tokens", "Trial Extension", "Custom Price"], required: true, half: true },
      { key: "discount", label: "Discount value", required: true, half: true, placeholder: "20% / ₹500 / 100K tokens" },
      { key: "audience", label: "Target", type: "select", options: ["All businesses", "Starter plan", "Growth plan", "Business plan", "Enterprise plan", "Selected businesses"], required: true, half: true },
      { key: "expiry", label: "Expiry date", type: "date", required: true, half: true },
      { key: "maxRedemptions", label: "Maximum redemptions", type: "number", default: 100, half: true, min: 1 },
      { key: "description", label: "Internal notes", type: "textarea" },
    ],
    validate: (v) => {
      const e: Record<string, string> = {};
      if (v.code && db.offers.getAll().some((o) => o.code === String(v.code).toUpperCase())) e.code = "This coupon code already exists";
      if (v.code && !/^[A-Za-z0-9_-]{3,20}$/.test(v.code)) e.code = "3–20 letters, numbers, - or _";
      if (v.expiry && new Date(v.expiry).getTime() < Date.now()) e.expiry = "Expiry must be in the future";
      return e;
    },
    build: (v) => ({ id: uid("OFF"), ...v, code: String(v.code).toUpperCase(), startDate: new Date().toISOString(), expiry: new Date(v.expiry).toISOString(), redemptions: 0, maxRedemptions: Number(v.maxRedemptions) || 100, status: "Active" }),
  },
  edit: [{ key: "name", label: "Offer name", required: true }, { key: "discount", label: "Discount value", required: true }, { key: "expiry", label: "Expiry (ISO date)", required: true }, { key: "maxRedemptions", label: "Maximum redemptions", type: "number", min: 1 }],
  actions: [
    { label: "Duplicate", run: (r) => { db.offers.insert({ ...r, id: uid("OFF"), name: r.name + " (copy)", code: r.code + "C", redemptions: 0, status: "Paused" }); audit("Offer duplicated", "Offer", r.id); } },
    { label: "Pause", status: "Paused", show: (r) => r.status === "Active" },
    { label: "Activate", status: "Active", show: (r) => r.status !== "Active" && new Date(r.expiry).getTime() > Date.now() },
    { label: "Extend expiry", fields: [{ key: "expiry", label: "New expiry", type: "date", required: true }], run: (r, v) => { const next = new Date(v!.expiry).toISOString(); db.offers.update(r.id, { expiry: next, status: r.status === "Archived" ? "Archived" : "Active" }); audit("Offer expiry changed", "Offer", r.id, date(r.expiry), date(next)); } },
    { label: "Archive", status: "Archived", destructive: true, confirm: "Archived offers can no longer be redeemed.", show: (r) => r.status !== "Archived" },
  ],
  canDelete: true,
};

export const templates: ResourceConfig = {
  title: "Templates Management", description: "Genie global library, business-specific and Meta-approved templates — clearly separated.", collection: "templates", entity: "Template", perm: "whatsapp",
  searchKeys: ["name", "internalName", "category", "body"], filters: [{ key: "library", label: "Library" }, { key: "category", label: "Category" }, { key: "status", label: "Status" }, { key: "language", label: "Language" }],
  metrics: (r) => [
    { label: "Genie Global", value: num(count(r, "library", "Genie Global")), icon: FileText },
    { label: "Business-specific", value: num(count(r, "library", "Business-specific")) },
    { label: "Meta-approved (synced)", value: num(count(r, "library", "Meta-approved")), icon: CheckCircle2 },
    { label: "Drafts", value: num(count(r, "status", "Draft")) },
  ],
  columns: [
    { key: "name", label: "Template", render: (r) => <span className="font-medium">{r.name}</span> },
    { key: "internalName", label: "Internal Name", render: mono("internalName") },
    { key: "library", label: "Library", render: (r) => <StatusBadge value={r.library} /> },
    { key: "category", label: "Category" },
    { key: "language", label: "Language" },
    { key: "status", label: "Approval", render: st },
    { key: "createdAt", label: "Created", render: (r) => date(r.createdAt) },
  ],
  create: {
    label: "New template",
    fields: [
      { key: "name", label: "Template name", required: true, half: true }, { key: "internalName", label: "Internal name", required: true, half: true, placeholder: "order_update" },
      { key: "category", label: "Category", type: "select", options: ["Welcome", "Marketing", "Utility", "Authentication", "Notifications", "Support", "Appointment Reminders", "Payment Notifications"], required: true, half: true },
      { key: "language", label: "Language", type: "select", options: ["English", "Hindi", "Marathi", "Tamil"], required: true, half: true },
      { key: "header", label: "Header" }, { key: "body", label: "Message body", type: "textarea", required: true, placeholder: "Hi {{1}}, …" },
      { key: "footer", label: "Footer" }, { key: "buttons", label: "Buttons (comma separated)" },
    ],
    build: (v) => ({ id: uid("TPL"), ...v, library: "Genie Global", status: "Draft", createdAt: new Date().toISOString() }),
  },
  edit: [{ key: "name", label: "Template name", required: true }, { key: "header", label: "Header" }, { key: "body", label: "Message body", type: "textarea", required: true }, { key: "footer", label: "Footer" }, { key: "buttons", label: "Buttons" }],
  actions: [
    { label: "Mark pending submission", status: "Pending Submission", show: (r) => r.status === "Draft" },
    { label: "Duplicate", run: (r) => { db.templates.insert({ ...r, id: uid("TPL"), name: r.name + " (copy)", status: "Draft", library: "Genie Global" }); audit("Template duplicated", "Template", r.id); } },
    { label: "Assign to businesses", fields: () => [{ key: "business", label: "Business", type: "select", options: db.businesses.getAll().map((b) => b.name), required: true }], run: (r, v) => audit("Template assigned", "Template", r.id, "—", v!.business), toast: "Template assigned (demo)" },
    { label: "Pause", status: "Paused", show: (r) => r.status === "Approved" },
    { label: "Archive", status: "Archived", destructive: true, confirm: "Archived templates are hidden from businesses." },
  ],
  canDelete: true,
  detailTabs: [{ label: "Preview", render: (r) => <TemplatePreview t={r} /> }],
};

export const aiTokens: ResourceConfig = {
  title: "AI Token Management", description: "Subscription allowance and bonus tokens are tracked separately. Costs are estimates, not provider bills.", collection: "tokens", entity: "Token account", perm: "ai",
  searchKeys: ["business", "plan"], filters: [{ key: "plan", label: "Plan" }, { key: "status", label: "Status" }], titleKey: "business",
  metrics: (r) => {
    const consumed = r.reduce((a, b) => a + b.consumed, 0);
    return [
      { label: "Tokens Consumed", value: compact(consumed), icon: Coins, change: 21.4 },
      { label: "Input Tokens", value: compact(r.reduce((a, b) => a + b.input, 0)) },
      { label: "Output Tokens", value: compact(r.reduce((a, b) => a + b.output, 0)) },
      { label: "Est. AI Cost", value: inr(consumed * 0.00042), hint: "estimate", icon: IndianRupee },
      { label: "Active AI Businesses", value: num(r.filter((x) => x.aiEnabled).length), icon: Cpu },
      { label: "Requests Today", value: num(18420), change: 6.3 },
    ];
  },
  charts: (r) => [
    { title: "Daily token consumption", type: "stacked", data: series(Array.from({ length: 14 }, (_, i) => `${i + 1} Nov`.replace(/^(\d+) Nov/, (m, d) => `${(Number(d) + 23) % 30 + 1}`)), { input: [1800000, 30000], output: [1100000, 20000] }, 5), series: [{ key: "input", label: "Input" }, { key: "output", label: "Output" }] },
    { title: "Consumption by plan", type: "pie", data: PLANS.map((p) => ({ label: p, v: r.filter((x) => x.plan === p).reduce((a, b) => a + b.consumed, 0) })), series: [{ key: "v", label: "Tokens" }] },
  ],
  columns: [
    { key: "business", label: "Business", render: bizName },
    { key: "plan", label: "Plan" },
    { key: "allowance", label: "Monthly Allowance", render: (r) => compact(r.allowance) },
    { key: "bonus", label: "Bonus", render: (r) => (!r.bonus ? "—" : bonusLive(r) ? <span className="font-medium text-success">+{compact(r.bonus)}</span> : <span className="text-muted-foreground line-through" title="Bonus expired">+{compact(r.bonus)}</span>) },
    { key: "consumed", label: "Consumed", render: (r) => compact(r.consumed) },
    { key: "remaining", label: "Remaining", sortable: false, render: (r) => compact(Math.max(0, r.allowance + (bonusLive(r) ? r.bonus : 0) - r.consumed)) },
    { key: "usage", label: "Usage", sortable: false, render: (r) => <UsageBar value={Math.round((r.consumed / Math.max(1, r.allowance + (bonusLive(r) ? r.bonus : 0))) * 100)} /> },
    { key: "status", label: "Status", render: (r) => <StatusBadge value={r.aiEnabled ? r.status : "Disabled"} /> },
  ],
  actions: [
    ...(["Add bonus", "Deduct bonus", "Increase allocation", "Decrease allocation", "Set custom limit"] as const).map((kind) => ({
      label: kind === "Add bonus" ? "Add bonus tokens" : kind === "Deduct bonus" ? "Deduct tokens" : kind,
      fields: [
        { key: "amount", label: kind === "Set custom limit" ? "New monthly limit" : "Tokens", type: "number" as const, required: true, min: 1 },
        ...(kind === "Add bonus" ? [{ key: "expiry", label: "Bonus expiry", type: "date" as const, required: true }] : []),
        { key: "reason", label: "Reason (audited)", type: "textarea" as const, required: true },
      ],
      run: (r: Row, v?: Record<string, any>) => TokenService.adjust(r.id, kind, Number(v!.amount), v!.reason, v!.expiry ? new Date(v!.expiry).toISOString() : undefined),
    })),
    { label: "Disable AI access", run: (r) => { db.tokens.update(r.id, { aiEnabled: false }); audit("AI access disabled", "AI Tokens", r.id, "Enabled", "Disabled"); }, show: (r) => r.aiEnabled, destructive: true, confirm: "AI agents for this business will stop responding (demo)." },
    { label: "Enable AI access", run: (r) => { db.tokens.update(r.id, { aiEnabled: true }); audit("AI access enabled", "AI Tokens", r.id, "Disabled", "Enabled"); }, show: (r) => !r.aiEnabled },
  ],
  detailTabs: [
    {
      label: "Adjustments",
      render: (r) => (
        <div className="space-y-2 pt-2">
          <p className="text-xs text-muted-foreground">Bonus expires {date(r.bonusExpiry)} · allowance resets {date(r.resetDate)}</p>
          {(r.adjustments ?? []).map((a: any, i: number) => (
            <div key={i} className="flex items-start justify-between rounded-md border p-3 text-sm">
              <div><p className="font-medium text-foreground">{a.kind}</p><p className="text-xs text-muted-foreground">{a.reason} · {a.by} · {dateTime(a.at)}</p></div>
              <span className={a.delta >= 0 ? "font-semibold text-success" : "font-semibold text-destructive"}>{a.delta >= 0 ? "+" : ""}{num(a.delta)}</span>
            </div>
          ))}
          {!(r.adjustments ?? []).length && <p className="text-xs text-muted-foreground">No manual adjustments yet.</p>}
        </div>
      ),
    },
    { label: "Usage", render: (r) => <Chart spec={{ title: "", type: "bar", data: series(["gpt-5-mini", "claude-sonnet", "gemini-flash"], { v: [r.consumed / 3, 0] }, 2), series: [{ key: "v", label: "Tokens by model" }] }} height={200} /> },
  ],
};

export const whatsapp: ResourceConfig = {
  title: "WhatsApp Management", description: "WABA accounts and phone numbers across all businesses. Access tokens are never displayed.", collection: "whatsapp", entity: "WhatsApp account", perm: "whatsapp",
  searchKeys: ["business", "wabaId", "phone"], filters: [{ key: "status", label: "Status" }, { key: "quality", label: "Quality" }, { key: "webhook", label: "Webhook" }], titleKey: "business",
  metrics: (r) => [
    { label: "WABA Accounts", value: num(r.length), icon: MessageCircle },
    { label: "Connected", value: num(count(r, "status", "Connected")), icon: CheckCircle2 },
    { label: "Disconnected", value: num(count(r, "status", "Disconnected")), icon: Link2Off },
    { label: "Pending", value: num(count(r, "status", "Pending")), icon: Clock },
    { label: "Failed", value: num(count(r, "status", "Failed")), icon: XCircle },
  ],
  columns: [
    { key: "business", label: "Business", render: bizName },
    { key: "wabaId", label: "WABA ID", render: mono("wabaId") },
    { key: "phone", label: "Phone Number", className: "font-mono text-xs" },
    { key: "phoneNumberId", label: "Phone Number ID", render: mono("phoneNumberId") },
    { key: "status", label: "Connection", render: st },
    { key: "webhook", label: "Webhook", render: (r) => <StatusBadge value={r.webhook} /> },
    { key: "quality", label: "Quality", render: (r) => <StatusBadge value={r.quality} /> },
    { key: "tokenExpiry", label: "Token Expiry", render: (r) => date(r.tokenExpiry) },
    { key: "lastActivity", label: "Last Activity", render: (r) => relative(r.lastActivity) },
  ],
  actions: [
    { label: "Mark reconnected", status: "Connected", show: (r) => r.status !== "Connected" },
    { label: "Mark disconnected", status: "Disconnected", destructive: true, confirm: "Records a manual disconnection in the demo log." },
  ],
  detailTabs: [{ label: "Delivery", render: (r) => <Chart spec={{ title: "", type: "bar", data: series(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"], { sent: [r.sent / 30, 0], failed: [r.sent / 900, 0] }, 4), series: [{ key: "sent", label: "Delivered" }, { key: "failed", label: "Failed" }] }} height={200} /> }],
};

export const aiProviders: ResourceConfig = {
  title: "AI Providers", description: "Demonstration provider records. API keys are never exposed in the browser.", collection: "providers", entity: "Provider", perm: "ai",
  searchKeys: ["name", "model"], filters: [{ key: "status", label: "Status" }],
  metrics: (r) => [
    { label: "Providers", value: num(r.length), icon: Cpu },
    { label: "Connected", value: num(count(r, "status", "Connected")), icon: CheckCircle2 },
    { label: "Degraded", value: num(count(r, "status", "Degraded")), icon: AlertTriangle },
    { label: "Default", value: r.find((x) => x.isDefault === "Yes")?.name ?? "—" },
  ],
  columns: [
    { key: "name", label: "Provider", render: (r) => <span className="font-medium">{r.name}</span> },
    { key: "model", label: "Model", render: mono("model") },
    { key: "status", label: "Connection", render: st },
    { key: "isDefault", label: "Default", render: (r) => <StatusBadge value={r.isDefault} /> },
    { key: "rateLimit", label: "Rate Limit" },
    { key: "pricing", label: "Pricing (est.)", className: "text-xs text-muted-foreground" },
    { key: "lastChecked", label: "Last Checked", render: (r) => relative(r.lastChecked) },
  ],
  edit: [{ key: "model", label: "Default model", required: true }, { key: "rateLimit", label: "Rate limit" }, { key: "pricing", label: "Pricing configuration" }],
  actions: [
    { label: "Set as default", show: (r) => r.isDefault !== "Yes", run: (r) => { db.providers.getAll().forEach((p) => db.providers.update(p.id, { isDefault: p.id === r.id ? "Yes" : "No" })); audit("Default AI provider changed", "AI provider", r.id, "—", r.name); } },
    { label: "Run health check", run: (r) => db.providers.update(r.id, { lastChecked: new Date().toISOString() }), toast: "Health check simulated" },
  ],
};

export const automations: ResourceConfig = {
  title: "Automation Monitoring", description: "Workflows running across every client business.", collection: "automations", entity: "Workflow", perm: "operations",
  searchKeys: ["workflow", "business", "trigger"], filters: [{ key: "status", label: "Status" }, { key: "trigger", label: "Trigger" }], titleKey: "workflow",
  metrics: (r) => [
    { label: "Active Workflows", value: num(count(r, "status", "Active")), icon: Workflow },
    { label: "Total Executions", value: compact(r.reduce((a, b) => a + b.executions, 0)), change: 12.2 },
    { label: "Successful", value: compact(r.reduce((a, b) => a + Math.round((b.executions * b.successRate) / 100), 0)), icon: CheckCircle2 },
    { label: "Failed", value: num(r.reduce((a, b) => a + b.failed, 0)), icon: XCircle },
    { label: "Pending", value: num(37), icon: Clock },
    { label: "Retried", value: num(112), icon: RotateCcw },
  ],
  columns: [
    { key: "workflow", label: "Workflow", render: (r) => <span className="font-medium">{r.workflow}</span> },
    { key: "business", label: "Business" },
    { key: "trigger", label: "Trigger" },
    { key: "executions", label: "Executions", render: (r) => num(r.executions) },
    { key: "successRate", label: "Success", render: (r) => <UsageBar value={r.successRate} /> },
    { key: "lastRun", label: "Last Execution", render: (r) => relative(r.lastRun) },
    { key: "status", label: "Status", render: st },
  ],
  actions: [
    { label: "Retry failed executions", show: (r) => r.failed > 0, run: (r) => { db.automations.update(r.id, { failed: 0, status: "Active" }); audit("Executions retried", "Workflow", r.id, `${r.failed} failed`, "0 failed"); } },
    { label: "Pause", status: "Paused", show: (r) => r.status === "Active" },
    { label: "Resume", status: "Active", show: (r) => r.status !== "Active" },
  ],
  detailTabs: [{
    label: "Last execution",
    render: (r) => (
      <ol className="space-y-2 pt-2">
        {["Trigger received", "Condition", r.failedNode, "Send reply"].map((s, i) => (
          <li key={i} className="flex items-center justify-between rounded-md border p-3 text-sm">
            <span>{i + 1}. {s}</span>
            <StatusBadge value={r.failed && s === r.failedNode ? "Failed" : r.failed && i > 2 ? "Pending" : "Completed"} />
          </li>
        ))}
        {r.failed > 0 && <p className="rounded-md bg-destructive/10 p-3 font-mono text-xs text-destructive">{r.error}</p>}
      </ol>
    ),
  }],
};

export const integrations: ResourceConfig = {
  title: "Integrations", description: "Third-party services the platform depends on.", collection: "integrations", entity: "Integration", perm: "operations",
  searchKeys: ["name", "category"], filters: [{ key: "category", label: "Category" }, { key: "status", label: "Status" }],
  columns: [
    { key: "name", label: "Provider", render: (r) => <span className="font-medium">{r.name}</span> },
    { key: "category", label: "Category" },
    { key: "config", label: "Configuration", render: (r) => <StatusBadge value={r.config} /> },
    { key: "status", label: "Connection", render: st },
    { key: "lastSync", label: "Last Sync", render: (r) => relative(r.lastSync) },
    { key: "errors", label: "Errors (7d)" },
  ],
  actions: [{ label: "Sync now", run: (r) => db.integrations.update(r.id, { lastSync: new Date().toISOString() }), toast: "Sync simulated" }, { label: "Disconnect", status: "Disconnected", destructive: true, confirm: "Simulates disconnecting this integration." }, { label: "Reconnect", status: "Connected", show: (r) => r.status !== "Connected" }],
};

export const apiManagement: ResourceConfig = {
  title: "API Management", description: "Platform API keys, usage and webhooks. Only key prefixes are ever shown.", collection: "apiKeys", entity: "API key", perm: "settings",
  searchKeys: ["name", "scope", "prefix"], filters: [{ key: "status", label: "Status" }, { key: "scope", label: "Scope" }],
  metrics: () => [
    { label: "Requests (30d)", value: "1.56M", icon: KeyRound, change: 7.4 },
    { label: "Success Rate", value: "99.42%", icon: CheckCircle2 },
    { label: "Error Rate", value: "0.58%", icon: AlertTriangle, change: -0.2 },
    { label: "Rate Limit", value: "600 / min" },
  ],
  charts: () => [{ title: "API request volume", type: "area", data: series(Array.from({ length: 14 }, (_, i) => `D${i + 1}`), { ok: [48000, 600], err: [300, 4] }, 8), series: [{ key: "ok", label: "Successful" }, { key: "err", label: "Errors" }] }],
  columns: [
    { key: "name", label: "Key name", render: (r) => <span className="font-medium">{r.name}</span> },
    { key: "prefix", label: "Key", render: mono("prefix") },
    { key: "scope", label: "Scope" },
    { key: "created", label: "Created", render: (r) => date(r.created) },
    { key: "lastUsed", label: "Last Used", render: (r) => relative(r.lastUsed) },
    { key: "requests", label: "Requests", render: (r) => compact(r.requests) },
    { key: "status", label: "Status", render: st },
  ],
  create: { label: "Create key", fields: [{ key: "name", label: "Key name", required: true }, { key: "scope", label: "Scope", type: "select", options: ["Full access", "Read only", "Webhooks"], required: true }], build: (v) => ({ id: uid("KEY"), ...v, prefix: `gn_live_${Math.random().toString(16).slice(2, 6)}••••`, created: new Date().toISOString(), lastUsed: new Date().toISOString(), requests: 0, status: "Active" }) },
  actions: [
    { label: "Rotate", show: (r) => r.status === "Active", run: (r) => { db.apiKeys.update(r.id, { prefix: `${r.prefix.slice(0, 8)}${Math.random().toString(16).slice(2, 6)}••••` }); audit("API key rotated", "API key", r.id); } },
    { label: "Revoke", status: "Revoked", destructive: true, confirm: "Requests using this key will fail immediately (demo)." },
  ],
};

export const tickets: ResourceConfig = {
  title: "Customer Support Tickets", description: "Technical and product support — separate from commercial client requests.", collection: "tickets", entity: "Ticket", perm: "support",
  searchKeys: ["subject", "business", "assignee", "category"], filters: [{ key: "status", label: "Status" }, { key: "category", label: "Category" }, { key: "priority", label: "Priority" }, { key: "assignee", label: "Assignee" }],
  dateKey: "updatedAt", titleKey: "subject", notes: true,
  metrics: (r) => [
    { label: "Open", value: num(count(r, "status", "Open")), icon: Ticket },
    { label: "In Progress", value: num(count(r, "status", "In Progress")) },
    { label: "Waiting for Client", value: num(count(r, "status", "Waiting for Client")) },
    { label: "Resolved", value: num(count(r, "status", "Resolved")), icon: CheckCircle2 },
    { label: "Avg First Response", value: "42m", change: -8 },
    { label: "CSAT", value: "94%", change: 2 },
  ],
  columns: [
    { key: "id", label: "Ticket ID", render: mono("id") },
    { key: "business", label: "Business", render: bizName },
    { key: "subject", label: "Subject", className: "max-w-64 truncate" },
    { key: "category", label: "Category" },
    { key: "priority", label: "Priority", render: prio },
    { key: "assignee", label: "Assigned" },
    { key: "status", label: "Status", render: st },
    { key: "updatedAt", label: "Last Updated", render: (r) => relative(r.updatedAt) },
  ],
  actions: [
    { label: "Mark in progress", status: "In Progress", show: tk("In Progress") },
    { label: "Waiting for client", status: "Waiting for Client", show: tk("Waiting for Client") },
    { label: "Resolve", status: "Resolved", show: tk("Resolved") },
    { label: "Close", status: "Closed", show: tk("Closed") },
    { label: "Reopen", status: "Open", show: tk("Open") },
    { label: "Reassign", fields: [{ key: "assignee", label: "Assign to", type: "select", options: STAFF, required: true }], run: (r, v) => { db.tickets.update(r.id, { assignee: v!.assignee }); audit("Ticket reassigned", "Ticket", r.id, r.assignee, v!.assignee); } },
  ],
  detailTabs: [{ label: "Conversation", render: (r) => <TicketThread ticketId={r.id} /> }],
};

export const announcements: ResourceConfig = {
  title: "Announcements", description: "Platform-wide notices published to client dashboards.", collection: "announcements", entity: "Announcement", perm: "communication",
  searchKeys: ["title", "type", "target"], filters: [{ key: "status", label: "Status" }, { key: "type", label: "Type" }, { key: "target", label: "Target" }], titleKey: "title",
  columns: [
    { key: "title", label: "Title", render: (r) => <span className="flex items-center gap-2 font-medium"><Megaphone className="size-4 text-muted-foreground" />{r.title}</span> },
    { key: "type", label: "Type" },
    { key: "target", label: "Target" },
    { key: "publishAt", label: "Publish", render: (r) => dateTime(r.publishAt) },
    { key: "status", label: "Status", render: st },
  ],
  create: {
    label: "New announcement",
    fields: [
      { key: "title", label: "Title", required: true },
      { key: "type", label: "Type", type: "select", options: ["Platform announcement", "Maintenance notice", "Feature release", "Service interruption notice", "Promotional announcement"], required: true, half: true },
      { key: "target", label: "Target", type: "select", options: ["All businesses", "Starter plan", "Growth plan", "Business plan", "Enterprise plan", "Selected businesses"], required: true, half: true },
      { key: "publishAt", label: "Publish date", type: "date", required: true },
      { key: "body", label: "Message", type: "textarea", required: true },
    ],
    build: (v) => ({ id: uid("ANN"), ...v, publishAt: new Date(v.publishAt).toISOString(), status: new Date(v.publishAt).getTime() > Date.now() ? "Scheduled" : "Published" }),
  },
  edit: [{ key: "title", label: "Title", required: true }, { key: "body", label: "Message", type: "textarea" }],
  actions: [{ label: "Publish now", status: "Published", show: (r) => r.status !== "Published" }, { label: "Unpublish", status: "Draft", show: (r) => r.status === "Published" }],
  canDelete: true,
  detailTabs: [{ label: "Message", render: (r) => <p className="pt-2 text-sm text-foreground">{r.body}</p> }],
};

export const notifications: ResourceConfig = {
  title: "Notifications", description: "Admin alerts for registrations, payments, incidents and more.", collection: "notifications", entity: "Notification", perm: "dashboard",
  searchKeys: ["type", "message"], filters: [{ key: "type", label: "Type" }], titleKey: "type",
  columns: [
    { key: "read", label: "", sortable: false, render: (r) => <span className={r.read ? "block size-2 rounded-full bg-border" : "block size-2 rounded-full bg-primary"} aria-label={r.read ? "Read" : "Unread"} />, csv: false },
    { key: "type", label: "Type", render: (r) => <span className={r.read ? "" : "font-semibold"}>{r.type}</span> },
    { key: "message", label: "Message", className: "text-muted-foreground" },
    { key: "at", label: "Received", render: (r) => relative(r.at) },
  ],
  actions: [
    { label: "Mark as read", show: (r) => !r.read, run: (r) => db.notifications.update(r.id, { read: true }), toast: "Marked as read" },
    { label: "Mark as unread", show: (r) => r.read, run: (r) => db.notifications.update(r.id, { read: false }), toast: "Marked as unread" },
  ],
  canDelete: true,
};

export const systemMonitoring: ResourceConfig = {
  title: "System Monitoring", description: "Simulated platform health. Values are demo indicators, not live probes.", collection: "services", entity: "Service", perm: "operations",
  searchKeys: ["name"], filters: [{ key: "status", label: "Status" }],
  metrics: (r) => [
    { label: "Operational", value: `${count(r, "status", "Operational")} / ${r.length}`, icon: Server },
    { label: "Degraded", value: num(count(r, "status", "Degraded")), icon: AlertTriangle },
    { label: "Avg Response", value: Math.round(r.reduce((a, b) => a + b.responseMs, 0) / r.length) + " ms" },
    { label: "Open Incidents", value: "1", icon: ShieldAlert },
  ],
  charts: () => [{ title: "API response time (ms)", type: "line", data: series(Array.from({ length: 24 }, (_, i) => `${i}:00`), { p50: [80, 0], p95: [240, 1] }, 9), series: [{ key: "p50", label: "p50" }, { key: "p95", label: "p95" }], format: (n) => n + "ms" }],
  columns: [
    { key: "name", label: "Service", render: (r) => <span className="font-medium">{r.name}</span> },
    { key: "status", label: "Status", render: st },
    { key: "responseMs", label: "Response", render: (r) => `${r.responseMs} ms` },
    { key: "uptime", label: "Uptime (30d)" },
    { key: "errorRate", label: "Error Rate" },
    { key: "lastChecked", label: "Last Checked", render: (r) => relative(r.lastChecked) },
  ],
  actions: [{ label: "Re-check", run: (r) => db.services.update(r.id, { lastChecked: new Date().toISOString() }), toast: "Check simulated" }, { label: "Mark operational", status: "Operational" }, { label: "Declare degraded", status: "Degraded" }],
};

export const errorLogs: ResourceConfig = {
  title: "Error Logs", description: "Platform errors grouped by service.", collection: "errorLogs", entity: "Error", perm: "operations",
  searchKeys: ["message", "service", "business"], filters: [{ key: "severity", label: "Severity" }, { key: "service", label: "Service" }, { key: "status", label: "Status" }], dateKey: "at", titleKey: "message",
  metrics: (r) => [
    { label: "Open errors", value: num(count(r, "status", "Open")), icon: Bug },
    { label: "Critical", value: num(count(r, "severity", "Critical")), icon: ShieldAlert },
    { label: "Acknowledged", value: num(count(r, "status", "Acknowledged")) },
    { label: "Resolved", value: num(count(r, "status", "Resolved")), icon: CheckCircle2 },
  ],
  columns: [
    { key: "id", label: "ID", render: mono("id") },
    { key: "message", label: "Message", className: "max-w-80 truncate font-mono text-xs" },
    { key: "service", label: "Service" },
    { key: "severity", label: "Severity", render: (r) => <StatusBadge value={r.severity} /> },
    { key: "business", label: "Business" },
    { key: "at", label: "Time", render: (r) => relative(r.at) },
    { key: "status", label: "Status", render: st },
  ],
  actions: [{ label: "Acknowledge", status: "Acknowledged" }, { label: "Resolve", status: "Resolved" }],
};

export const activityLogs: ResourceConfig = {
  title: "Activity Logs", description: "What staff have been doing in the console.", collection: "activity", entity: "Activity", perm: "operations",
  searchKeys: ["actor", "action", "target"], filters: [{ key: "actor", label: "Staff" }, { key: "action", label: "Action" }], dateKey: "at", titleKey: "action",
  columns: [
    { key: "actor", label: "Staff", render: (r) => <span className="flex items-center gap-2"><Avatar name={r.actor} className="size-6 text-[9px]" />{r.actor}</span> },
    { key: "action", label: "Action" },
    { key: "target", label: "Target" },
    { key: "ip", label: "IP", render: mono("ip") },
    { key: "at", label: "Time", render: (r) => dateTime(r.at) },
  ],
};

export const adminUsers: ResourceConfig = {
  title: "Admin Users", description: "Genie staff with console access. Least-privilege by default.", collection: "admins", entity: "Admin user", perm: "settings",
  searchKeys: ["name", "email", "role"], filters: [{ key: "role", label: "Role" }, { key: "status", label: "Status" }],
  metrics: (r) => [
    { label: "Staff", value: num(r.length), icon: Users },
    { label: "Active", value: num(count(r, "status", "Active")) },
    { label: "MFA enabled", value: `${count(r, "mfa", "Enabled")} / ${r.length}`, icon: ShieldAlert },
    { label: "Active sessions", value: num(r.reduce((a, b) => a + b.sessions, 0)) },
  ],
  columns: [
    { key: "name", label: "Name", render: (r) => <span className="flex items-center gap-2.5"><Avatar name={r.name} className="size-7 text-[10px]" /><span className="font-medium">{r.name}</span></span> },
    { key: "email", label: "Email", className: "text-muted-foreground" },
    { key: "role", label: "Role" },
    { key: "mfa", label: "MFA", render: (r) => <StatusBadge value={r.mfa} /> },
    { key: "lastActive", label: "Last Active", render: (r) => relative(r.lastActive) },
    { key: "sessions", label: "Sessions" },
    { key: "status", label: "Status", render: st },
  ],
  create: {
    label: "Invite staff",
    fields: [{ key: "name", label: "Full name", required: true }, { key: "email", label: "Work email", type: "email", required: true }, { key: "role", label: "Role", type: "select", options: ["Support Staff", "Finance Staff", "Operations Staff", "Super Admin"], required: true, default: "Support Staff" }],
    build: (v) => ({ id: uid("ADM"), ...v, status: "Invited", mfa: "Disabled", lastActive: new Date().toISOString(), sessions: 0 }),
  },
  edit: [{ key: "name", label: "Full name", required: true }, { key: "email", label: "Email", type: "email", required: true }],
  actions: [
    { label: "Change role", fields: [{ key: "role", label: "Role", type: "select", options: ["Support Staff", "Finance Staff", "Operations Staff", "Super Admin"], required: true }], run: (r, v) => { db.admins.update(r.id, { role: v!.role }); audit("Role change", "Admin user", r.id, r.role, v!.role); } },
    { label: "Revoke sessions", run: (r) => { db.admins.update(r.id, { sessions: 0 }); audit("Sessions revoked", "Admin user", r.id, `${r.sessions}`, "0"); }, show: (r) => r.sessions > 0 },
    { label: "Deactivate", status: "Inactive", destructive: true, confirm: "The staff member will lose console access." },
    { label: "Activate", status: "Active" },
  ],
};

export const auditLogs: ResourceConfig = {
  title: "Audit Logs", description: "Immutable record of sensitive actions. Every demo action you take lands here.", collection: "audit", entity: "Audit entry", perm: "settings",
  searchKeys: ["actor", "action", "resource", "resourceId", "next"], filters: [{ key: "action", label: "Action" }, { key: "resource", label: "Resource" }, { key: "actor", label: "Actor" }], dateKey: "at", titleKey: "action", pageSize: 15,
  columns: [
    { key: "at", label: "Date", render: (r) => dateTime(r.at) },
    { key: "actor", label: "Actor" },
    { key: "action", label: "Action", render: (r) => <span className="font-medium">{r.action}</span> },
    { key: "resource", label: "Resource" },
    { key: "resourceId", label: "Record", render: mono("resourceId") },
    { key: "prev", label: "Previous", className: "max-w-40 truncate text-muted-foreground" },
    { key: "next", label: "New", className: "max-w-48 truncate" },
    { key: "ip", label: "IP", render: mono("ip") },
  ],
};

export const security: ResourceConfig = {
  title: "Security", description: "Admin sessions, login history and access controls.", collection: "sessions", entity: "Session", perm: "settings",
  searchKeys: ["admin", "device", "location", "ip"], filters: [{ key: "status", label: "Status" }, { key: "event", label: "Event" }], titleKey: "admin",
  metrics: (r) => [
    { label: "Active sessions", value: num(count(r, "status", "Active")), icon: Users },
    { label: "Failed logins (24h)", value: num(count(r, "event", "Failed login") + 2), icon: ShieldAlert },
    { label: "MFA coverage", value: Math.round((count(db.admins.getAll(), "mfa", "Enabled") / db.admins.getAll().length) * 100) + "%" },
    { label: "Session timeout", value: "30 min" },
  ],
  columns: [
    { key: "admin", label: "Admin", render: (r) => <span className="flex items-center gap-2"><Avatar name={r.admin} className="size-6 text-[9px]" />{r.admin}</span> },
    { key: "event", label: "Event" },
    { key: "device", label: "Device" },
    { key: "location", label: "Location" },
    { key: "ip", label: "IP", render: mono("ip") },
    { key: "started", label: "Started", render: (r) => relative(r.started) },
    { key: "status", label: "Status", render: st },
  ],
  actions: [{ label: "Revoke session", status: "Revoked", destructive: true, confirm: "The admin will be signed out on that device (demo)." }, { label: "Block IP", status: "Blocked", destructive: true, confirm: "Blocks further attempts from this IP (demo)." }],
};

export const MODULES = {
  businesses, clientSuccess, requests, subscriptions, payments, offers, templates, aiTokens, whatsapp, aiProviders, automations,
  integrations, apiManagement, tickets, announcements, notifications, systemMonitoring, errorLogs, activityLogs, adminUsers, auditLogs, security,
};
export { PLAN_PRICE };
