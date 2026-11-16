import { beforeEach, describe, expect, it } from "vitest";
import { REQ_FLOW, TICKET_FLOW } from "@/lib/admin/modules";
import { db, BusinessService, OnboardingService, TokenService } from "@/services/admin";
import { resetAllDemoData } from "@/lib/admin/store";

beforeEach(() => { localStorage.clear(); resetAllDemoData(); });

describe("request & ticket transitions", () => {
  it("closed requests cannot change", () => expect(REQ_FLOW.Closed).toEqual([]));
  it("rejected requests can only be closed", () => expect(REQ_FLOW.Rejected).toEqual(["Closed"]));
  it("closed tickets can only be reopened", () => expect(TICKET_FLOW.Closed).toEqual(["Open"]));
});

describe("cross-module sync", () => {
  it("suspending a business suspends its subscription and AI access", () => {
    BusinessService.setStatus("BIZ-1001", "Suspended");
    expect(db.subscriptions.getAll().find((s) => s.businessId === "BIZ-1001")!.status).toBe("Suspended");
    expect(db.tokens.get("TOK-BIZ-1001")!.aiEnabled).toBe(false);
    BusinessService.setStatus("BIZ-1001", "Active");
    expect(db.subscriptions.getAll().find((s) => s.businessId === "BIZ-1001")!.status).toBe("Active");
    expect(db.tokens.get("TOK-BIZ-1001")!.aiEnabled).toBe(true);
  });
  it("onboarding a business creates business, trial subscription and token account", () => {
    const rec = OnboardingService.create({ name: "Test Co", industry: "Retail", owner: "A B", email: "a@b.in", phone: "1", plan: "Growth", cycle: "Monthly", trial: 14, manager: "Priya Nair" });
    const biz = db.businesses.get(rec.businessId)!;
    expect(biz.status).toBe("Trial");
    expect(db.subscriptions.getAll().find((s) => s.businessId === biz.id)!.status).toBe("Trial");
    expect(db.tokens.get(`TOK-${biz.id}`)!.allowance).toBe(1000000);
  });
  it("changing plan updates subscription and token allowance", () => {
    BusinessService.changePlan("BIZ-1001", "Enterprise");
    expect(db.subscriptions.getAll().find((s) => s.businessId === "BIZ-1001")!.plan).toBe("Enterprise");
    expect(db.tokens.get("TOK-BIZ-1001")!.allowance).toBe(25000000);
  });
  it("bonus tokens are tracked separately with a reason and audit entry", () => {
    const before = db.tokens.get("TOK-BIZ-1002")!;
    TokenService.adjust("TOK-BIZ-1002", "Add bonus", 5000, "goodwill");
    const after = db.tokens.get("TOK-BIZ-1002")!;
    expect(after.bonus).toBe(before.bonus + 5000);
    expect(after.allowance).toBe(before.allowance);
    expect(after.adjustments[0].reason).toBe("goodwill");
    expect(db.audit.getAll()[0].action).toBe("Token adjustment");
  });
  it("rejects non-positive token adjustments", () => {
    const before = db.tokens.get("TOK-BIZ-1002")!.bonus;
    TokenService.adjust("TOK-BIZ-1002", "Add bonus", -10, "x");
    expect(db.tokens.get("TOK-BIZ-1002")!.bonus).toBe(before);
  });
});
