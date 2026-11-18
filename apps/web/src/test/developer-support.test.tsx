import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

let role: "tenant_admin" | "agent" = "tenant_admin";
vi.mock("@/lib/auth", () => ({
  useSession: () => ({
    user: { id: "u1", email: "a@x.test", displayName: "Owner", role, tenantId: "t1" },
    tenant: { id: "t1", name: "Acme", slug: "acme", businessCategory: null, timezone: "Asia/Kolkata" },
  }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { ApiKeysPage } from "@/components/developer/ApiKeysPage";
import { ApiDocsPage, ApiLogsPage, GetStartedPage } from "@/components/developer/DeveloperPages";
import { HelpPage } from "@/components/support/HelpPage";

type Handler = (url: URL, init: RequestInit) => { status?: number; body?: unknown };
let routes: Record<string, Handler> = {};
const calls: { key: string; search: string; body: unknown }[] = [];
const iso = () => new Date().toISOString();

const apiKey = { id: "k1", name: "Store backend", prefix: "gk_live_a1b2c3d4", scopes: ["messages:send", "contacts:read"], lastUsedAt: iso(), requestCount: 42, expiresAt: null, revokedAt: null, createdAt: iso() };
const openapi = {
  info: { title: "Genie public API", version: "1.0.0", description: "Send WhatsApp messages from your own software." },
  servers: [{ url: "https://api.example.com" }],
  paths: {
    "/public/v1/messages": { post: { summary: "Send a message", description: "Scope: messages:send.", requestBody: { content: { "application/json": { examples: { template: { summary: "Template", value: { to: "+919876543210", type: "template" } } } } } }, responses: { 201: { description: "Accepted by WhatsApp" }, 429: { description: "Rate limit exceeded" } } } },
    "/public/v1/templates": { get: { summary: "List approved templates", responses: { 200: { description: "Approved templates" } } } },
  },
};

beforeEach(() => {
  role = "tenant_admin";
  calls.length = 0;
  routes = {};
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL, init: RequestInit = {}) => {
      const url = new URL(String(input));
      const path = url.pathname.replace(/^\/api\/v1/, "");
      const key = `${init.method ?? "GET"} ${path}`;
      calls.push({ key, search: url.search, body: init.body ? JSON.parse(String(init.body)) : undefined });
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
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );

describe("API keys", () => {
  it("lists keys by prefix only and creates one, showing the secret once", async () => {
    routes["GET /api-keys"] = () => ({ body: [apiKey] });
    routes["POST /api-keys"] = () => ({ status: 201, body: { ...apiKey, id: "k2", name: "Reports", secret: "gk_live_SECRETSECRETSECRET" } });
    renderPage(<ApiKeysPage />);
    expect(await screen.findByText("Store backend")).toBeTruthy();
    expect(screen.getByText("gk_live_a1b2c3d4…")).toBeTruthy();
    expect(screen.getByText("messages:send, contacts:read")).toBeTruthy();

    fireEvent.click(screen.getAllByRole("button", { name: /Create API key/ })[0]!);
    fireEvent.change(await screen.findByLabelText("Name"), { target: { value: "Reports" } });
    fireEvent.click(screen.getByLabelText(/Read contacts/));
    fireEvent.click(screen.getByRole("button", { name: "Create key" }));

    expect(await screen.findByDisplayValue("gk_live_SECRETSECRETSECRET")).toBeTruthy();
    expect(calls.find((c) => c.key === "POST /api-keys")?.body).toEqual({ name: "Reports", scopes: ["messages:send", "contacts:read"] });
  });

  it("will not create a key without a permission", async () => {
    routes["GET /api-keys"] = () => ({ body: [] });
    renderPage(<ApiKeysPage />);
    fireEvent.click((await screen.findAllByRole("button", { name: /Create API key/ }))[0]!);
    fireEvent.change(await screen.findByLabelText("Name"), { target: { value: "x" } });
    fireEvent.click(screen.getByLabelText(/Send WhatsApp messages/)); // untick the default
    expect((screen.getByRole("button", { name: "Create key" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("revokes a key after confirmation", async () => {
    vi.stubGlobal("confirm", () => true);
    routes["GET /api-keys"] = () => ({ body: [apiKey] });
    routes["DELETE /api-keys/k1"] = () => ({ body: {} });
    renderPage(<ApiKeysPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Revoke Store backend" }));
    await waitFor(() => expect(calls.some((c) => c.key === "DELETE /api-keys/k1")).toBe(true));
  });

  it("tells non-admins why they cannot see keys", async () => {
    role = "agent";
    routes["GET /api-keys"] = () => ({ status: 403, body: { message: "Forbidden" } });
    renderPage(<ApiKeysPage />);
    expect(await screen.findByText("Only business admins can manage API keys.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Create API key/ })).toBeNull();
  });
});

describe("API logs", () => {
  it("shows requests, errors and the summary, and filters errors", async () => {
    routes["GET /api-logs/summary"] = () => ({ body: { requests: 120, errors: 6, avgDurationMs: 85 } });
    routes["GET /api-logs"] = () => ({
      body: {
        items: [
          { id: "l1", apiKeyId: "k1", apiKeyName: "Store backend", method: "POST", path: "/public/v1/messages", status: 201, durationMs: 120, ip: "1.2.3.4", error: null, createdAt: iso() },
          { id: "l2", apiKeyId: "k1", apiKeyName: "Store backend", method: "POST", path: "/public/v1/messages", status: 422, durationMs: 30, ip: "1.2.3.4", error: "The 24-hour reply window is closed", createdAt: iso() },
        ],
        total: 2, page: 1, pageSize: 25,
      },
    });
    renderPage(<ApiLogsPage />);
    expect(await screen.findByText("Success 201")).toBeTruthy();
    expect(screen.getByText("Failed 422")).toBeTruthy();
    expect(screen.getByText("The 24-hour reply window is closed")).toBeTruthy();
    expect(screen.getByText("5%")).toBeTruthy(); // 6 of 120
    expect(screen.getByText("85 ms")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Show"), { target: { value: "error" } });
    await waitFor(() => expect(calls.some((c) => c.key === "GET /api-logs" && c.search.includes("status=error"))).toBe(true));
  });
});

describe("API documentation", () => {
  it("renders the live OpenAPI description", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL) => {
        expect(String(input)).toMatch(/\/public\/v1\/openapi\.json$/);
        return new Response(JSON.stringify(openapi), { status: 200 });
      }),
    );
    renderPage(<ApiDocsPage />);
    expect(await screen.findByText("Send a message")).toBeTruthy();
    expect(screen.getByText("/public/v1/messages")).toBeTruthy();
    expect(screen.getByText("List approved templates")).toBeTruthy();
    expect(screen.getByText(/Rate limit exceeded/)).toBeTruthy();
    expect(screen.getByText(/"type": "template"/)).toBeTruthy(); // the example body
  });
});

describe("Get started", () => {
  it("shows the API address and example", async () => {
    routes["GET /api-keys"] = () => ({ body: [] });
    routes["GET /whatsapp-accounts"] = () => ({ body: [] });
    renderPage(<GetStartedPage />);
    expect(await screen.findByText("Create an API key")).toBeTruthy();
    expect(screen.getAllByText(/\/public\/v1/).length).toBeGreaterThan(0);
    expect(screen.getByText(/gk_live_YOUR_KEY/)).toBeTruthy();
  });
});

describe("Help & Support", () => {
  const ticket = { id: "t1", subject: "Template stuck", category: "Templates", priority: "high", status: "open", createdByName: "Owner", createdAt: iso(), lastMessageAt: iso() };
  const detail = { ...ticket, messages: [{ id: "m1", authorType: "customer", authorName: "Owner", body: "Pending for two days.", createdAt: iso() }, { id: "m2", authorType: "support", authorName: "Genie Support", body: "We are looking into it.", createdAt: iso() }] };

  it("opens a ticket, then shows its conversation", async () => {
    routes["GET /support/tickets"] = () => ({ body: [] });
    routes["POST /support/tickets"] = () => ({ status: 201, body: detail });
    routes["GET /support/tickets/t1"] = () => ({ body: detail });
    renderPage(<HelpPage />);
    fireEvent.click(await screen.findByRole("button", { name: /New ticket/ }));
    fireEvent.change(await screen.findByLabelText("Subject"), { target: { value: "Template stuck" } });
    fireEvent.change(screen.getByLabelText("Topic"), { target: { value: "Templates" } });
    fireEvent.change(screen.getByLabelText("Urgency"), { target: { value: "high" } });
    fireEvent.change(screen.getByLabelText("Details"), { target: { value: "Pending for two days." } });
    fireEvent.click(screen.getByRole("button", { name: "Open ticket" }));

    expect(await screen.findByText("We are looking into it.")).toBeTruthy();
    expect(calls.find((c) => c.key === "POST /support/tickets")?.body).toEqual({ subject: "Template stuck", category: "Templates", priority: "high", message: "Pending for two days." });
  });

  it("lists existing tickets and sends a reply", async () => {
    routes["GET /support/tickets"] = () => ({ body: [ticket] });
    routes["GET /support/tickets/t1"] = () => ({ body: detail });
    routes["POST /support/tickets/t1/messages"] = () => ({ status: 201, body: detail });
    renderPage(<HelpPage />);
    fireEvent.click(await screen.findByRole("button", { name: /Template stuck/ }));
    fireEvent.change(await screen.findByLabelText("Your reply"), { target: { value: "Any news?" } });
    fireEvent.click(screen.getByRole("button", { name: "Send reply" }));
    await waitFor(() => expect(calls.find((c) => c.key === "POST /support/tickets/t1/messages")?.body).toEqual({ message: "Any news?" }));
  });

  it("links the guides to the right screens", async () => {
    routes["GET /support/tickets"] = () => ({ body: [] });
    renderPage(<HelpPage />);
    const guide = await screen.findByRole("link", { name: /Connect your own software/ });
    expect(guide.getAttribute("href")).toBe("/developer");
  });
});
