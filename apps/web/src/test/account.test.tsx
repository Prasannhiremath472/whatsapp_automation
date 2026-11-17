import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const logout = vi.fn().mockResolvedValue(undefined);
const refreshProfile = vi.fn().mockResolvedValue(undefined);
let role: "tenant_admin" | "agent" = "tenant_admin";

vi.mock("@/lib/auth", () => ({
  useSession: () => ({
    user: { id: "u1", email: "owner@acme.test", displayName: "Owner", role, tenantId: "t1" },
    tenant: { id: "t1", name: "Acme", slug: "acme", businessCategory: "Retail", timezone: "Asia/Kolkata" },
  }),
  useAuth: () => ({ logout, refreshProfile }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { BusinessSettingsPage, ProfilePage } from "@/components/settings/SettingsPage";
import { TeamPage } from "@/components/team/TeamPage";

type Handler = (url: URL, init: RequestInit) => { status?: number; body?: unknown };
let routes: Record<string, Handler> = {};
const calls: { key: string; body: unknown }[] = [];

const users = [
  { id: "u1", email: "owner@acme.test", displayName: "Owner", role: "tenant_admin", isActive: true, lastLoginAt: null, tenantId: "t1" },
  { id: "u2", email: "asha@acme.test", displayName: "Asha", role: "agent", isActive: true, lastLoginAt: null, tenantId: "t1" },
];

beforeEach(() => {
  role = "tenant_admin";
  calls.length = 0;
  logout.mockClear();
  refreshProfile.mockClear();
  routes = { "GET /users": () => ({ body: users }) };
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

const renderWith = (ui: React.ReactNode) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}>
      {ui}
    </QueryClientProvider>,
  );

describe("Business settings", () => {
  it("saves name, category and time zone, then refreshes the session", async () => {
    routes["PATCH /tenants/me"] = () => ({ body: {} });
    renderWith(<BusinessSettingsPage />);
    const save = screen.getByRole("button", { name: "Save changes" }) as HTMLButtonElement;
    expect(save.disabled).toBe(true); // nothing changed yet

    fireEvent.change(screen.getByLabelText("Business name"), { target: { value: "Acme Retail" } });
    fireEvent.change(screen.getByLabelText("Time zone"), { target: { value: "Asia/Dubai" } });
    expect(save.disabled).toBe(false);
    fireEvent.click(save);

    await waitFor(() =>
      expect(calls.find((c) => c.key === "PATCH /tenants/me")?.body).toEqual({
        name: "Acme Retail",
        business_category: "Retail",
        timezone: "Asia/Dubai",
      }),
    );
    await waitFor(() => expect(refreshProfile).toHaveBeenCalled());
  });

  it("is read-only for agents", () => {
    role = "agent";
    renderWith(<BusinessSettingsPage />);
    expect((screen.getByLabelText("Business name") as HTMLInputElement).disabled).toBe(true);
    expect(screen.queryByRole("button", { name: "Save changes" })).toBeNull();
  });
});

describe("Profile", () => {
  it("changes the password and then signs out", async () => {
    routes["POST /users/me/password"] = () => ({ status: 204 });
    renderWith(<ProfilePage />);
    const submit = screen.getByRole("button", { name: "Change password" }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);

    fireEvent.change(screen.getByLabelText("Current password"), { target: { value: "oldpassword1" } });
    fireEvent.change(screen.getByLabelText("New password"), { target: { value: "newpassword1" } });
    fireEvent.change(screen.getByLabelText("Confirm new password"), { target: { value: "different" } });
    expect(await screen.findByText("The passwords don't match.")).toBeTruthy();
    expect(submit.disabled).toBe(true);

    fireEvent.change(screen.getByLabelText("Confirm new password"), { target: { value: "newpassword1" } });
    fireEvent.click(submit);
    await waitFor(() =>
      expect(calls.find((c) => c.key === "POST /users/me/password")?.body).toEqual({
        currentPassword: "oldpassword1",
        newPassword: "newpassword1",
      }),
    );
    await waitFor(() => expect(logout).toHaveBeenCalled());
  });

  it("saves the display name", async () => {
    routes["PATCH /users/me"] = () => ({ body: {} });
    renderWith(<ProfilePage />);
    fireEvent.change(screen.getByLabelText("Your name"), { target: { value: "Owner Two" } });
    fireEvent.click(screen.getByRole("button", { name: "Save profile" }));
    await waitFor(() => expect(calls.find((c) => c.key === "PATCH /users/me")?.body).toEqual({ displayName: "Owner Two" }));
  });
});

describe("Team", () => {
  it("lists the business's real users", async () => {
    renderWith(<TeamPage />);
    expect(await screen.findByText("Asha")).toBeTruthy();
    expect(screen.getByText("asha@acme.test")).toBeTruthy();
    expect(screen.getByText("(you)")).toBeTruthy();
  });

  it("adds a user and changes a role", async () => {
    routes["POST /users"] = () => ({ status: 201, body: {} });
    routes["PATCH /users/u2"] = () => ({ body: {} });
    renderWith(<TeamPage />);
    await screen.findByText("Asha");

    fireEvent.change(screen.getByLabelText("Role of Asha"), { target: { value: "tenant_admin" } });
    await waitFor(() => expect(calls.find((c) => c.key === "PATCH /users/u2")?.body).toEqual({ role: "tenant_admin" }));

    fireEvent.click(screen.getByRole("button", { name: /Add user/ }));
    fireEvent.change(await screen.findByLabelText("Full name"), { target: { value: "Ravi" } });
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "ravi@acme.test" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "ravipass123" } });
    fireEvent.click(screen.getAllByRole("button", { name: "Add user" }).at(-1)!);
    await waitFor(() =>
      expect(calls.find((c) => c.key === "POST /users")?.body).toEqual({
        displayName: "Ravi",
        email: "ravi@acme.test",
        password: "ravipass123",
        role: "agent",
      }),
    );
  });

  it("hides management actions from agents", async () => {
    role = "agent";
    renderWith(<TeamPage />);
    await screen.findByText("Asha");
    expect(screen.queryByRole("button", { name: /Add user/ })).toBeNull();
    expect(screen.queryByLabelText("Role of Asha")).toBeNull();
  });
});
