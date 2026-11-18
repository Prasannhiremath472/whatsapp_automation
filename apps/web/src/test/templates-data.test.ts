import { describe, expect, it } from "vitest";
import { fillPreviewVariables } from "@/components/whatsapp/templates-data";

describe("template preview samples", () => {
  it("replaces variable placeholders with neutral example values", () => {
    const text = fillPreviewVariables("Hi {{1}}, order {{2}} from {{3}}");
    expect(text).not.toMatch(/\{\{\d+\}\}/);
    expect(text).toBe("Hi Priya, order Acme Store from 10:00 AM");
  });

  it("does not leave any school-demo wording behind", () => {
    expect(fillPreviewVariables("{{1}} {{2}} {{3}} {{4}} {{5}} {{6}} {{7}} {{8}}")).not.toMatch(/Bright Minds|Academy|Course|Admissions/);
  });
});
