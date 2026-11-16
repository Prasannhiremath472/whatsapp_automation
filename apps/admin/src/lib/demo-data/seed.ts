/* Deterministic DEMO seed data. Every record here is fictional. */
let s = 42;
const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
const pick = <T,>(a: readonly T[]) => a[Math.floor(rnd() * a.length)];
const int = (a: number, b: number) => Math.floor(a + rnd() * (b - a + 1));
const BASE = new Date("2026-11-07T10:00:00Z").getTime();
const DAY = 86400000;
export const daysAgo = (d: number) => new Date(BASE - d * DAY).toISOString();
const daysAhead = (d: number) => new Date(BASE + d * DAY).toISOString();
const reset = (seed: number) => (s = seed);

export const PLANS = ["Starter", "Growth", "Business", "Enterprise"] as const;
export const PLAN_PRICE: Record<string, number> = { Starter: 1499, Growth: 3999, Business: 8999, Enterprise: 24999 };
export const MANAGERS = ["Priya Nair", "Rohan Mehta", "Ananya Iyer", "Karan Shah", "Sneha Kulkarni"];
export const STAFF = [...MANAGERS, "Vikram Rao", "Meera Joshi"];

const BIZ: [string, string, string][] = [
  ["Aurora Dental Studio", "Healthcare", "Dr. Kavya Menon"],
  ["UrbanBrew Coffee Co.", "Food & Beverage", "Arjun Malhotra"],
  ["Nimbus Realty", "Real Estate", "Farah Siddiqui"],
  ["FitForge Gyms", "Fitness", "Rahul Deshpande"],
  ["Saffron Table Restaurants", "Hospitality", "Imran Qureshi"],
  ["BrightPath Academy", "Education", "Neha Kapoor"],
  ["Velvet Threads Boutique", "Retail", "Simran Bedi"],
  ["CloudNest Interiors", "Home Services", "Aditya Rao"],
  ["Zenith Auto Care", "Automotive", "Manoj Pillai"],
  ["PetPal Clinics", "Healthcare", "Dr. Ritu Sharma"],
  ["Lumen Skin Clinic", "Beauty & Wellness", "Tanvi Joshi"],
  ["Harbor Logistics", "Logistics", "Sameer Khan"],
  ["GreenLeaf Organics", "E-commerce", "Pooja Verma"],
  ["Orbit Travel Desk", "Travel", "Nikhil Bose"],
  ["CraftHaus Furniture", "Retail", "Leena Thomas"],
  ["MediQuick Pharmacy", "Healthcare", "Suresh Iyer"],
  ["Pixel Pop Studios", "Media", "Ishaan Gupta"],
  ["TrueNorth Finance", "Financial Services", "Ayesha Rahman"],
];

const slug = (n: string) => n.toLowerCase().replace(/[^a-z]+/g, "");

export function seedBusinesses() {
  reset(7);
  const statuses = ["Active", "Active", "Active", "Active", "Trial", "Trial", "Suspended", "Expired", "Pending", "Archived"];
  return BIZ.map(([name, industry, owner], i) => {
    const status = i < 10 ? (i % 4 === 3 ? "Trial" : "Active") : statuses[i % statuses.length];
    const plan = PLANS[i % 4];
    return {
      id: `BIZ-${1001 + i}`,
      name,
      owner,
      email: `${owner.split(" ").pop()!.toLowerCase()}@${slug(name)}.in`,
      phone: `+91 9${int(100000000, 999999999)}`,
      industry,
      registeredAt: daysAgo(int(5, 420)),
      plan,
      whatsapp: status === "Pending" ? "Pending" : i % 7 === 5 ? "Disconnected" : "Connected",
      aiUsage: int(8, 97),
      status,
      manager: MANAGERS[i % MANAGERS.length],
      mrr: status === "Active" ? PLAN_PRICE[plan] : 0,
      health: pick(["Healthy", "Healthy", "Healthy", "Attention Required", "At Risk", "Inactive"]),
      lastLogin: daysAgo(int(0, 30)),
      adoption: int(25, 95),
      renewal: daysAhead(int(2, 120)),
      notes: [] as { at: string; by: string; text: string }[],
    };
  });
}

export const ONBOARDING_STAGES = [
  "New Registration",
  "Information Pending",
  "Verification Pending",
  "WhatsApp Setup Pending",
  "Ready to Launch",
  "Completed Onboarding",
] as const;

