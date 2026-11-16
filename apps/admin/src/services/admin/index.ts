/**
 * Data-access services. Pages call these, never localStorage directly.
 * Swap collection internals for Cloud/API calls when a backend exists.
 */
import { createCollection, uid, type Collection, type Row } from "@/lib/admin/store";
import { sessionStore } from "@/lib/admin/session";
import * as seed from "@/lib/demo-data/seed";

export const db = {
  businesses: createCollection("businesses", seed.seedBusinesses),
  onboarding: createCollection("onboarding", seed.seedOnboarding),
  subscriptions: createCollection("subscriptions", seed.seedSubscriptions),
  plans: createCollection("plans", () => seed.PLAN_DEFS),
  requests: createCollection("requests", seed.seedRequests),
  tickets: createCollection("tickets", seed.seedTickets),
  offers: createCollection("offers", seed.seedOffers),
  templates: createCollection("templates", seed.seedTemplates),
  tokens: createCollection("tokens", seed.seedTokens),
  providers: createCollection("providers", seed.seedProviders),
  whatsapp: createCollection("whatsapp", seed.seedWhatsApp),
  transactions: createCollection("transactions", seed.seedTransactions),
  automations: createCollection("automations", seed.seedAutomations),
  integrations: createCollection("integrations", seed.seedIntegrations),
  apiKeys: createCollection("apiKeys", seed.seedApiKeys),
  announcements: createCollection("announcements", seed.seedAnnouncements),
  notifications: createCollection("notifications", seed.seedNotifications),
  services: createCollection("services", seed.seedServices),
  errorLogs: createCollection("errorLogs", seed.seedErrorLogs),
  activity: createCollection("activity", seed.seedActivity),
  admins: createCollection("admins", seed.seedAdmins),
  audit: createCollection("audit", seed.seedAudit),
  sessions: createCollection("sessions", seed.seedSessions),
  followups: createCollection("followups", seed.seedFollowups),
  settings: createCollection<Row>("settings", () => [
    {
      id: "global", platformName: "Genie", supportEmail: "support@genie.app", primaryColor: "#16A34A", currency: "INR",
      timezone: "Asia/Kolkata", emailFrom: "Genie <no-reply@genie.app>", waApiVersion: "v21.0", defaultAiProvider: "OpenAI",
      invoicePrefix: "INV-", gstRate: 18, notifyEmail: true, notifySlack: false, flagAiMemory: true, flagFlowsV2: false,
      maintenance: false, maxMsgPerMin: 80, fairUse: "Messages above plan quota are billed at ₹0.35 each.",
    },
  ]),
};

const actor = () => sessionStore.get()?.name ?? "System";

export function audit(action: string, resource: string, resourceId: string, prev: unknown = "—", next: unknown = "—") {
  db.audit.insert({
    id: uid("AUD"), actor: actor(), action, resource, resourceId,
    prev: String(prev), next: String(next), at: new Date().toISOString(), ip: "127.0.0.1 (demo)",
  });
}

export function addNote(collection: keyof typeof db, id: string, text: string) {
  const c = db[collection] as unknown as Collection<Row>;
  const row = c.get(id);
  if (!row) return;
  c.update(id, { notes: [{ at: new Date().toISOString(), by: actor(), text }, ...(row.notes ?? [])] } as any);
  audit("Internal note added", String(collection), id, "—", text.slice(0, 60));
}

export const BusinessService = {
  setStatus(id: string, status: string) {
    const b = db.businesses.get(id);
    if (!b) return;
    db.businesses.update(id, { status, mrr: status === "Active" ? seed.PLAN_PRICE[b.plan] : 0 });
    // Keep subscription + AI access in sync with account status.
    db.subscriptions.getAll().filter((s) => s.businessId === id).forEach((s) => {
      const next = status === "Suspended" ? "Suspended" : status === "Archived" ? "Cancelled" : status === "Active" && ["Suspended", "Cancelled", "Expired", "Trial"].includes(s.status) ? "Active" : s.status;
      if (next !== s.status) db.subscriptions.update(s.id, { status: next, payment: next === "Active" ? "Paid" : s.payment });
    });
    db.tokens.getAll().filter((t) => t.businessId === id).forEach((t) => db.tokens.update(t.id, { aiEnabled: status === "Active" || status === "Trial" }));
    audit(status === "Suspended" ? "Account suspension" : "Business status change", "Business", id, b.status, status);
  },
  changePlan(id: string, plan: string) {
    const b = db.businesses.get(id);
    if (!b) return;
    db.businesses.update(id, { plan, mrr: b.status === "Active" ? seed.PLAN_PRICE[plan] : 0 });
    db.subscriptions.getAll().filter((s) => s.businessId === id).forEach((s) => db.subscriptions.update(s.id, { plan, amount: seed.PLAN_PRICE[plan] }));
    db.tokens.getAll().filter((t) => t.businessId === id).forEach((t) => db.tokens.update(t.id, { plan, allowance: seed.PLAN_DEFS.find((p) => p.id === plan)!.tokens }));
    audit("Subscription modification", "Business", id, b.plan, plan);
  },
};

