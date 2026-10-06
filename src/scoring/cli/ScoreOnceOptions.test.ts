import { describe, expect, it } from "vitest";
import { ScoreOnceOptionsParser } from "./ScoreOnceOptions";

describe("ScoreOnceOptionsParser", () => {
  const parser: ScoreOnceOptionsParser = new ScoreOnceOptionsParser();

  it("defaults to no limit and no flags", () => {
    expect(parser.parse([])).toEqual({
      limit: null,
      retryFailed: false,
      rescoreOutdated: false,
      regenerateOutputsOutdated: false,
      cleanSkillLists: false,
      urls: false,
    });
  });

  it("reads every option and ignores the separator pnpm passes through", () => {
    expect(parser.parse(["--", "--limit=5", "--retry-failed", "--rescore-outdated", "--regenerate-outputs-outdated", "--clean-skill-lists", "--urls"]))
      .toEqual({
        limit: 5,
        retryFailed: true,
        rescoreOutdated: true,
        regenerateOutputsOutdated: true,
        cleanSkillLists: true,
        urls: true,
      });
  });

  it("rejects unknown flags and bad limits", () => {
    expect(() => parser.parse(["--retry"])).toThrow(/Usage/);
    expect(() => parser.parse(["--limit=0"])).toThrow(/Usage/);
    expect(() => parser.parse(["--limit="])).toThrow(/Usage/);
  });
});