export const CHECKLIST = [
  "Business information collected",
  "Owner verified",
  "Subscription assigned",
  "Payment or trial confirmed",
  "WhatsApp connected",
  "Webhook configured",
  "Templates synchronized",
  "Team members invited",
  "Incoming message tested",
  "Outgoing message tested",
  "Client training completed",
  "Production activation approved",
];

const ONB: [string, string, string][] = [
  ["Bloom Florists", "Retail", "Divya Rao"],
  ["SparkWash Laundry", "Home Services", "Hemant Joshi"],
  ["Kite Coaching Centre", "Education", "Ritika Sen"],
  ["Spice Route Caterers", "Food & Beverage", "Faizal Ahmed"],
  ["Elevate Physio", "Healthcare", "Dr. Omkar Patil"],
  ["Nova Electronics", "E-commerce", "Varun Chawla"],
  ["Sunrise Homestays", "Travel", "Maya D'Souza"],
  ["Iron Peak CrossFit", "Fitness", "Jay Thakkar"],
  ["Petal & Pine Salon", "Beauty & Wellness", "Rhea Kapoor"],
  ["Prime Movers", "Logistics", "Gurpreet Singh"],
  ["Mosaic Events", "Hospitality", "Natasha Fernandes"],
  ["Ledger Lane CA", "Financial Services", "Abhay Kulkarni"],
  ["Little Sprouts Preschool", "Education", "Shalini Rao"],
  ["Copper Kettle Bakery", "Food & Beverage", "Zoya Mirza"],
];

export function seedOnboarding() {
  reset(11);
  return ONB.map(([name, industry, owner], i) => {
    const stageIdx = i % 6;
    const done = Math.min(12, stageIdx * 2 + int(0, 2));
    return {
      id: `ONB-${2001 + i}`,
      name,
      industry,
      owner,
      email: `${owner.split(" ").pop()!.toLowerCase()}@${slug(name)}.in`,
      phone: `+91 8${int(100000000, 999999999)}`,
      registeredAt: daysAgo(int(1, 40)),
      manager: MANAGERS[i % MANAGERS.length],
      stage: ONBOARDING_STAGES[stageIdx],
      plan: PLANS[i % 4],
      checklist: CHECKLIST.map((t, k) => ({ task: t, done: k < done, owner: MANAGERS[(i + k) % 5], due: daysAhead(k - 2) })),
      notes: [] as { at: string; by: string; text: string }[],
    };
  });
}

export function seedSubscriptions() {
  reset(13);
  return seedBusinesses()
    .filter((b) => b.status !== "Pending")
    .map((b, i) => {
      const cycle = i % 3 === 0 ? "Annual" : "Monthly";
      const status =
        b.status === "Active" ? (i === 4 ? "Past Due" : "Active") : b.status === "Trial" ? "Trial" : b.status === "Suspended" ? "Suspended" : b.status === "Expired" ? "Expired" : "Cancelled";
      return {
        id: `SUB-${3001 + i}`,
        businessId: b.id,
        business: b.name,
        plan: b.plan,
        cycle,
        amount: cycle === "Annual" ? PLAN_PRICE[b.plan] * 10 : PLAN_PRICE[b.plan],
        startDate: b.registeredAt,
        renewal: b.renewal,
        status,
        payment: status === "Past Due" ? "Failed" : status === "Trial" ? "N/A" : status === "Active" ? "Paid" : "Unpaid",
      };
    });
}

export const PLAN_DEFS = [
  { id: "Starter", name: "Starter", description: "For small teams getting started with WhatsApp.", monthly: 1499, annual: 14990, trial: 14, staff: 2, numbers: 1, messages: 5000, tokens: 200000, contacts: 2000, storage: 2, automations: 3, features: ["Basic inbox", "Limited contacts", "Basic templates", "Basic analytics"] },
  { id: "Growth", name: "Growth", description: "Campaigns, AI agents and automations for growing businesses.", monthly: 3999, annual: 39990, trial: 14, staff: 8, numbers: 1, messages: 25000, tokens: 1000000, contacts: 15000, storage: 10, automations: 15, features: ["Advanced inbox", "Campaigns", "Multiple staff", "AI agents", "Automations"] },
  { id: "Business", name: "Business", description: "Higher limits and advanced analytics for scaling teams.", monthly: 8999, annual: 89990, trial: 7, staff: 25, numbers: 3, messages: 100000, tokens: 5000000, contacts: 75000, storage: 50, automations: 60, features: ["Higher usage limits", "Advanced analytics", "Multiple WhatsApp numbers", "Advanced team management"] },
  { id: "Enterprise", name: "Enterprise", description: "Custom pricing, custom limits and priority support.", monthly: 24999, annual: 249990, trial: 0, staff: 999, numbers: 10, messages: 1000000, tokens: 25000000, contacts: 500000, storage: 500, automations: 999, features: ["Custom pricing", "Custom limits", "Advanced permissions", "Priority support"] },
];

