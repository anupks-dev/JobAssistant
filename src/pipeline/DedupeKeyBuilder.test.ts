import { describe, expect, it } from "vitest";
import { DedupeKeyBuilder } from "./DedupeKeyBuilder";

describe("DedupeKeyBuilder", () => {
  it("normalizes case, punctuation, and whitespace", () => {
    const punctuated: string = DedupeKeyBuilder.build("Northwind Labs", "Backend Engineer!", "  Bengaluru  ");
    const messy: string = DedupeKeyBuilder.build("  NORTHWIND   LABS ", "backend   engineer", "bengaluru");
    const company: string = DedupeKeyBuilder.build("Acme, Inc.", "Full-Stack Engineer", "New York, NY");
    expect(punctuated).toBe("northwind labs|backend engineer|bengaluru");
    expect(messy).toBe(punctuated);
    expect(company).toBe("acme inc|fullstack engineer|new york ny");
  });
});
