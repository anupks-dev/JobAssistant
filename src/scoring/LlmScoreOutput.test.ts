import { describe, expect, it } from "vitest";
import { z } from "zod";
import { LlmScoreOutput, LlmScoreOutputSchema, MAX_REASON_LENGTH } from "./LlmScoreOutput";
import { TextTrimmer } from "./TextTrimmer";

function validOutput(overrides: Record<string, unknown>): Record<string, unknown> {
  const output: Record<string, unknown> = {
    skillsFit: 80,
    seniorityFit: 70,
    matchedSkills: ["Java"],
    missingSkills: [],
    redFlags: [],
    reason: "Good fit.",
    roleType: "backend",
  };
  return { ...output, ...overrides };
}

function parse(raw: Record<string, unknown>): z.ZodSafeParseResult<LlmScoreOutput> {
  return LlmScoreOutputSchema.safeParse(raw);
}

describe("TextTrimmer", () => {
  const trimmer: TextTrimmer = new TextTrimmer();

  it("leaves text within the limit unchanged", () => {
    expect(trimmer.trim("short text", 20)).toBe("short text");
    expect(trimmer.trim("12345", 5)).toBe("12345");
  });

  it("cuts at a word boundary and adds an ellipsis within the limit", () => {
    const result: string = trimmer.trim("alpha beta gamma delta", 14);
    expect(result).toBe("alpha beta…");
    expect(result.length).toBeLessThanOrEqual(14);
  });

  it("keeps a whole word when the cut falls exactly on a space", () => {
    expect(trimmer.trim("alpha beta gamma", 11)).toBe("alpha beta…");
  });

  it("cuts inside a single long word when there is no space", () => {
    const result: string = trimmer.trim("abcdefghijklmnop", 6);
    expect(result).toBe("abcde…");
  });

  it("drops trailing punctuation before the ellipsis", () => {
    expect(trimmer.trim("alpha, beta, gamma", 13)).toBe("alpha, beta…");
  });
});

describe("LlmScoreOutputSchema trimming", () => {
  it("trims an overlong reason at a word boundary instead of failing", () => {
    const words: string[] = [];
    for (let index: number = 0; index < 60; index++) {
      words.push("fitword");
    }
    const parsed: z.ZodSafeParseResult<LlmScoreOutput> = parse(validOutput({ reason: words.join(" ") }));
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.reason.length).toBeLessThanOrEqual(MAX_REASON_LENGTH);
      expect(parsed.data.reason.endsWith("…")).toBe(true);
      expect(parsed.data.reason.slice(0, -1).split(" ").every((word: string): boolean => word === "fitword")).toBe(true);
    }
  });

  it("keeps the first N items of an overlong list", () => {
    const skills: string[] = [];
    for (let index: number = 1; index <= 12; index++) {
      skills.push("Skill" + String(index));
    }
    const parsed: z.ZodSafeParseResult<LlmScoreOutput> = parse(validOutput({
      matchedSkills: skills,
      missingSkills: skills,
      redFlags: ["a", "b", "c", "d", "e"],
    }));
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.matchedSkills).toEqual(skills.slice(0, 8));
      expect(parsed.data.missingSkills).toEqual(skills.slice(0, 8));
      expect(parsed.data.redFlags).toEqual(["a", "b", "c"]);
    }
  });

  it("trims an overlong list item and drops empty items", () => {
    const parsed: z.ZodSafeParseResult<LlmScoreOutput> = parse(validOutput({
      matchedSkills: ["  ", "x".repeat(200), "Java"],
    }));
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.matchedSkills.length).toBe(2);
      expect(parsed.data.matchedSkills[0].length).toBe(80);
      expect(parsed.data.matchedSkills[1]).toBe("Java");
    }
  });

  it("stays strict about types, score ranges and roleType", () => {
    expect(parse(validOutput({ skillsFit: "80" })).success).toBe(false);
    expect(parse(validOutput({ skillsFit: 101 })).success).toBe(false);
    expect(parse(validOutput({ seniorityFit: -1 })).success).toBe(false);
    expect(parse(validOutput({ roleType: "manager" })).success).toBe(false);
    expect(parse(validOutput({ matchedSkills: "Java" })).success).toBe(false);
    expect(parse(validOutput({ matchedSkills: [5] })).success).toBe(false);
    expect(parse(validOutput({ reason: "   " })).success).toBe(false);
    expect(parse(validOutput({ reason: 7 })).success).toBe(false);
  });
});
