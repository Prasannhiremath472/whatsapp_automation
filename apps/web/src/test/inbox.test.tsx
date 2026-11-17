import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

vi.mock("@/lib/auth", () => ({
  useSession: () => ({
    user: { id: "u1", email: "a@x.test", displayName: "Admin", role: "tenant_admin", tenantId: "t1" },
    tenant: { id: "t1", name: "Acme", slug: "acme", businessCategory: null, timezone: "Asia/Kolkata" },
  }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import InboxPage from "@/routes/inbox";

const iso = (hoursAgo: number) => new Date(Date.now() - hoursAgo * 3600_000).toISOString();

const conversation = (over: Record<string, unknown>) => ({
  id: "c1",
  status: "open",
  assignedAgentId: null,
  assignedAgent: null,
  lastMessageAt: iso(1),
  unreadCount: 0,
  windowExpiresAt: new Date(Date.now() + 23 * 3600_000).toISOString(),
  contact: { id: "p1", waId: "919800000001", displayName: "Priya Sharma", profileName: null, email: null, notes: null, optedOut: false },
  contactTags: [],
  lastMessage: { direction: "inbound", messageType: "text", preview: "What courses do you offer?", status: "delivered", createdAt: iso(1) },
  ...over,
});

const approved = {
  id: "t-1",
  name: "reopen_chat",
  category: "Marketing",
  language: "en",
  headerType: "none",
  headerText: null,
  headerMediaUrl: null,
  body: "Hi {{1}}, can we help?",
  footer: null,
  buttons: [],
  status: "approved",
  rejectionReason: null,
  bodyVariableCount: 1,
  headerVariableCount: 0,
  createdAt: iso(100),
  updatedAt: iso(100),
};

type Handler = (url: URL, init: RequestInit) => { status?: number; body?: unknown };
let routes: Record<string, Handler> = {};
const calls: { key: string; body: unknown }[] = [];

beforeEach(() => {
  calls.length = 0;
  routes = {
    "GET /message-templates": () => ({ body: [approved] }),
    "GET /users": () => ({ body: [{ id: "u1", displayName: "Admin", role: "tenant_admin", isActive: true }] }),
    "POST /conversations/c1/read": () => ({ body: {} }),
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
      return new Response(JSON.stringify(body ?? {}), { status });
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderPage(ui: ReactNode = <InboxPage />) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

const openChat = async (name: string) => {
  fireEvent.click(await screen.findByRole("button", { name: new RegExp(name) }));
};

describe("Team inbox", () => {
  it("shows the real conversations, not demo data, and an empty state when there are none", async () => {
    routes["GET /conversations"] = () => ({ body: [] });
    renderPage();
    expect(await screen.findByText(/No conversations yet/)).toBeTruthy();
    expect(screen.queryByText("Priya Sharma")).toBeNull();
  });

  it("lists conversations with preview and unread count, and opens a chat", async () => {
    routes["GET /conversations"] = () => ({ body: [conversation({ unreadCount: 2 })] });
    routes["GET /conversations/c1/messages"] = () => ({
      body: [
        { id: "m2", direction: "inbound", senderType: "customer", messageType: "text", text: "What courses do you offer?", status: "delivered", errorDetail: null, createdAt: iso(1) },
        { id: "m1", direction: "outbound", senderType: "bot", messageType: "text", text: "Hi! I'm Genie.", status: "read", errorDetail: null, createdAt: iso(1.1) },
      ],
    });
    renderPage();
    await openChat("Priya Sharma");

    expect(await screen.findByText("Hi! I'm Genie.")).toBeTruthy();
    expect(screen.getAllByText("What courses do you offer?").length).toBe(2); // list preview + chat bubble
    expect(screen.getByText("Auto-reply")).toBeTruthy();
    // Opening the chat clears the unread badge on the server.
    await waitFor(() => expect(calls.some((c) => c.key === "POST /conversations/c1/read")).toBe(true));
  });

  it("sends a free-text reply while the 24-hour window is open", async () => {
    routes["GET /conversations"] = () => ({ body: [conversation({})] });
    routes["GET /conversations/c1/messages"] = () => ({ body: [] });
    routes["POST /conversations/c1/messages"] = () => ({ status: 201, body: { id: "m9" } });
    renderPage();
    await openChat("Priya Sharma");

    fireEvent.change(await screen.findByLabelText("Message"), { target: { value: "Hello Priya" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() =>
      expect(calls.find((c) => c.key === "POST /conversations/c1/messages")?.body).toEqual({ messageType: "text", text: "Hello Priya" }),
    );
  });

  it("blocks free text after the window closed and sends a template instead", async () => {
    routes["GET /conversations"] = () => ({ body: [conversation({ windowExpiresAt: iso(5) })] });
    routes["GET /conversations/c1/messages"] = () => ({ body: [] });
    routes["POST /conversations/c1/template-messages"] = () => ({ status: 201, body: { id: "m10" } });
    renderPage();
    await openChat("Priya Sharma");

    expect(await screen.findByText(/24-hour reply window is closed/)).toBeTruthy();
    expect(screen.queryByLabelText("Message")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /Send a template/ }));
    fireEvent.change(await screen.findByLabelText("Template"), { target: { value: "t-1" } });
    const send = screen.getByRole("button", { name: "Send template" }) as HTMLButtonElement;
    expect(send.disabled).toBe(true); // the {{1}} value is still empty
    fireEvent.change(await screen.findByLabelText("Value for {{1}}"), { target: { value: "Priya" } });
    expect(send.disabled).toBe(false);
    fireEvent.click(send);

    await waitFor(() =>
      expect(calls.find((c) => c.key === "POST /conversations/c1/template-messages")?.body).toEqual({
        templateId: "t-1",
        bodyVars: ["Priya"],
        headerVars: [],
      }),
    );
  });

  it("resolves a conversation", async () => {
    routes["GET /conversations"] = () => ({ body: [conversation({})] });
    routes["GET /conversations/c1/messages"] = () => ({ body: [] });
    routes["PATCH /conversations/c1/status"] = () => ({ body: {} });
    renderPage();
    await openChat("Priya Sharma");
    fireEvent.click(await screen.findByRole("button", { name: "Resolve" }));
    await waitFor(() =>
      expect(calls.find((c) => c.key === "PATCH /conversations/c1/status")?.body).toEqual({ status: "closed" }),
    );
  });
});