const REQ_TYPES = [
  "Subscription upgrade", "Subscription downgrade", "Plan cancellation", "Custom pricing", "Additional WhatsApp number",
  "AI token limit increase", "Additional message quota", "Feature activation", "Integration request", "Account verification",
  "Billing complaint", "Refund request", "Technical assistance", "General inquiry",
];
const REQ_STATUS = ["New", "Under Review", "Waiting for Client", "Approved", "Rejected", "In Progress", "Completed", "Closed"];

export function seedRequests() {
  reset(17);
  const biz = seedBusinesses();
  return Array.from({ length: 18 }, (_, i) => {
    const type = REQ_TYPES[i % REQ_TYPES.length];
    return {
      id: `REQ-${4101 + i}`,
      business: biz[i % biz.length].name,
      type,
      subject: `${type} — ${pick(["urgent review", "for next cycle", "as discussed", "please assist", "from owner"])}`,
      description: `The client has submitted a ${type.toLowerCase()} request via the Genie Client Panel. Details and requested changes are attached for review.`,
      submittedAt: daysAgo(int(0, 25)),
      priority: pick(["Low", "Medium", "High", "Urgent"]),
      assignee: pick(STAFF),
      status: i < 4 ? "New" : REQ_STATUS[i % REQ_STATUS.length],
      notes: [] as { at: string; by: string; text: string }[],
    };
  });
}

const TICKET_CATS = ["Technical Issue", "WhatsApp Issue", "Billing", "AI Issue", "Campaign Issue", "Automation Issue", "Account Access", "General Support"];
const SUBJECTS = [
  "Messages stuck in sending state", "Webhook not receiving replies", "Invoice amount looks incorrect", "AI agent giving wrong answers",
  "Campaign paused unexpectedly", "Flow stops at condition node", "Cannot log in after password reset", "How to add a new staff member",
  "Template rejected by Meta", "Number quality rating dropped", "Tokens exhausted earlier than expected", "Broadcast delivery delayed",
  "Unable to export contacts", "Automation triggered twice",
];
export function seedTickets() {
  reset(19);
  const biz = seedBusinesses();
  return SUBJECTS.map((subject, i) => ({
    id: `TCK-${5201 + i}`,
    business: biz[(i * 3) % biz.length].name,
    category: TICKET_CATS[i % TICKET_CATS.length],
    subject,
    priority: pick(["Low", "Medium", "High", "Urgent"]),
    assignee: pick(STAFF),
    status: pick(["Open", "Open", "In Progress", "Waiting for Client", "Resolved", "Closed"]),
    updatedAt: daysAgo(int(0, 10)),
    thread: [
      { at: daysAgo(3), from: "client", by: biz[(i * 3) % biz.length].owner, text: `Hi team, ${subject.toLowerCase()}. Can you please check?` },
      { at: daysAgo(2), from: "staff", by: pick(STAFF), text: "Thanks for reaching out — we're looking into this now." },
    ],
    notes: [] as { at: string; by: string; text: string }[],
  }));
}

