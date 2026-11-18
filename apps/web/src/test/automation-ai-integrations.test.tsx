import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

let role: "tenant_admin" | "agent" = "tenant_admin";
vi.mock("@/lib/auth", () => ({
  useSession: () => ({
    user: { id: "u1", email: "a@x.test", displayName: "Owner", role, tenantId: "t1" },
    tenant: { id: "t1", name: "Acme", slug: "acme", businessCategory: null, timezone: "Asia/Kolkata" },
  }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { AutomationsPage, describeStep, describeTrigger } from "@/components/automation/AutomationsPage";
import { AiAgentsPage } from "@/components/ai/AiAgentsPage";
import { IntegrationsPage } from "@/components/integrations/IntegrationsPage";

type Handler = (url: URL, init: RequestInit) => { status?: number; body?: unknown };
let routes: Record<string, Handler> = {};
const calls: { key: string; body: unknown }[] = [];

const iso = () => new Date().toISOString();
const automation = {
  id: "a1", name: "Pricing", description: null, status: "paused", triggerType: "keyword",
  triggerConfig: { keywords: ["price", "cost"], match: "contains" },
  steps: [{ type: "send_text", text: "Hi {{first_name}}, plans start at Rs 999." }, { type: "wait", minutes: 120 }, { type: "add_tag", tag: "asked-price" }],
  cooldownMinutes: 60, runCount: 3, lastRunAt: iso(), createdAt: iso(), updatedAt: iso(),
};
const agent = {
  id: "g1", name: "Asha", instructions: "Answer questions about the shop politely.", model: "claude-haiku-5-5", status: "paused",
  handoverMessage: "A person will take over.", knowledge: [{ id: "k1", title: "Opening hours", content: "Mon-Sat 10 to 6", updatedAt: iso() }],
  usage: { requests: 12, inputTokens: 3000, outputTokens: 400, handovers: 2, errors: 0 }, createdAt: iso(), updatedAt: iso(),
};
const endpoint = { id: "w1", name: "Zapier", url: "https://hooks.zapier.com/x", events: ["message.received"], active: true, lastDeliveryAt: null, lastStatus: null, createdAt: iso() };

beforeEach(() => {
  role = "tenant_admin";
  calls.length = 0;
  routes = {
    "GET /users": () => ({ body: [{ id: "u1", displayName: "Owner", role: "tenant_admin", isActive: true }] }),
    "GET /message-templates": () => ({ body: [] }),
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL, init: RequestInit = {}) => {
      const url = new URL(String(input));
      const key = `${init.method ?? "GET"} ${url.pathname.replace(/^\/api\/v1/, "")}`;
      calls.push({ key, body: init.body ? JSON.parse(String(init.body)) : undefined });
      const handler = routes[key];
      if (!handler) return new Response(JSON.stringify({ message: `No mock for ${key}` }), { status: 404 });
      const { status = 200, body } = handler(url, init);
      return new Response(status === 204 ? null : JSON.stringify(body ?? {}), { status });
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const renderPage = (ui: React.ReactNode) =>
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}>{ui}</QueryClientProvider>);

describe("Automations", () => {
  it("describes triggers and steps in plain words", () => {
    expect(describeTrigger(automation as never)).toBe("Message contains: price, cost");
    expect(describeStep({ type: "wait", minutes: 120 })).toBe("Wait 2 hour(s)");
    expect(describeStep({ type: "wait", minutes: 2880 })).toBe("Wait 2 day(s)");
    expect(describeStep({ type: "set_status", status: "closed" })).toBe("Mark as resolved");
  });

  it("lists automations and turns one on", async () => {
    routes["GET /automations"] = () => ({ body: [automation] });
    routes["PATCH /automations/a1/status"] = () => ({ body: {} });
    renderPage(<AutomationsPage />);
    expect(await screen.findByText("Pricing")).toBeTruthy();
    expect(screen.getByText("Message contains: price, cost")).toBeTruthy();
    expect(screen.getByText("3 runs", { exact: false })).toBeTruthy();

    fireEvent.click(screen.getByRole("switch", { name: "Pricing is on" }));
    await waitFor(() => expect(calls.find((c) => c.key === "PATCH /automations/a1/status")?.body).toEqual({ status: "active" }));
  });

  it("creates a keyword automation with a reply", async () => {
    routes["GET /automations"] = () => ({ body: [] });
    routes["POST /automations"] = () => ({ status: 201, body: {} });
    renderPage(<AutomationsPage />);
    fireEvent.click((await screen.findAllByRole("button", { name: /New automation|Create your first automation/ }))[0]!);

    fireEvent.change(await screen.findByLabelText("Name"), { target: { value: "Hours" } });
    fireEvent.change(screen.getByLabelText("Keywords (separate with commas)"), { target: { value: "hours, open" } });
    fireEvent.change(screen.getByLabelText("Message text"), { target: { value: "We open 10 to 6." } });
    fireEvent.click(screen.getByRole("button", { name: "Save automation" }));

    await waitFor(() => expect(calls.find((c) => c.key === "POST /automations")?.body).toEqual({
      name: "Hours",
      triggerType: "keyword",
      triggerConfig: { keywords: ["hours", "open"], match: "contains" },
      steps: [{ type: "send_text", text: "We open 10 to 6." }],
      cooldownMinutes: 60,
    }));
  });

  it("does not let a wait be the last step", async () => {
    routes["GET /automations"] = () => ({ body: [] });
    renderPage(<AutomationsPage />);
    fireEvent.click((await screen.findAllByRole("button", { name: /New automation|Create your first automation/ }))[0]!);
    fireEvent.change(await screen.findByLabelText("Name"), { target: { value: "x" } });
    fireEvent.click(screen.getByRole("button", { name: /Wait$/ }));
    expect(screen.getByText(/A wait cannot be the last step/)).toBeTruthy();
    expect((screen.getByRole("button", { name: "Save automation" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("is read-only for agents", async () => {
    role = "agent";
    routes["GET /automations"] = () => ({ body: [automation] });
    renderPage(<AutomationsPage />);
    await screen.findByText("Pricing");
    expect(screen.queryByRole("button", { name: /New automation/ })).toBeNull();
    expect(screen.queryByRole("switch")).toBeNull();
  });
});

describe("AI agents", () => {
  beforeEach(() => {
    routes["GET /ai/agents"] = () => ({ body: [agent] });
    routes["GET /ai/settings"] = () => ({ body: { provider: "anthropic", hasKey: true, keyLast4: "ab12", lastError: null, lastErrorAt: null } });
  });

  it("shows the key status without the key, usage and knowledge", async () => {
    renderPage(<AiAgentsPage />);
    expect(await screen.findByText("Anthropic (Claude) · key ending in ab12")).toBeTruthy();
    expect(screen.getByText("Opening hours")).toBeTruthy();
    expect(screen.getByText(/12 replies · 2 handed over/)).toBeTruthy();
  });

  it("saves a new Anthropic key by default", async () => {
    routes["GET /ai/settings"] = () => ({ body: { provider: "anthropic", hasKey: false, keyLast4: null, lastError: null, lastErrorAt: null } });
    routes["PUT /ai/settings/key"] = () => ({ body: { hasKey: true } });
    renderPage(<AiAgentsPage />);
    const input = await screen.findByLabelText("API key");
    const save = screen.getByRole("button", { name: "Save key" }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    fireEvent.change(input, { target: { value: "sk-ant-api03-" + "x".repeat(30) } });
    fireEvent.click(save);
    await waitFor(() => expect(calls.find((c) => c.key === "PUT /ai/settings/key")?.body).toEqual({ provider: "anthropic", apiKey: "sk-ant-api03-" + "x".repeat(30) }));
  });

  it("lets you connect OpenAI instead", async () => {
    routes["GET /ai/settings"] = () => ({ body: { provider: "anthropic", hasKey: false, keyLast4: null, lastError: null, lastErrorAt: null } });
    routes["PUT /ai/settings/key"] = () => ({ body: { hasKey: true } });
    renderPage(<AiAgentsPage />);
    fireEvent.change(await screen.findByLabelText("Provider"), { target: { value: "openai" } });
    expect(screen.getByText(/platform.openai.com\/api-keys/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("API key"), { target: { value: "sk-proj-" + "y".repeat(30) } });
    fireEvent.click(screen.getByRole("button", { name: "Save key" }));
    await waitFor(() => expect(calls.find((c) => c.key === "PUT /ai/settings/key")?.body).toEqual({ provider: "openai", apiKey: "sk-proj-" + "y".repeat(30) }));
  });

  it("warns before switching provider when a key is already saved", async () => {
    const confirmSpy = vi.fn(() => false);
    vi.stubGlobal("confirm", confirmSpy);
    routes["PUT /ai/settings/key"] = () => ({ body: {} });
    renderPage(<AiAgentsPage />);
    await screen.findByText("Anthropic (Claude) · key ending in ab12"); // wait until the saved key is known
    fireEvent.change(await screen.findByLabelText("Provider"), { target: { value: "openai" } });
    fireEvent.change(screen.getByLabelText("API key"), { target: { value: "sk-proj-" + "y".repeat(30) } });
    fireEvent.click(screen.getByRole("button", { name: "Switch to OpenAI" }));
    expect(confirmSpy).toHaveBeenCalledWith(expect.stringMatching(/paused and moved to gpt-4o-mini/));
    expect(calls.some((c) => c.key === "PUT /ai/settings/key")).toBe(false); // cancelled
  });

  it("offers the connected provider's models when editing an agent", async () => {
    routes["GET /ai/settings"] = () => ({ body: { provider: "openai", hasKey: true, keyLast4: "ab12", lastError: null, lastErrorAt: null } });
    routes["GET /ai/agents"] = () => ({ body: [{ ...agent, model: "gpt-4o-mini" }] });
    renderPage(<AiAgentsPage />);
    fireEvent.click(await screen.findByRole("button", { name: /Edit$/ }));
    const select = (await screen.findByLabelText(/^Model \(/)) as HTMLSelectElement;
    const options = Array.from(select.options).map((o) => o.value);
    expect(options).toEqual(expect.arrayContaining(["gpt-4o-mini", "gpt-4o", "__custom"]));
    expect(options.some((o) => o.startsWith("claude-"))).toBe(false);
    fireEvent.change(select, { target: { value: "__custom" } });
    expect(screen.getByLabelText("Model name")).toBeTruthy();
  });

  it("turns the agent on", async () => {
    routes["PATCH /ai/agents/g1/status"] = () => ({ body: {} });
    renderPage(<AiAgentsPage />);
    fireEvent.click(await screen.findByRole("switch", { name: "Asha answers customers" }));
    await waitFor(() => expect(calls.find((c) => c.key === "PATCH /ai/agents/g1/status")?.body).toEqual({ status: "active" }));
  });

  it("cannot be turned on without a key", async () => {
    routes["GET /ai/settings"] = () => ({ body: { provider: "anthropic", hasKey: false, keyLast4: null, lastError: null, lastErrorAt: null } });
    renderPage(<AiAgentsPage />);
    const toggle = (await screen.findByRole("switch", { name: "Asha answers customers" })) as HTMLButtonElement;
    expect(toggle.disabled).toBe(true);
  });

  it("tests the agent in a chat that sends nothing to WhatsApp", async () => {
    routes["POST /ai/agents/g1/test"] = () => ({ body: { text: "We open at 10.", handedOver: false, inputTokens: 5, outputTokens: 5 } });
    renderPage(<AiAgentsPage />);
    fireEvent.change(await screen.findByLabelText("Test message"), { target: { value: "When do you open?" } });
    fireEvent.click(screen.getByRole("button", { name: "Send test message" }));
    expect(await screen.findByText("We open at 10.")).toBeTruthy();
    expect(calls.find((c) => c.key === "POST /ai/agents/g1/test")?.body).toEqual({ messages: [{ role: "user", text: "When do you open?" }] });
  });

  it("adds a knowledge entry", async () => {
    routes["POST /ai/agents/g1/knowledge"] = () => ({ status: 201, body: {} });
    renderPage(<AiAgentsPage />);
    fireEvent.click(await screen.findByRole("button", { name: /Add knowledge/ }));
    fireEvent.change(await screen.findByLabelText("Title"), { target: { value: "Delivery" } });
    fireEvent.change(screen.getByLabelText("Details"), { target: { value: "Free above Rs 500" } });
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(calls.find((c) => c.key === "POST /ai/agents/g1/knowledge")?.body).toEqual({ title: "Delivery", content: "Free above Rs 500" }));
  });
});

describe("Integrations", () => {
  it("lists webhooks and is honest about what is not available", async () => {
    routes["GET /webhook-endpoints"] = () => ({ body: [endpoint] });
    renderPage(<IntegrationsPage />);
    expect(await screen.findByText("Zapier")).toBeTruthy();
    expect(screen.getByText("https://hooks.zapier.com/x")).toBeTruthy();
    expect(screen.getAllByText("Coming soon").length).toBeGreaterThanOrEqual(6);
    expect(screen.queryByText(/Connect in demo/i)).toBeNull();
  });

  it("creates a webhook and shows the signing secret once", async () => {
    routes["GET /webhook-endpoints"] = () => ({ body: [] });
    routes["POST /webhook-endpoints"] = () => ({ status: 201, body: { ...endpoint, secret: "whsec_abc123" } });
    renderPage(<IntegrationsPage />);
    fireEvent.click((await screen.findAllByRole("button", { name: /Add webhook/ }))[0]!);
    fireEvent.change(await screen.findByLabelText("Name"), { target: { value: "Make" } });
    fireEvent.change(screen.getByLabelText("URL"), { target: { value: "https://hook.make.com/abc" } });
    fireEvent.click(screen.getByRole("button", { name: "Create webhook" }));

    expect(await screen.findByDisplayValue("whsec_abc123")).toBeTruthy();
    expect(calls.find((c) => c.key === "POST /webhook-endpoints")?.body).toEqual({
      name: "Make", url: "https://hook.make.com/abc", events: ["message.received"], active: true,
    });
  });

  it("sends a test event", async () => {
    routes["GET /webhook-endpoints"] = () => ({ body: [endpoint] });
    routes["POST /webhook-endpoints/w1/test"] = () => ({ status: 202 });
    routes["GET /webhook-endpoints/w1/deliveries"] = () => ({ body: [] });
    renderPage(<IntegrationsPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Send a test event to Zapier" }));
    await waitFor(() => expect(calls.some((c) => c.key === "POST /webhook-endpoints/w1/test")).toBe(true));
  });
});
