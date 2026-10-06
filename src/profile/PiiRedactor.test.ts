import { describe, expect, it } from "vitest";
import { PiiRedactor, RedactionResult } from "./PiiRedactor";
import { PiiValues } from "./PiiValueStore";

function fakeValues(): PiiValues {
  const values: PiiValues = {
    fullName: "Jordan Hale",
    alternateNames: ["J. Hale"],
    emails: ["jordan.hale@example.com"],
    phones: ["9876543210"],
    addresses: ["42 Palm Road, Pune, Maharashtra 411001"],
    otherValues: [],
  };
  return values;
}

function redact(text: string): RedactionResult {
  const redactor: PiiRedactor = new PiiRedactor(fakeValues());
  return redactor.redact(text);
}

describe("PiiRedactor", () => {
  it("redacts emails, urls, and linkedin or github links", () => {
    const source: string = [
      "Mail jordan.hale@example.com for details.",
      "Site https://example.com/portfolio and www.example.org/about.",
      "Profile https://linkedin.com/in/jordanhale plus github.com/jordanhale.",
      "Also linkedin.com/in/jordanhale without a scheme.",
    ].join("\n");
    const result: RedactionResult = redact(source);
    expect(result.redactedText).not.toContain("jordan.hale@example.com");
    expect(result.redactedText).not.toContain("example.com");
    expect(result.redactedText).not.toContain("example.org");
    expect(result.redactedText).not.toContain("linkedin.com");
    expect(result.redactedText).not.toContain("github.com");
    expect(result.redactedText).toContain("[EMAIL]");
    expect(result.redactedText).toContain("[URL]");
    expect(result.counts.email).toBeGreaterThan(0);
    expect(result.counts.url).toBeGreaterThan(0);
  });

  it("redacts common phone formats and keeps dates, versions, and metrics", () => {
    const source: string = [
      "Reach +91 98765 43210 or 098765 43210 or 9876543210 or (123) 456-7890.",
      "Served 1200000 users in 2024 using version 1.2.3 on 2024-10-03.",
    ].join("\n");
    const result: RedactionResult = redact(source);
    expect(result.redactedText).not.toContain("98765");
    expect(result.redactedText).not.toContain("9876543210");
    expect(result.redactedText).not.toContain("456-7890");
    expect(result.redactedText).toContain("[PHONE]");
    expect(result.redactedText).toContain("1200000 users");
    expect(result.redactedText).toContain("2024");
    expect(result.redactedText).toContain("1.2.3");
    expect(result.redactedText).toContain("2024-10-03");
    expect(result.counts.phone).toBe(4);
  });

  it("removes the name in a header, a sentence, and a different case", () => {
    const source: string = [
      "Jordan Hale",
      "Please ask Jordan Hale about the migration.",
      "Signed by JORDAN HALE.",
    ].join("\n");
    const result: RedactionResult = redact(source);
    expect(result.redactedText.toLowerCase()).not.toContain("jordan");
    expect(result.redactedText.toLowerCase()).not.toContain("hale");
    expect(result.redactedText).toContain("Please ask [NAME] about the migration.");
    expect(result.redactedText).toContain("Signed by [NAME].");
    expect(result.counts.name).toBeGreaterThanOrEqual(2);
  });

  it("drops lines that contain only placeholders and separators", () => {
    const source: string = [
      "Jordan Hale",
      "jordan.hale@example.com | +91 98765 43210 | https://linkedin.com/in/jordanhale",
      "Engineer at Northwind Labs.",
    ].join("\n");
    const result: RedactionResult = redact(source);
    const lines: string[] = result.redactedText.split("\n");
    for (let index: number = 0; index < lines.length; index++) {
      const line: string = lines[index];
      expect(line).not.toMatch(/^(\[(NAME|EMAIL|PHONE|URL|ADDRESS)\][\s|.,/-]*)+$/);
    }
    expect(result.redactedText).toContain("Engineer at Northwind Labs.");
    expect(result.redactedText).not.toContain("jordan.hale@example.com");
  });

  it("keeps employer names and technologies", () => {
    const source: string = "Engineer at Northwind Labs. Built services with TypeScript and PostgreSQL.";
    const result: RedactionResult = redact(source);
    expect(result.redactedText).toContain("Northwind Labs");
    expect(result.redactedText).toContain("TypeScript");
    expect(result.redactedText).toContain("PostgreSQL");
    expect(result.counts.name).toBe(0);
    expect(result.counts.email).toBe(0);
    expect(result.counts.phone).toBe(0);
    expect(result.counts.url).toBe(0);
    expect(result.counts.address).toBe(0);
  });
});
