import { describe, expect, it } from "vitest";
import { can } from "@/lib/permissions/roles";

describe("role permissions", () => {
  it("super admin can manage settings", () => expect(can("super_admin", "settings", "manage")).toBe(true));
  it("support staff cannot see finance", () => expect(can("support", "finance")).toBe(false));
  it("finance staff can manage finance", () => expect(can("finance", "finance", "manage")).toBe(true));
  it("operations staff can only view support tickets", () => {
    expect(can("operations", "support")).toBe(true);
    expect(can("operations", "support", "manage")).toBe(false);
  });
});
