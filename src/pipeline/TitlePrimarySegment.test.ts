import { describe, expect, it } from "vitest";
import { TitlePrimarySegment } from "./TitlePrimarySegment";

describe("TitlePrimarySegment", () => {
  const segment: TitlePrimarySegment = new TitlePrimarySegment();

  it("stops at commas, colons, pipes, parentheses, and spaced dashes", () => {
    expect(segment.extract("Software Development Engineer II, EU INTech - Prime and Marketing Tech")).toBe(
      "Software Development Engineer II",
    );
    expect(segment.extract("Principal Infrastructure Architect: Data Platform")).toBe("Principal Infrastructure Architect");
    expect(segment.extract("Pre-sales Solution Architect (High Tech) - Expert Professional")).toBe(
      "Pre-sales Solution Architect",
    );
    expect(segment.extract("Tech Lead - Payments")).toBe("Tech Lead");
  });
});
