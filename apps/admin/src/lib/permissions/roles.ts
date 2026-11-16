/**
 * Frontend role simulation. This only shapes the UI — it is NOT security.
 * Production must enforce the same matrix server-side (RLS / RBAC).
 */
export type Role = "super_admin" | "support" | "finance" | "operations";

export type PermGroup =
  | "dashboard"
  | "businesses"
  | "onboarding"
  | "requests"
  | "subscriptions"
  | "finance"
  | "ai"
  | "whatsapp"
  | "support"
  | "communication"
  | "analytics"
  | "operations"
  | "settings";

export type Level = "none" | "view" | "manage";

export const ROLE_LABEL: Record<Role, string> = {
  super_admin: "Super Admin",
  support: "Support Staff",
  finance: "Finance Staff",
  operations: "Operations Staff",
};

export const ALL_GROUPS: PermGroup[] = [
  "dashboard", "businesses", "onboarding", "requests", "subscriptions", "finance", "ai",
  "whatsapp", "support", "communication", "analytics", "operations", "settings",
];

const m = (manage: PermGroup[], view: PermGroup[]) =>
  Object.fromEntries(
    ALL_GROUPS.map((g) => [g, manage.includes(g) ? "manage" : view.includes(g) ? "view" : "none"]),
  ) as Record<PermGroup, Level>;

export const DEFAULT_MATRIX: Record<Role, Record<PermGroup, Level>> = {
  super_admin: m(ALL_GROUPS, []),
  support: m(["requests", "support", "communication"], ["dashboard", "businesses", "onboarding", "whatsapp", "ai"]),
  finance: m(["finance", "subscriptions"], ["dashboard", "businesses", "requests", "analytics"]),
  operations: m(["onboarding", "whatsapp", "ai", "operations"], ["dashboard", "businesses", "requests", "support", "analytics"]),
};

export function can(role: Role, group: PermGroup, level: Exclude<Level, "none"> = "view") {
  const l = DEFAULT_MATRIX[role][group];
  return level === "view" ? l !== "none" : l === "manage";
}
