import { describe, expect, it } from "vitest";
import { PiiRedactor } from "../profile/PiiRedactor";
import { PiiValues } from "../profile/PiiValueStore";
import { PiiGuard, PiiLeakError } from "./PiiGuard";

function guard(): PiiGuard {
  const values: PiiValues = {
    fullName: "Jordan Hale",
    alternateNames: [],
    emails: ["jordan.hale@example.com"],
    phones: ["9876543210"],
    addresses: ["42 Palm Road, Pune, Maharashtra 411001"],
    otherValues: [],
  };
  const redactor: PiiRedactor = new PiiRedactor(values);
  return new PiiGuard(redactor);
}

describe("PiiGuard", () => {
  it("throws on a leak and the error message contains no raw value", () => {
    const checker: PiiGuard = guard();
    const dirty: string = "Email jordan.hale@example.com or call 9876543210. Thanks, Jordan Hale.";
    expect(() => checker.assertClean(dirty)).toThrow(PiiLeakError);
    try {
      checker.assertClean(dirty);
    } catch (error: unknown) {
      if (!(error instanceof PiiLeakError)) {
        throw error;
      }
      expect(error.message).not.toContain("jordan.hale@example.com");
      expect(error.message).not.toContain("9876543210");
      expect(error.message).not.toContain("Jordan");
      expect(error.message).not.toContain("Hale");
      expect(error.message).toContain("email");
      expect(error.message).toContain("phone");
      expect(error.message).toContain("name");
    }
  });

  it("passes text that has no personal data", () => {
    const checker: PiiGuard = guard();
    const clean: string = "Engineer at Northwind Labs using TypeScript and PostgreSQL.";
    expect(() => checker.assertClean(clean)).not.toThrow();
  });
});
