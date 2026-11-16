import { describe, expect, it } from "vitest";
import {
  fillPreviewVariables,
  sampleTemplates,
  templateCategories,
} from "@/components/whatsapp/templates-data";

describe("template sample data", () => {
  it("provides at least one sample template per category", () => {
    for (const category of templateCategories) {
      expect(
        sampleTemplates.some((t) => t.category === category),
        `missing sample for ${category}`,
      ).toBe(true);
    }
  });

  it("covers every approval status", () => {
    const statuses = new Set(sampleTemplates.map((t) => t.status));
    for (const s of ["draft", "pending", "approved", "rejected"] as const) {
      expect(statuses.has(s), `missing status ${s}`).toBe(true);
    }
  });

  it("replaces variable placeholders in preview text", () => {
    expect(fillPreviewVariables("Hi {{1}}, order {{2}}")).not.toMatch(/\{\{\d+\}\}/);
  });
});
