import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

vi.mock("@/lib/auth", () => ({
  useSession: () => ({
    user: { id: "u1", email: "a@x.test", displayName: "Priya Owner", role: "tenant_admin", tenantId: "t1" },
    tenant: { id: "t1", name: "Acme", slug: "acme", businessCategory: null, timezone: "Asia/Kolkata" },
  }),
}));
// Recharts measures its container, which jsdom cannot do; the numbers are what matter here.
vi.mock("recharts", async () => {
  const React = await import("react");
  const Stub = ({ children }: { children?: React.ReactNode }) => React.createElement("div", null, children);
  return {
    Area: Stub, AreaChart: Stub, Bar: Stub, BarChart: Stub, CartesianGrid: Stub, Cell: Stub, Line: Stub,
    LineChart: Stub, Pie: Stub, PieChart: Stub, ResponsiveContainer: Stub, Tooltip: Stub, XAxis: Stub, YAxis: Stub,
  };
});

import { AnalyticsPage, DashboardPage } from "@/components/analytics/AnalyticsViews";
import { changePercent, formatDuration, percent } from "@/api/analytics";

const overview = {
  range: "7d",
  since: new Date().toISOString(),
  messages: { sent: 1200, delivered: 1100, read: 600, failed: 40, inbound: 300, previousSent: 1000, previousInbound: 0 },
  conversations: { started: 80, previousStarted: 100, open: 12, unread: 3, avgFirstResponseSeconds: 138 },
  contacts: { total: 5400, new: 250, previousNew: 200, optedOut: 9 },
  daily: [
    { date: "2026-11-16", inbound: 100, outbound: 400, newContacts: 100 },
    { date: "2026-11-17", inbound: 200, outbound: 800, newContacts: 150 },
  ],
  campaigns: {
    total: 2,
    running: 1,
    recent: [{ id: "c1", name: "Diwali Sale", status: "running", total: 1000, sent: 800, delivered: 700, read: 400, failed: 20, createdAt: new Date().toISOString() }],
  },
};

const requested: string[] = [];
beforeEach(() => {
  requested.length = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL) => {
      const url = new URL(String(input));
      const path = url.pathname.replace(/^\/api\/v1/, "");
      requested.push(path + url.search);
      const body =
        path === "/analytics/overview"
          ? overview
          : path === "/conversations"
            ? []
            : path === "/whatsapp-accounts"
              ? [{ id: "a1", wabaId: "1", phoneNumberId: "2", displayPhoneNumber: "+91 84214 22945", status: "connected", isMock: false, dailyMessageLimit: null, connectedAt: null }]
              : path === "/message-templates"
                ? [{ id: "t1" }]
                : {};
      return new Response(JSON.stringify(body), { status: 200 });
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const renderPage = (ui: React.ReactNode) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );

describe("analytics helpers", () => {
  it("formats durations, percentages and period-over-period change", () => {
    expect(formatDuration(null)).toBe("—");
    expect(formatDuration(45)).toBe("45s");
    expect(formatDuration(138)).toBe("2m 18s");
    expect(formatDuration(4000)).toBe("1h 6m");
    expect(percent(0, 0)).toBe("0%");
    expect(percent(1100, 1200)).toBe("91.7%");
    expect(changePercent(1200, 1000)).toBe(20);
    expect(changePercent(80, 100)).toBe(-20);
    expect(changePercent(5, 0)).toBeNull();
    expect(changePercent(0, 0)).toBe(0);
  });
});

describe("Dashboard", () => {
  it("shows the real numbers from the API for the last 7 days", async () => {
    renderPage(<DashboardPage />);
    expect(await screen.findByText("Hello, Priya")).toBeTruthy();
    expect(await screen.findByText("5,400")).toBeTruthy(); // contacts
    expect(screen.getByText("1,200")).toBeTruthy(); // messages sent
    expect(screen.getByText("2m 18s")).toBeTruthy(); // first reply time
    expect(screen.getByText("Diwali Sale")).toBeTruthy();
    expect(screen.getByText(/\+20%/)).toBeTruthy(); // 1200 vs 1000
    expect(screen.getByText("+91 84214 22945")).toBeTruthy();
    expect(requested).toContain("/analytics/overview?range=7d");
  });

  it("does not claim a setup step is open when everything is done", async () => {
    renderPage(<DashboardPage />);
    await screen.findByText("5,400");
    await waitFor(() => expect(screen.queryByText("Get your business ready")).toBeNull());
  });
});

describe("Analytics", () => {
  it("shows delivery, failure and reply metrics", async () => {
    renderPage(<AnalyticsPage />);
    expect(await screen.findByText("Messages received")).toBeTruthy();
    expect(screen.getByText("91.7% delivery rate")).toBeTruthy();
    expect(screen.getByText("50% read rate")).toBeTruthy();
    expect(screen.getByText("3.2% failure rate")).toBeTruthy(); // 40 of 1240
    expect(screen.getByText("+250")).toBeTruthy();
    expect(screen.getByText(/9 contact\(s\) have opted out/)).toBeTruthy();
  });
});