export function seedOffers() {
  reset(23);
  const names = ["Diwali Growth Boost", "Annual Saver 20", "Starter Welcome", "Enterprise Pilot", "AI Token Bonanza", "Win-back Q4", "Referral Reward", "Healthcare Bundle", "Trial Extension 30", "Black Friday Flash", "Education Partner"];
  return names.map((name, i) => ({
    id: `OFF-${6001 + i}`,
    name,
    code: name.toUpperCase().replace(/[^A-Z0-9]+/g, "").slice(0, 10) + (i + 1),
    type: pick(["Percentage", "Flat", "Bonus Tokens", "Trial Extension", "Custom Price"]),
    audience: pick(["All businesses", "Starter plan", "Growth plan", "Selected businesses", "Enterprise plan"]),
    discount: pick(["10%", "20%", "₹500", "₹1,000", "500K tokens", "+30 days"]),
    startDate: daysAgo(int(0, 40)),
    expiry: daysAhead(int(-5, 60)),
    redemptions: int(0, 120),
    maxRedemptions: pick([50, 100, 200, 500]),
    status: pick(["Active", "Active", "Paused", "Expired", "Archived"]),
  }));
}

const TPL_CATS = ["Welcome", "Marketing", "Utility", "Authentication", "Notifications", "Support", "Appointment Reminders", "Payment Notifications"];
export function seedTemplates() {
  reset(29);
  const names = ["welcome_new_customer", "festive_sale_offer", "order_shipped", "otp_login_code", "account_update", "support_ticket_ack", "appointment_reminder_24h", "payment_received", "payment_due_reminder", "cart_abandoned", "feedback_request", "appointment_rescheduled", "welcome_back_offer", "delivery_out_today", "kyc_verification", "renewal_reminder"];
  return names.map((n, i) => ({
    id: `TPL-${7001 + i}`,
    name: n.split("_").map((w) => w[0].toUpperCase() + w.slice(1)).join(" "),
    internalName: n,
    category: TPL_CATS[i % TPL_CATS.length],
    language: pick(["English", "English", "Hindi", "Marathi", "Tamil"]),
    library: pick(["Genie Global", "Genie Global", "Business-specific", "Meta-approved"]),
    header: "Hello {{1}}",
    body: `Hi {{1}}, this is a message from {{2}} regarding your ${n.replace(/_/g, " ")}. Reply HELP for assistance.`,
    footer: "Powered by Genie",
    buttons: "Visit Website, Contact Us",
    status: pick(["Draft", "Pending Submission", "Submitted", "Approved", "Approved", "Rejected", "Paused", "Archived"]),
    createdAt: daysAgo(int(3, 200)),
  }));
}

export function seedTokens() {
  reset(31);
  return seedBusinesses().map((b) => {
    const allowance = PLAN_DEFS.find((p) => p.id === b.plan)!.tokens;
    const consumed = Math.round((allowance * b.aiUsage) / 100);
    return {
      id: `TOK-${b.id}`,
      businessId: b.id,
      business: b.name,
      plan: b.plan,
      allowance,
      bonus: pick([0, 0, 50000, 100000, 250000]),
      bonusExpiry: daysAhead(int(10, 60)),
      consumed,
      input: Math.round(consumed * 0.62),
      output: Math.round(consumed * 0.38),
      resetDate: daysAhead(int(1, 28)),
      aiEnabled: b.status !== "Suspended",
      status: b.aiUsage > 90 ? "Near Limit" : b.status === "Suspended" ? "Disabled" : "Healthy",
      adjustments: [] as { at: string; by: string; delta: number; kind: string; reason: string }[],
    };
  });
}

export function seedProviders() {
  return [
    { id: "PRV-1", name: "OpenAI", model: "gpt-5-mini", status: "Connected", isDefault: "Yes", rateLimit: "10,000 RPM", pricing: "₹0.21 / 1K in · ₹0.84 / 1K out", lastChecked: daysAgo(0) },
    { id: "PRV-2", name: "Anthropic", model: "claude-sonnet", status: "Connected", isDefault: "No", rateLimit: "4,000 RPM", pricing: "₹0.25 / 1K in · ₹1.25 / 1K out", lastChecked: daysAgo(0) },
    { id: "PRV-3", name: "Google Gemini", model: "gemini-2.5-flash", status: "Connected", isDefault: "No", rateLimit: "8,000 RPM", pricing: "₹0.06 / 1K in · ₹0.25 / 1K out", lastChecked: daysAgo(1) },
    { id: "PRV-4", name: "Mistral", model: "mistral-large", status: "Degraded", isDefault: "No", rateLimit: "2,000 RPM", pricing: "₹0.17 / 1K in · ₹0.50 / 1K out", lastChecked: daysAgo(0) },
    { id: "PRV-5", name: "Groq", model: "llama-3.3-70b", status: "Not Configured", isDefault: "No", rateLimit: "—", pricing: "—", lastChecked: daysAgo(6) },
  ];
}

