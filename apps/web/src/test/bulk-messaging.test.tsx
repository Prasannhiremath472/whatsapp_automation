import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

vi.mock("@/lib/auth", () => ({
  useSession: () => ({
    user: {
      id: "u1",
      email: "admin@acme.test",
      displayName: "Admin",
      role: "tenant_admin",
      tenantId: "t1",
    },
    tenant: {
      id: "t1",
      name: "Acme Retail",
      slug: "acme",
      businessCategory: null,
      timezone: "Asia/Kolkata",
    },
  }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { toast } from "sonner";
import { CampaignsPage } from "@/components/genie/CampaignsPage";
import { ContactsPage } from "@/components/genie/ContactsPage";

type Handler = (url: URL, init: RequestInit) => { status?: number; body?: unknown };
let routes: Record<string, Handler> = {};
const calls: { key: string; body: unknown }[] = [];

beforeEach(() => {
  calls.length = 0;
  routes = {};
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL, init: RequestInit = {}) => {
      const url = new URL(String(input));
      const path = url.pathname.replace(/^\/api\/v1/, "");
      const key = `${init.method ?? "GET"} ${path}`;
      calls.push({ key, body: init.body ? JSON.parse(String(init.body)) : undefined });
      const handler = routes[key];
      if (!handler)
        return new Response(JSON.stringify({ message: `No mock for ${key}` }), { status: 404 });
      const { status = 200, body } = handler(url, init);
      return new Response(status === 204 ? null : JSON.stringify(body ?? {}), { status });
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

function renderPage(ui: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

const counts = { total: 100, sent: 90, delivered: 80, read: 40, failed: 6, skipped: 4, pending: 0 };
const campaign = {
  id: "c1",
  name: "November launch",
  objective: "Promotion",
  description: null,
  status: "completed",
  statusReason: null,
  templateId: "tpl1",
  templateName: "diwali_sale",
  audience: { mode: "all", tags: [], contactIds: [] },
  variableMapping: { header: [], body: [] },
  headerMediaUrl: null,
  scheduledAt: null,
  startedAt: "2026-11-10T04:30:00.000Z",
  completedAt: "2026-11-10T04:40:00.000Z",
  counts,
  createdAt: "2026-11-09T10:00:00.000Z",
};
const page = (data: unknown[]) => ({
  data,
  meta: { page: 1, pageSize: 20, total: data.length, totalPages: 1 },
});

describe("Campaigns page", () => {
  it("lists campaigns with delivery and read rates computed from sent", async () => {
    routes["GET /campaigns"] = () => ({ body: page([campaign]) });
    routes["GET /campaigns/summary"] = () => ({
      body: {
        total: 1,
        completed: 1,
        running: 0,
        scheduled: 0,
        draft: 0,
        paused: 0,
        failed: 0,
        cancelled: 0,
      },
    });

    renderPage(<CampaignsPage />);

    expect(await screen.findByText("November launch")).toBeInTheDocument();
    expect(screen.getByText("diwali_sale")).toBeInTheDocument();
    // 80 delivered / 90 sent = 89%, 40 read / 90 sent = 44%
    expect(screen.getByText("89%")).toBeInTheDocument();
    expect(screen.getByText("44%")).toBeInTheDocument();
    expect(screen.getByText("(6 failed)")).toBeInTheDocument();
  });

  it("creates a campaign through the wizard and launches it", async () => {
    const template = {
      id: "tpl1",
      name: "welcome_offer",
      category: "Marketing",
      language: "en",
      headerType: "none",
      headerText: null,
      body: "Hi {{1}}, our offer ends {{2}}.",
      footer: null,
      buttons: [],
      status: "approved",
      rejectionReason: null,
      bodyVariableCount: 2,
      headerVariableCount: 0,
      createdAt: "2026-11-01T00:00:00.000Z",
      updatedAt: "2026-11-01T00:00:00.000Z",
    };
    routes["GET /campaigns"] = () => ({ body: page([]) });
    routes["GET /campaigns/summary"] = () => ({
      body: {
        total: 0,
        completed: 0,
        running: 0,
        scheduled: 0,
        draft: 0,
        paused: 0,
        failed: 0,
        cancelled: 0,
      },
    });
    routes["GET /message-templates"] = () => ({ body: [template] });
    routes["GET /contacts/tags"] = () => ({ body: [{ name: "VIP", contacts: 5 }] });
    routes["GET /whatsapp-accounts"] = () => ({
      body: [
        {
          id: "a1",
          wabaId: "123456",
          phoneNumberId: "654321",
          displayPhoneNumber: "+1 555 0100",
          status: "connected",
          isMock: false,
          dailyMessageLimit: null,
          connectedAt: null,
        },
      ],
    });
    routes["POST /campaigns/audience-preview"] = () => ({
      body: {
        total: 12,
        eligible: 10,
        optedOut: 2,
        sample: [{ id: "k1", name: "Priya Sharma", phone: "919876543210" }],
      },
    });
    routes["POST /campaigns"] = () => ({ body: { ...campaign, id: "new1", status: "draft" } });
    routes["POST /campaigns/new1/launch"] = () => ({
      body: { ...campaign, id: "new1", status: "running" },
    });

    renderPage(<CampaignsPage />);
    fireEvent.click(await screen.findByRole("button", { name: /create campaign/i }));

    // 1. Details
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText(/campaign name/i), {
      target: { value: "Diwali blast" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: /continue/i }));

    // 2. Audience: preview shows eligible (opted-out excluded)
    await within(dialog).findByText("10");
    expect(within(dialog).getByText(/2 opted out are excluded/)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: /continue/i }));

    // 3. Message
    fireEvent.change(await within(dialog).findByLabelText("Campaign template"), {
      target: { value: "tpl1" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: /continue/i }));

    // 4. Personalize: {{1}} defaults to first name, preview uses the sample contact
    expect(await within(dialog).findByText("Variable {{1}}")).toBeInTheDocument();
    expect(within(dialog).getByText("Variable {{2}}")).toBeInTheDocument();
    expect(within(dialog).getByText(/Hi Priya, our offer ends/)).toBeInTheDocument();
    // {{2}} -> fixed text
    const sources = within(dialog)
      .getAllByRole("combobox")
      .filter((el) => (el as HTMLSelectElement).value === "Contact field");
    fireEvent.change(sources[1]!, { target: { value: "Fixed text" } });
    fireEvent.change(within(dialog).getByLabelText("Text"), { target: { value: "Sunday" } });
    expect(within(dialog).getByText(/our offer ends Sunday/)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: /continue/i }));

    // 5. Schedule: send immediately (default)
    fireEvent.click(within(dialog).getByRole("button", { name: /continue/i }));

    // 6. Review + launch
    fireEvent.click(await within(dialog).findByRole("button", { name: /launch campaign/i }));

    await waitFor(() =>
      expect(calls.some((c) => c.key === "POST /campaigns/new1/launch")).toBe(true),
    );
    const saved = calls.find((c) => c.key === "POST /campaigns")!.body as Record<string, unknown>;
    expect(saved).toMatchObject({
      name: "Diwali blast",
      templateId: "tpl1",
      audience: { mode: "all", tags: [], contactIds: [] },
      schedule: null,
      variableMapping: {
        header: [],
        body: [
          { source: "field", field: "firstName", fallback: "there" },
          { source: "static", value: "Sunday" },
        ],
      },
    });
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith(expect.stringMatching(/launched/i)),
    );
  });

  it("keeps editing the same draft after a rejected launch (no duplicate campaigns)", async () => {
    routes["GET /campaigns"] = () => ({ body: page([]) });
    routes["GET /campaigns/summary"] = () => ({
      body: {
        total: 0,
        completed: 0,
        running: 0,
        scheduled: 0,
        draft: 0,
        paused: 0,
        failed: 0,
        cancelled: 0,
      },
    });
    routes["GET /message-templates"] = () => ({
      body: [
        {
          id: "tpl1",
          name: "plain_offer",
          category: "Marketing",
          language: "en",
          headerType: "none",
          headerText: null,
          body: "Big offer today!",
          footer: null,
          buttons: [],
          status: "approved",
          rejectionReason: null,
          bodyVariableCount: 0,
          headerVariableCount: 0,
          createdAt: "2026-11-01T00:00:00.000Z",
          updatedAt: "2026-11-01T00:00:00.000Z",
        },
      ],
    });
    routes["GET /contacts/tags"] = () => ({ body: [] });
    routes["GET /whatsapp-accounts"] = () => ({
      body: [
        {
          id: "a1",
          wabaId: "1",
          phoneNumberId: "2",
          displayPhoneNumber: null,
          status: "connected",
          isMock: false,
          dailyMessageLimit: null,
          connectedAt: null,
        },
      ],
    });
    routes["POST /campaigns/audience-preview"] = () => ({
      body: { total: 3, eligible: 3, optedOut: 0, sample: [] },
    });
    routes["POST /campaigns"] = () => ({ body: { ...campaign, id: "new1", status: "draft" } });
    routes["PUT /campaigns/new1"] = () => ({ body: { ...campaign, id: "new1", status: "draft" } });
    let launches = 0;
    routes["POST /campaigns/new1/launch"] = () => {
      launches += 1;
      return launches === 1
        ? { status: 400, body: { message: "Only approved templates can be sent." } }
        : { body: { ...campaign, id: "new1", status: "running" } };
    };

    renderPage(<CampaignsPage />);
    fireEvent.click(await screen.findByRole("button", { name: /create campaign/i }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText(/campaign name/i), {
      target: { value: "Retry me" },
    });
    const next = () => fireEvent.click(within(dialog).getByRole("button", { name: /continue/i }));
    next();
    await waitFor(() => expect(within(dialog).getByRole("button", { name: /continue/i })).toBeEnabled());
    next();
    fireEvent.change(await within(dialog).findByLabelText("Campaign template"), {
      target: { value: "tpl1" },
    });
    next();
    next(); // personalise (no variables)
    next(); // schedule
    const launch = await within(dialog).findByRole("button", { name: /launch campaign/i });

    fireEvent.click(launch);
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Only approved templates can be sent."),
    );
    fireEvent.click(within(dialog).getByRole("button", { name: /launch campaign/i }));
    await waitFor(() => expect(launches).toBe(2));

    expect(calls.filter((c) => c.key === "POST /campaigns")).toHaveLength(1); // created once
    expect(calls.filter((c) => c.key === "PUT /campaigns/new1")).toHaveLength(1); // then updated
  });

  it("shows the server's message when launching is rejected", async () => {
    routes["GET /campaigns"] = () => ({
      body: page([{ ...campaign, id: "d1", status: "draft", counts: { ...counts, sent: 0 } }]),
    });
    routes["GET /campaigns/summary"] = () => ({
      body: {
        total: 1,
        draft: 1,
        completed: 0,
        running: 0,
        scheduled: 0,
        paused: 0,
        failed: 0,
        cancelled: 0,
      },
    });
    // Editing a draft opens the wizard prefilled; saving it fails validation server-side.
    routes["GET /message-templates"] = () => ({ body: [] });
    routes["GET /contacts/tags"] = () => ({ body: [] });
    routes["GET /whatsapp-accounts"] = () => ({ body: [] });
    routes["POST /campaigns/audience-preview"] = () => ({
      body: { total: 1, eligible: 1, optedOut: 0, sample: [] },
    });
    routes["PUT /campaigns/d1"] = () => ({
      status: 400,
      body: { message: "Only approved templates can be sent." },
    });

    renderPage(<CampaignsPage />);
    fireEvent.click(await screen.findByRole("button", { name: /edit november launch/i }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: /save draft/i }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Only approved templates can be sent."),
    );
  });
});

describe("Contacts page", () => {
  const contact = {
    id: "k1",
    name: "Priya Sharma",
    phone: "919876543210",
    email: "priya@example.com",
    location: "Pune",
    leadStatus: "New",
    source: "Import",
    notes: null,
    assignedUserId: null,
    assignedUserName: null,
    tags: ["VIP"],
    optedOut: false,
    lastInteractionAt: null,
    createdAt: "2026-11-01T00:00:00.000Z",
  };

  it("renders contacts from the API and flags opted-out contacts", async () => {
    routes["GET /contacts"] = () => ({
      body: {
        data: [
          contact,
          {
            ...contact,
            id: "k2",
            name: "Rahul Mehta",
            phone: "919812345678",
            optedOut: true,
            tags: [],
          },
        ],
        meta: { page: 1, pageSize: 25, total: 2, totalPages: 1 },
      },
    });
    routes["GET /contacts/tags"] = () => ({ body: [{ name: "VIP", contacts: 1 }] });
    routes["GET /contacts/locations"] = () => ({ body: ["Pune"] });

    renderPage(<ContactsPage />);

    expect(await screen.findByText("Priya Sharma")).toBeInTheDocument();
    expect(screen.getByText("+919876543210")).toBeInTheDocument();
    expect(screen.getByText("Opted out")).toBeInTheDocument();
    expect(screen.getByText(/2 contacts · Acme Retail/)).toBeInTheDocument();
  });

  it("sends search and filters to the server, not just the visible page", async () => {
    routes["GET /contacts"] = () => ({
      body: { data: [contact], meta: { page: 1, pageSize: 25, total: 1, totalPages: 1 } },
    });
    routes["GET /contacts/tags"] = () => ({ body: [{ name: "VIP", contacts: 1 }] });
    routes["GET /contacts/locations"] = () => ({ body: [] });
    const seen: string[] = [];
    const original = routes["GET /contacts"]!;
    routes["GET /contacts"] = (url, init) => {
      seen.push(url.search);
      return original(url, init);
    };

    renderPage(<ContactsPage />);
    await screen.findByText("Priya Sharma");
    fireEvent.change(screen.getByLabelText(/search name, phone or email/i), {
      target: { value: "priya" },
    });
    await waitFor(() => expect(seen.some((s) => s.includes("q=priya"))).toBe(true), {
      timeout: 2000,
    });
  });
});
