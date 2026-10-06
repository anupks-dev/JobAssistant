import { describe, expect, it } from "vitest";
import { ScoreOutputsOptionsParser } from "./ScoreOutputsOptions";

describe("ScoreOutputsOptionsParser", () => {
  const parser: ScoreOutputsOptionsParser = new ScoreOutputsOptionsParser();

  it("reads the job id and ignores the pnpm separator", () => {
    expect(parser.parse(["--", "--job=42"])).toEqual({ jobId: 42 });
  });

  it("rejects a missing, bad or unknown option", () => {
    expect(() => parser.parse([])).toThrow(/Usage/);
    expect(() => parser.parse(["--job=0"])).toThrow(/Usage/);
    expect(() => parser.parse(["--job=abc"])).toThrow(/Usage/);
    expect(() => parser.parse(["--all"])).toThrow(/Usage/);
  });
});
