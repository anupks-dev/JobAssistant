import { describe, expect, it } from "vitest";
import { LocationNormalizer } from "./LocationNormalizer";
import { PhraseMatcher } from "./PhraseMatcher";

describe("LocationNormalizer", () => {
  const normalizer: LocationNormalizer = new LocationNormalizer(new PhraseMatcher());

  it("turns Bengaluru into Bangalore", () => {
    expect(normalizer.normalize("Bengaluru")).toBe("bangalore");
    expect(normalizer.normalize("  Bengaluru, Karnataka ")).toBe("bangalore, karnataka");
  });
});