export function seedWhatsApp() {
  reset(37);
  return seedBusinesses().map((b, i) => ({
    id: `WA-${b.id}`,
    business: b.name,
    wabaId: `1${int(10000000000000, 99999999999999)}`,
    phone: b.phone,
    phoneNumberId: `10${int(1000000000000, 9999999999999)}`,
    status: b.whatsapp === "Pending" ? "Pending" : b.whatsapp === "Disconnected" ? "Disconnected" : i === 13 ? "Failed" : "Connected",
    webhook: b.whatsapp === "Connected" ? "Healthy" : "Failing",
    quality: pick(["High", "High", "Medium", "Low"]),
    tokenExpiry: daysAhead(int(5, 55)),
    lastActivity: daysAgo(int(0, 6)),
    sent: int(2000, 90000),
  }));
}

export function seedTransactions() {
  reset(41);
  const biz = seedBusinesses();
  return Array.from({ length: 32 }, (_, i) => {
    const b = biz[i % 14];
    return {
      id: `TXN-${90001 + i}`,
      business: b.name,
      invoice: `INV-2026-${1400 + i}`,
      amount: PLAN_PRICE[b.plan] * (i % 5 === 0 ? 10 : 1),
      currency: "INR",
      method: pick(["UPI", "Card", "Net Banking", "Card", "UPI"]),
      date: daysAgo(i * 2 + int(0, 1)),
      status: pick(["Succeeded", "Succeeded", "Succeeded", "Succeeded", "Failed", "Refunded", "Pending"]),
    };
  });
}

export function seedAutomations() {
  reset(43);
  const wf = ["Welcome series", "Abandoned cart recovery", "Appointment reminder", "Lead qualification bot", "Payment follow-up", "Feedback collection", "Order status updates", "Re-engagement drip", "Support triage", "Birthday wishes", "Renewal nudges", "Event RSVP flow", "Course enrollment", "Delivery confirmation"];
  const biz = seedBusinesses();
  return wf.map((w, i) => {
    const ex = int(120, 9000);
    return {
      id: `WF-${8001 + i}`,
      workflow: w,
      business: biz[(i * 2) % biz.length].name,
      trigger: pick(["Incoming message", "Keyword match", "Tag added", "Schedule", "Webhook", "Order created"]),
      executions: ex,
      successRate: int(78, 100),
      failed: int(0, 40),
      lastRun: daysAgo(int(0, 3)),
      status: pick(["Active", "Active", "Active", "Paused", "Failing"]),
      failedNode: pick(["Send template", "HTTP request", "AI reply", "Condition", "Delay"]),
      error: pick(["131047: Re-engagement window expired", "Timeout after 30s", "Template param mismatch", "Provider rate limited (429)"]),
    };
  });
}

export function seedIntegrations() {
  return [
    ["Meta WhatsApp Cloud API", "WhatsApp"], ["OpenAI", "AI providers"], ["Anthropic", "AI providers"], ["Razorpay", "Payment gateways"],
    ["Stripe", "Payment gateways"], ["Resend", "Email providers"], ["Object Storage", "Storage"], ["HubSpot", "External CRM"],
    ["Zoho CRM", "External CRM"], ["Google Analytics", "Analytics"],
  ].map(([name, cat], i) => ({
    id: `INT-${i + 1}`,
    name,
    category: cat,
    config: i === 8 ? "Not Configured" : "Configured",
    status: i === 8 ? "Disconnected" : i === 4 ? "Error" : "Connected",
    lastSync: daysAgo(i % 3),
    errors: i === 4 ? 12 : i % 4,
  }));
}

export function seedApiKeys() {
  return [
    { id: "KEY-1", name: "Production server", prefix: "gn_live_8f2a••••", scope: "Full access", created: daysAgo(120), lastUsed: daysAgo(0), requests: 1284000, status: "Active" },
    { id: "KEY-2", name: "Reporting worker", prefix: "gn_live_c71d••••", scope: "Read only", created: daysAgo(64), lastUsed: daysAgo(1), requests: 220400, status: "Active" },
    { id: "KEY-3", name: "Staging", prefix: "gn_test_09be••••", scope: "Full access", created: daysAgo(30), lastUsed: daysAgo(3), requests: 48100, status: "Active" },
    { id: "KEY-4", name: "Legacy CRM sync", prefix: "gn_live_4ae0••••", scope: "Webhooks", created: daysAgo(300), lastUsed: daysAgo(90), requests: 9100, status: "Revoked" },
    { id: "KEY-5", name: "Partner sandbox", prefix: "gn_test_b3f1••••", scope: "Read only", created: daysAgo(12), lastUsed: daysAgo(2), requests: 3200, status: "Active" },
  ];
}

