import { describe, expect, it } from "vitest";
import { JobOutput } from "../../db/repositories/JobOutputRepository";
import { StoredJob } from "../../db/repositories/JobRepository";
import { fakeScoredJob } from "../ScoringTestSupport";
import { RankedListPrinter } from "./RankedListPrinter";
import { ScoreDetailPrinter } from "./ScoreDetailPrinter";

describe("ScoreDetailPrinter", () => {
  it("prints the source name and the job URL", () => {
    const job: StoredJob = fakeScoredJob({ id: 7, url: "https://example.com/job/7" });
    const lines: string[] = new ScoreDetailPrinter().lines(job, "Remote OK", null, null);
    expect(lines).toContain("Source: Remote OK");
    expect(lines).toContain("URL: https://example.com/job/7");
  });

  it("prints basedOn only for tweaks that have one", () => {
    const job: StoredJob = fakeScoredJob({ id: 7 });
    const tweaksJson: string = JSON.stringify({
      tweaks: [
        { section: "Skills", suggestion: "Emphasize Java.", reason: "Fits.", basedOn: "Java services" },
        { section: "Summary", suggestion: "Lead with Kafka.", reason: "Fits." },
        { section: "Experience", suggestion: "Reorder.", reason: "Fits." },
      ],
    });
    const output: JobOutput = {
      id: 1,
      jobId: 7,
      runId: null,
      coverLetter: "Dear Hiring Team,\n\nHello.\n\nSincerely,\n{{NAME}}",
      resumeTweaks: tweaksJson,
      promptVersions: "{}",
      createdAt: new Date("2026-10-06T00:00:00.000Z"),
    };
    const lines: string[] = new ScoreDetailPrinter().lines(job, "Remote OK", null, output);
    expect(lines).toContain("   Based on: Java services");
    expect(lines.filter((line: string): boolean => line.startsWith("   Based on")).length).toBe(1);
    expect(lines.join("\n")).toContain("Dear Hiring Team,\n\nHello.");
  });
});

describe("RankedListPrinter", () => {
  it("adds the URL column only when asked", () => {
    const job: StoredJob = fakeScoredJob({ id: 3, url: "https://example.com/job/3" });
    const ranked = [{ job: job, rank: 1, section: "top" as const }];
    const plain: string[] = new RankedListPrinter().lines(ranked, false);
    const withUrls: string[] = new RankedListPrinter().lines(ranked, true);
    expect(plain.join("\n")).not.toContain("https://example.com/job/3");
    expect(withUrls[0].endsWith("| URL")).toBe(true);
    expect(withUrls[1].endsWith("| https://example.com/job/3")).toBe(true);
  });

  it("keeps the blank lines of a letter and prints the paragraph count", () => {
    const job: StoredJob = fakeScoredJob({ id: 9 });
    const letter: string = "Dear Hiring Team,\n\nOne here.\n\nTwo here.\n\nThree here.\n\nSincerely,\n{{NAME}}";
    const output: JobOutput = {
      id: 2,
      jobId: 9,
      runId: null,
      coverLetter: letter,
      resumeTweaks: null,
      promptVersions: "{}",
      createdAt: new Date("2026-10-06T12:00:00.000Z"),
    };
    const lines: string[] = new ScoreDetailPrinter().lines(job, "Remote OK", null, output);
    const start: number = lines.findIndex((line: string): boolean => line.startsWith("Cover letter ("));
    expect(lines[start]).toContain("3 paragraphs");
    expect(lines.slice(start + 1, start + 5)).toEqual(["Dear Hiring Team,", "", "One here.", ""]);
  });
});
