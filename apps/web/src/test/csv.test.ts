import { describe, expect, it } from "vitest";
import { csvCell, detectDelimiter, parseCSV } from "@/lib/csv";

describe("parseCSV", () => {
  it("parses simple rows", () => {
    expect(parseCSV("name,phone\nPriya,919876543210\nRahul,919812345678")).toEqual([
      ["name", "phone"],
      ["Priya", "919876543210"],
      ["Rahul", "919812345678"],
    ]);
  });

  it("handles quoted commas, escaped quotes and embedded newlines", () => {
    expect(parseCSV('name,notes\n"Sharma, Priya","said ""hi""\nthen left"')).toEqual([
      ["name", "notes"],
      ["Sharma, Priya", 'said "hi"\nthen left'],
    ]);
  });

  it("handles CRLF, a BOM, blank lines and a missing final newline", () => {
    expect(parseCSV("﻿a,b\r\n\r\n1,2\r\n3,4")).toEqual([
      ["a", "b"],
      ["1", "2"],
      ["3", "4"],
    ]);
  });

  it("detects semicolon and tab delimiters", () => {
    expect(detectDelimiter("name;phone\nA;1")).toBe(";");
    expect(detectDelimiter("name\tphone\nA\t1")).toBe("\t");
    expect(parseCSV("name;phone\nA;1")).toEqual([
      ["name", "phone"],
      ["A", "1"],
    ]);
  });

  it("keeps empty trailing cells", () => {
    expect(parseCSV("a,b,c\n1,,")).toEqual([
      ["a", "b", "c"],
      ["1", "", ""],
    ]);
  });
});

describe("csvCell", () => {
  it("quotes values and neutralises formulas", () => {
    expect(csvCell('say "x"')).toBe('"say ""x"""');
    expect(csvCell("=HYPERLINK(1)")).toBe(`"'=HYPERLINK(1)"`);
    expect(csvCell(null)).toBe('""');
  });
});