export function seedAnnouncements() {
  return [
    { id: "ANN-1", title: "Scheduled maintenance — Sunday 2 AM IST", type: "Maintenance notice", target: "All businesses", publishAt: daysAhead(2), status: "Scheduled", body: "Inbox may be unavailable for 15 minutes." },
    { id: "ANN-2", title: "New: AI Agent memory", type: "Feature release", target: "Growth plan", publishAt: daysAgo(3), status: "Published", body: "Agents can now remember customer preferences." },
    { id: "ANN-3", title: "Festive campaign templates are live", type: "Promotional announcement", target: "All businesses", publishAt: daysAgo(10), status: "Published", body: "20 new templates for Diwali campaigns." },
    { id: "ANN-4", title: "Delayed delivery reports", type: "Service interruption notice", target: "All businesses", publishAt: daysAgo(18), status: "Expired", body: "Meta delivery receipts delayed by up to 10 minutes." },
    { id: "ANN-5", title: "Enterprise: dedicated success manager", type: "Platform announcement", target: "Enterprise plan", publishAt: daysAhead(7), status: "Draft", body: "Every Enterprise account now gets a named CSM." },
    { id: "ANN-6", title: "Annual plans now 2 months free", type: "Promotional announcement", target: "Starter plan", publishAt: daysAgo(1), status: "Published", body: "Switch to annual and save." },
  ];
}

export function seedNotifications() {
  const n: [string, string, string][] = [
    ["New registration", "Copper Kettle Bakery signed up for a Growth trial", "onboarding"],
    ["New client request", "Nimbus Realty requested an AI token limit increase", "requests"],
    ["Failed payment", "Payment of ₹8,999 failed for FitForge Gyms", "payments"],
    ["Subscription renewal", "Aurora Dental Studio renews in 3 days", "plans"],
    ["WhatsApp disconnection", "Lumen Skin Clinic's number disconnected", "whatsapp"],
    ["AI provider failure", "Mistral returned elevated 5xx errors", "ai-providers"],
    ["System incident", "Webhook latency above threshold", "system-monitoring"],
    ["Support ticket", "Urgent ticket TCK-5204 opened by FitForge Gyms", "tickets"],
    ["New registration", "Little Sprouts Preschool signed up", "onboarding"],
    ["Failed payment", "Payment of ₹3,999 failed for Orbit Travel Desk", "payments"],
    ["New client request", "Harbor Logistics requested a refund", "requests"],
    ["Support ticket", "TCK-5209 reopened by client", "tickets"],
  ];
  return n.map(([type, message, link], i) => ({ id: `NTF-${i + 1}`, type, message, link, at: daysAgo(i * 0.3), read: i > 4 }));
}

export function seedServices() {
  reset(47);
  return ["Backend API", "Database", "Authentication", "Realtime", "WhatsApp", "AI providers", "Payment gateway", "Background workers", "Webhooks"].map((name, i) => ({
    id: `SVC-${i + 1}`,
    name,
    status: i === 8 ? "Degraded" : i === 5 ? "Degraded" : "Operational",
    responseMs: int(28, 420),
    uptime: (99 + rnd()).toFixed(2) + "%",
    errorRate: (rnd() * (i === 8 ? 4 : 0.6)).toFixed(2) + "%",
    lastChecked: daysAgo(0),
  }));
}

export function seedErrorLogs() {
  reset(53);
  const errs = ["WhatsApp 131047: message outside 24h window", "AI provider timeout (30s)", "Webhook signature mismatch", "Payment webhook duplicate event", "DB connection pool exhausted", "Template variable missing: {{2}}", "Rate limit exceeded (429)", "Worker job retried 3 times"];
  const svc = ["WhatsApp", "AI providers", "Webhooks", "Payment gateway", "Database", "Backend API", "Background workers"];
  return Array.from({ length: 22 }, (_, i) => ({
    id: `ERR-${10001 + i}`,
    message: pick(errs),
    service: pick(svc),
    severity: pick(["Error", "Error", "Warning", "Critical"]),
    business: pick(BIZ)[0],
    at: daysAgo(i * 0.4),
    status: pick(["Open", "Open", "Acknowledged", "Resolved"]),
  }));
}