export const OnboardingService = {
  create(v: Record<string, any>) {
    const id = uid("ONB");
    const rec = {
      id, name: v.name, industry: v.industry, owner: v.owner, email: v.email, phone: v.phone,
      registeredAt: new Date().toISOString(), manager: v.manager, stage: "New Registration", plan: v.plan,
      checklist: seed.CHECKLIST.map((task, k) => ({ task, done: k === 0, owner: v.manager, due: new Date(Date.now() + (k + 1) * 86400000).toISOString() })),
      notes: v.notes ? [{ at: new Date().toISOString(), by: actor(), text: v.notes }] : [],
    };
    const bizId = uid("BIZ");
    const linked = { ...rec, businessId: bizId };
    db.onboarding.insert(linked);
    db.businesses.insert({
      id: bizId, name: v.name, owner: v.owner, email: v.email, phone: v.phone, industry: v.industry,
      registeredAt: rec.registeredAt, plan: v.plan, whatsapp: v.waba ? "Pending" : "Pending", aiUsage: 0,
      status: Number(v.trial) > 0 ? "Trial" : "Pending", manager: v.manager, mrr: 0, health: "Healthy", lastLogin: rec.registeredAt,
      adoption: 0, renewal: new Date(Date.now() + (Number(v.trial) || 30) * 86400000).toISOString(), notes: [],
    });
    db.subscriptions.insert({
      id: uid("SUB"), businessId: bizId, business: v.name, plan: v.plan, cycle: v.cycle || "Monthly",
      amount: Number(v.price) || (v.cycle === "Annual" ? seed.PLAN_PRICE[v.plan] * 10 : seed.PLAN_PRICE[v.plan]),
      startDate: rec.registeredAt, renewal: new Date(Date.now() + (Number(v.trial) || 30) * 86400000).toISOString(),
      status: Number(v.trial) > 0 ? "Trial" : "Active", payment: Number(v.trial) > 0 ? "N/A" : "Unpaid",
    });
    db.tokens.insert({
      id: `TOK-${bizId}`, businessId: bizId, business: v.name, plan: v.plan, allowance: Number(v.tokens) || seed.PLAN_DEFS.find((p) => p.id === v.plan)!.tokens,
      bonus: 0, bonusExpiry: rec.registeredAt, consumed: 0, input: 0, output: 0, resetDate: rec.registeredAt, aiEnabled: true, status: "Healthy", adjustments: [],
    });
    audit("Business creation", "Business", bizId, "—", v.name);
    return linked;
  },
  move(id: string, stage: string) {
    const r = db.onboarding.get(id);
    if (!r || r.stage === stage) return;
    db.onboarding.update(id, { stage });
    audit("Onboarding stage change", "Onboarding", id, r.stage, stage);
    const biz = r.businessId ? db.businesses.get(r.businessId) : db.businesses.getAll().find((b) => b.name === r.name);
    if (stage === "Completed Onboarding" && biz && biz.status === "Pending") BusinessService.setStatus(biz.id, "Active");
  },
  toggleTask(id: string, idx: number) {
    const r = db.onboarding.get(id);
    if (!r) return;
    const checklist = r.checklist.map((t: any, i: number) => (i === idx ? { ...t, done: !t.done } : t));
    db.onboarding.update(id, { checklist });
    audit("Checklist updated", "Onboarding", id, r.checklist[idx].done ? "Done" : "Open", checklist[idx].done ? "Done" : "Open");
  },
};

export const TokenService = {
  adjust(id: string, kind: string, amount: number, reason: string, expiry?: string) {
    const t = db.tokens.get(id);
    if (!t || !(amount > 0)) return;
    const patch: Record<string, any> = {};
    let delta = amount;
    if (kind === "Add bonus") { patch.bonus = t.bonus + amount; if (expiry) patch.bonusExpiry = expiry; }
    else if (kind === "Deduct bonus") { delta = -Math.min(amount, t.bonus); patch.bonus = t.bonus + delta; }
    else if (kind === "Increase allocation") patch.allowance = t.allowance + amount;
    else if (kind === "Decrease allocation") { delta = -amount; patch.allowance = Math.max(0, t.allowance - amount); }
    else if (kind === "Set custom limit") { delta = amount - t.allowance; patch.allowance = amount; }
    patch.adjustments = [{ at: new Date().toISOString(), by: actor(), delta, kind, reason }, ...(t.adjustments ?? [])];
    db.tokens.update(id, patch);
    audit("Token adjustment", "AI Tokens", id, `${kind}`, `${delta > 0 ? "+" : ""}${delta.toLocaleString("en-IN")} · ${reason}`);
  },
};

export const RequestService = {
  setStatus(id: string, status: string) {
    const r = db.requests.get(id);
    if (!r) return;
    db.requests.update(id, { status });
    audit(`Request ${status.toLowerCase()}`, "Client request", id, r.status, status);
  },
};

export const SupportService = {
  reply(id: string, text: string, internal: boolean) {
    const t = db.tickets.get(id);
    if (!t) return;
    const entry = { at: new Date().toISOString(), from: internal ? "internal" : "staff", by: actor(), text };
    db.tickets.update(id, { thread: [...t.thread, entry], updatedAt: entry.at, status: t.status === "Open" && !internal ? "In Progress" : t.status });
    audit(internal ? "Ticket internal note" : "Ticket reply", "Ticket", id);
  },
};

export function genericStatus(collection: keyof typeof db, id: string, status: string, label = String(collection)) {
  const c = db[collection] as unknown as Collection<Row>;
  const row = c.get(id);
  if (!row) return;
  c.update(id, { status } as any);
  audit(`${label} status change`, label, id, row.status, status);
}