export function seedActivity() {
  reset(59);
  const acts = ["Signed in", "Viewed business profile", "Exported transactions CSV", "Updated onboarding checklist", "Replied to ticket", "Changed plan", "Created offer", "Approved request"];
  return Array.from({ length: 20 }, (_, i) => ({ id: `ACT-${i + 1}`, actor: pick(STAFF), action: pick(acts), target: pick(BIZ)[0], at: daysAgo(i * 0.25), ip: `10.0.${int(1, 9)}.${int(2, 250)}` }));
}

export function seedAdmins() {
  return [
    ["Ajinkya Patil", "Super Admin"], ["Priya Nair", "Operations Staff"], ["Rohan Mehta", "Support Staff"], ["Ananya Iyer", "Operations Staff"],
    ["Karan Shah", "Finance Staff"], ["Sneha Kulkarni", "Support Staff"], ["Vikram Rao", "Finance Staff"], ["Meera Joshi", "Support Staff"],
  ].map(([name, role], i) => ({
    id: `ADM-${i + 1}`,
    name,
    email: `${name.split(" ")[0].toLowerCase()}@genie.app`,
    role,
    status: i === 7 ? "Inactive" : "Active",
    mfa: i % 3 === 2 ? "Disabled" : "Enabled",
    lastActive: daysAgo(i * 0.5),
    sessions: (i % 3) + 1,
  }));
}

export function seedAudit() {
  reset(61);
  const rows: [string, string, string, string][] = [
    ["Admin login", "Session", "—", "Signed in"], ["Business creation", "Business", "—", "Copper Kettle Bakery"],
    ["Account suspension", "Business", "Active", "Suspended"], ["Subscription modification", "Subscription", "Starter", "Growth"],
    ["Token adjustment", "AI Tokens", "0", "+100,000 bonus"], ["Offer creation", "Offer", "—", "Diwali Growth Boost"],
    ["Template change", "Template", "Draft", "Submitted"], ["Refund action", "Transaction", "Succeeded", "Refunded"],
    ["Role change", "Admin user", "Support Staff", "Operations Staff"], ["Configuration change", "Settings", "Maintenance off", "Maintenance scheduled"],
  ];
  return rows.map(([action, resource, prev, next], i) => ({ id: `AUD-${i + 1}`, actor: pick(STAFF), action, resource, resourceId: "—", prev, next, at: daysAgo(i * 0.7 + 0.2), ip: `49.36.${int(1, 200)}.${int(2, 250)}` }));
}

export function seedSessions() {
  return seedAdmins().slice(0, 7).map((a, i) => ({
    id: `SES-${i + 1}`,
    admin: a.name,
    device: ["Chrome · macOS", "Edge · Windows", "Safari · iOS", "Chrome · Windows", "Firefox · Linux", "Chrome · Android", "Safari · macOS"][i],
    location: ["Pune, IN", "Mumbai, IN", "Bengaluru, IN", "Pune, IN", "Hyderabad, IN", "Delhi, IN", "Chennai, IN"][i],
    ip: `49.36.${10 + i}.${20 + i * 7}`,
    started: daysAgo(i * 0.4),
    event: i === 4 ? "Failed login" : "Active session",
    status: i === 4 ? "Blocked" : "Active",
  }));
}

export function seedFollowups() {
  reset(67);
  return seedBusinesses().filter((b) => b.health !== "Healthy").map((b, i) => ({
    id: `FUP-${i + 1}`,
    client: b.name,
    manager: b.manager,
    risk: pick(["No login for 20 days", "WhatsApp disconnected", "Subscription expiring soon", "Payment overdue", "AI quota nearly exhausted"]),
    health: b.health,
    followUp: daysAhead(int(-2, 10)),
    priority: pick(["Low", "Medium", "High"]),
    status: pick(["Open", "Scheduled", "Done"]),
    notes: "Check in on adoption and renewal intent.",
  }));
}
