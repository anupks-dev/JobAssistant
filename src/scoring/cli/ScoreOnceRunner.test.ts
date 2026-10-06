import { afterEach, describe, expect, it } from "vitest";
import { RepositoryFactory } from "../../db/RepositoryFactory";
import { SqliteDatabase } from "../../db/SqliteDatabase";
import { JobOutputRepository } from "../../db/repositories/JobOutputRepository";
import { JobRepository, StoredJob } from "../../db/repositories/JobRepository";
import { HtmlToText } from "../../fetchers/parsing/HtmlToText";
import { JobTextSanitizer } from "../../llm/JobTextSanitizer";
import { JsonExtractor } from "../../llm/JsonExtractor";
import { LlmResult } from "../../llm/LlmClient";
import { PromptLoader } from "../../llm/PromptLoader";
import { StructuredCompletion } from "../../llm/StructuredCompletion";
import { FakeLlmClient, MutableClock } from "../../llm/testing/LlmTestSupport";
import { Job } from "../../models/Job";
import { CoverLetterGenerator } from "../../outputs/CoverLetterGenerator";
import { CoverLetterValidator } from "../../outputs/CoverLetterValidator";
import { JobPostingPromptFields } from "../../outputs/JobPostingPromptFields";
import { fakeGroundingChecker, fakePiiGuard, letterWithWords, realVocabulary, tweaksJson } from "../../outputs/OutputsTestSupport";
import { ResumeTweaksCodec } from "../../outputs/ResumeTweaksOutput";
import { ResumeTweaksGenerator } from "../../outputs/ResumeTweaksGenerator";
import { TopJobOutputGenerator } from "../../outputs/TopJobOutputGenerator";
import { loadConfig } from "../../pipeline/FilterTestSupport";
import { PiiRedactor } from "../../profile/PiiRedactor";
import { PrivateTextFileWriter } from "../../profile/PrivateTextFileWriter";
import { ProfileContextProvider } from "../../profile/ProfileContextProvider";
import { ProfileFileHasher } from "../../profile/ProfileFileHasher";
import { ProfileLoader } from "../../profile/ProfileLoader";
import { SkillsMatrixStore } from "../../profile/SkillsMatrixStore";
import { FakeProfileDirectory, fakeMatrix } from "../../profile/SkillsMatrixTestSupport";
import { FinalScoreCalculator } from "../FinalScoreCalculator";
import { JobScorer, JobScorerSettings } from "../JobScorer";
import { LocationScorer } from "../LocationScorer";
import { RankingService } from "../RankingService";
import { SalaryScorer } from "../SalaryScorer";
import { ScoreDetailsCodec } from "../ScoreDetails";
import { ScoringPromptBuilder } from "../ScoringPromptBuilder";
import { FAKE_WEIGHTS, fakeCompanyScorer, withRanking } from "../ScoringTestSupport";
import { SkillListCleaner } from "../SkillListCleaner";
import { ScoreOnceOptions } from "./ScoreOnceOptions";
import { ScoreOnceRunner } from "./ScoreOnceRunner";

const NOW: Date = new Date("2026-10-06T12:00:00.000Z");
const NO_FLAGS: ScoreOnceOptions = {
  limit: null,
  retryFailed: false,
  rescoreOutdated: false,
  regenerateOutputsOutdated: false,
  cleanSkillLists: false,
  urls: false,
};
const directory: FakeProfileDirectory = new FakeProfileDirectory();
const databases: SqliteDatabase[] = [];

interface Harness {
  fake: FakeLlmClient;
  jobs: JobRepository;
  outputs: JobOutputRepository;
  printed: string[];
  runner: ScoreOnceRunner;
}

function reply(text: string): LlmResult {
  return { text: text, modelUsed: "fake/model", latencyMs: 1, usedFallback: false, hadReasoningContent: false };
}

function scoreReply(skillsFit: number): LlmResult {
  return reply(JSON.stringify({
    skillsFit: skillsFit,
    seniorityFit: 70,
    matchedSkills: ["Java"],
    missingSkills: [],
    redFlags: [],
    reason: "Fits the stated requirements.",
    roleType: "backend",
  }));
}

// Fake data only. The runner is wired exactly like score:once, with the fake client in place of the real one.
function buildHarness(topCount: number, extraCount: number): Harness {
  directory.writeProfile(true, "TypeScript, Node.js");
  const hash: string = new ProfileFileHasher(directory.profilePath).hash();
  new SkillsMatrixStore(directory.matrixPath, new PrivateTextFileWriter()).save(fakeMatrix(true, hash));
  const database: SqliteDatabase = new SqliteDatabase(":memory:");
  databases.push(database);
  const factory: RepositoryFactory = new RepositoryFactory(database);
  const clock: MutableClock = new MutableClock(NOW);
  const fake: FakeLlmClient = new FakeLlmClient(clock);
  const promptLoader: PromptLoader = new PromptLoader("prompts");
  const redactor: PiiRedactor = new PiiRedactor({
    fullName: "Jane Q Fakeperson",
    alternateNames: [],
    emails: [],
    phones: [],
    addresses: [],
    otherValues: [],
  });
  const sanitizer: JobTextSanitizer = new JobTextSanitizer(redactor, new HtmlToText(), 6000);
  const provider: ProfileContextProvider = new ProfileContextProvider(
    new ProfileLoader(directory.profilePath),
    new SkillsMatrixStore(directory.matrixPath, new PrivateTextFileWriter()),
    new ProfileFileHasher(directory.profilePath),
  );
  const settings: JobScorerSettings = { temperature: 0.2, maxTokens: 600, fallbackModelAvailable: false, batchLimit: 100 };
  const scorer: JobScorer = new JobScorer(
    factory.jobs(),
    provider,
    new ScoringPromptBuilder(promptLoader, sanitizer),
    promptLoader,
    new StructuredCompletion(fake, new JsonExtractor()),
    new LocationScorer(),
    new SalaryScorer(150000),
    fakeCompanyScorer(),
    new FinalScoreCalculator(FAKE_WEIGHTS),
    new ScoreDetailsCodec(),
    new SkillListCleaner(realVocabulary()),
    settings,
  );
  const fields: JobPostingPromptFields = new JobPostingPromptFields(sanitizer);
  const validator: CoverLetterValidator = new CoverLetterValidator(fakePiiGuard(), fakeGroundingChecker());
  const outputGenerator: TopJobOutputGenerator = new TopJobOutputGenerator(
    factory.jobOutputs(),
    new CoverLetterGenerator(fake, promptLoader, fields, validator, { temperature: 0.6, maxTokens: 700 }),
    new ResumeTweaksGenerator(
      new StructuredCompletion(fake, new JsonExtractor()),
      promptLoader,
      fields,
      fakeGroundingChecker(),
      { temperature: 0.4, maxTokens: 600, fallbackModelAvailable: false },
    ),
    validator,
    new ResumeTweaksCodec(),
    clock,
  );
  const ranking: RankingService = new RankingService(
    factory.jobs(),
    withRanking(loadConfig(), 0, topCount, extraCount),
    fakeCompanyScorer(),
  );
  const printed: string[] = [];
  const runner: ScoreOnceRunner = new ScoreOnceRunner(
    scorer,
    ranking,
    outputGenerator,
    provider,
    clock,
    { print: (line: string): void => { printed.push(line); } },
  );
  return { fake: fake, jobs: factory.jobs(), outputs: factory.jobOutputs(), printed: printed, runner: runner };
}

function shortlist(jobs: JobRepository, externalId: string): number {
  const posting: Job = {
    source: "remoteok",
    externalId: externalId,
    title: "Tech Lead " + externalId,
    company: "Example Labs",
    location: "Remote",
    remoteType: "remote",
    salaryMin: null,
    salaryMax: null,
    currency: null,
    salaryKnown: false,
    salaryIsEstimated: false,
    url: "https://example.com/" + externalId,
    postedAt: new Date("2026-10-05T00:00:00.000Z"),
    description: "Build backend services.",
    descriptionIsSnippet: false,
  };
  jobs.upsertJobs([posting], ["key-" + externalId]);
  const stored: StoredJob = jobs.findByStatus("new", 100).filter((job: StoredJob): boolean => job.externalId === externalId)[0];
  jobs.saveFilterResult(stored.id, {
    status: "shortlisted",
    reason: null,
    regionEligibility: "open",
    isBangaloreGcc: false,
    salaryUsdMin: null,
    salaryUsdMax: null,
    notes: null,
  });
  return stored.id;
}

describe("ScoreOnceRunner", () => {
  afterEach(() => {
    directory.remove();
    while (databases.length > 0) {
      (databases.pop() as SqliteDatabase).close();
    }
  });

  it("creates outputs for the top section only and prints the outputs line after the ranked list", async () => {
    const harness: Harness = buildHarness(2, 5);
    const best: number = shortlist(harness.jobs, "a");
    const middle: number = shortlist(harness.jobs, "b");
    const lowest: number = shortlist(harness.jobs, "c");
    harness.fake.queueResult(scoreReply(90));
    harness.fake.queueResult(scoreReply(80));
    harness.fake.queueResult(scoreReply(60));
    // Outputs are requested for the top two in rank order: letter, then tweaks.
    harness.fake.queueResult(reply(letterWithWords(150)));
    harness.fake.queueResult(reply(tweaksJson(4, 12)));
    harness.fake.queueResult(reply(letterWithWords(150)));
    harness.fake.queueResult(reply(tweaksJson(4, 12)));
    await harness.runner.run(NO_FLAGS);
    expect(harness.fake.calls.length).toBe(7);
    expect(harness.outputs.findByJobId(best)).not.toBeNull();
    expect(harness.outputs.findByJobId(middle)).not.toBeNull();
    expect(harness.outputs.findByJobId(lowest)).toBeNull();
    const stored = harness.outputs.findByJobId(best);
    expect(stored === null ? "" : stored.coverLetter).toContain("{{NAME}}");
    expect(stored === null ? null : stored.resumeTweaks).not.toBeNull();
    const outputsLine: string = "Outputs: letters 2 of 2, tweaks 2 of 2, failed 0";
    expect(harness.printed).toContain(outputsLine);
    const listHeader: number = harness.printed.findIndex((line: string): boolean => line.startsWith("Rank"));
    expect(listHeader).toBeGreaterThanOrEqual(0);
    expect(harness.printed.indexOf(outputsLine)).toBeGreaterThan(listHeader);
    expect(harness.printed.some((line: string): boolean => line.startsWith("Failure codes"))).toBe(false);
    expect(harness.printed[0]).toContain("Scored 3 of 3 jobs.");
  });

  it("does not regenerate outputs that are already stored", async () => {
    const harness: Harness = buildHarness(1, 0);
    shortlist(harness.jobs, "a");
    harness.fake.queueResult(scoreReply(90));
    harness.fake.queueResult(reply(letterWithWords(150)));
    harness.fake.queueResult(reply(tweaksJson(3, 10)));
    await harness.runner.run(NO_FLAGS);
    const callsAfterFirstRun: number = harness.fake.calls.length;
    harness.printed.length = 0;
    await harness.runner.run(NO_FLAGS);
    expect(harness.fake.calls.length).toBe(callsAfterFirstRun);
    expect(harness.printed).toContain("Outputs: letters 1 of 1, tweaks 1 of 1, failed 0");
  });

  it("prints failure codes only, never model text, when outputs fail", async () => {
    const harness: Harness = buildHarness(1, 0);
    const id: number = shortlist(harness.jobs, "a");
    harness.fake.queueResult(scoreReply(90));
    // The letter is too long on both tries; the tweaks are not JSON on both tries.
    harness.fake.queueResult(reply(letterWithWords(300) + " SECRETMODELTEXT"));
    harness.fake.queueResult(reply(letterWithWords(300) + " SECRETMODELTEXT"));
    harness.fake.queueResult(reply("SECRETMODELTEXT not json"));
    harness.fake.queueResult(reply("SECRETMODELTEXT not json"));
    await harness.runner.run(NO_FLAGS);
    expect(harness.printed).toContain("Outputs: letters 0 of 1, tweaks 0 of 1, failed 2");
    expect(harness.printed).toContain("Failure codes: letter_validation x1, tweaks_parse x1");
    expect(harness.printed.join("\n")).not.toContain("SECRETMODELTEXT");
    const stored = harness.outputs.findByJobId(id);
    expect(stored === null ? null : stored.coverLetter).toBeNull();
    expect(stored === null ? null : stored.resumeTweaks).toBeNull();
  });

  it("prints the outputs line even when nothing is ranked", async () => {
    const harness: Harness = buildHarness(5, 20);
    await harness.runner.run(NO_FLAGS);
    expect(harness.printed).toContain("Outputs: letters 0 of 0, tweaks 0 of 0, failed 0");
    expect(harness.fake.calls.length).toBe(0);
  });

  it("prints the unscored_final count and the rescored count", async () => {
    const harness: Harness = buildHarness(1, 0);
    shortlist(harness.jobs, "a");
    for (let attempt: number = 1; attempt <= 3; attempt++) {
      harness.fake.queueResult(reply("not json"));
      harness.fake.queueResult(reply("not json"));
      harness.printed.length = 0;
      await harness.runner.run(NO_FLAGS);
    }
    expect(harness.printed[0]).toContain("Unscored final: 1");
    harness.printed.length = 0;
    await harness.runner.run({ ...NO_FLAGS, rescoreOutdated: true });
    expect(harness.printed[0]).toBe("Rescored 0 jobs that used an older prompt version.");
    expect(harness.printed[1]).toContain("Unscored final: 1");
  });

  it("regenerates outdated outputs of the top section only when asked", async () => {
    const harness: Harness = buildHarness(1, 0);
    const id: number = shortlist(harness.jobs, "a");
    harness.fake.queueResult(scoreReply(90));
    harness.fake.queueResult(reply(letterWithWords(150)));
    harness.fake.queueResult(reply(tweaksJson(3, 10)));
    await harness.runner.run(NO_FLAGS);
    const stored = harness.outputs.findByJobId(id);
    harness.outputs.save({
      jobId: id,
      runId: null,
      coverLetter: stored === null ? null : stored.coverLetter,
      resumeTweaks: stored === null ? null : stored.resumeTweaks,
      promptVersions: JSON.stringify({ coverLetter: "1", resumeTweaks: "1" }),
      createdAtIso: NOW.toISOString(),
    });
    const callsBefore: number = harness.fake.calls.length;
    await harness.runner.run(NO_FLAGS);
    expect(harness.fake.calls.length).toBe(callsBefore);
    harness.fake.queueResult(reply(letterWithWords(160)));
    harness.fake.queueResult(reply(tweaksJson(3, 10)));
    harness.printed.length = 0;
    await harness.runner.run({ ...NO_FLAGS, regenerateOutputsOutdated: true });
    expect(harness.fake.calls.length).toBe(callsBefore + 2);
    expect(harness.printed).toContain("Outputs: letters 1 of 1, tweaks 1 of 1, failed 0");
    const refreshed = harness.outputs.findByJobId(id);
    expect(JSON.parse(refreshed === null ? "{}" : refreshed.promptVersions)).toEqual({ coverLetter: "3", resumeTweaks: "3" });
  });

  it("appends the job URL as the last column only with urls", async () => {
    const harness: Harness = buildHarness(1, 0);
    shortlist(harness.jobs, "a");
    harness.fake.queueResult(scoreReply(90));
    harness.fake.queueResult(reply(letterWithWords(150)));
    harness.fake.queueResult(reply(tweaksJson(3, 10)));
    await harness.runner.run({ ...NO_FLAGS, urls: true });
    const withUrl: string[] = harness.printed.filter((line: string): boolean => line.endsWith("| https://example.com/a"));
    expect(withUrl.length).toBe(1);
    expect(harness.printed.some((line: string): boolean => line.startsWith("Rank") && line.endsWith("| URL"))).toBe(true);
    harness.printed.length = 0;
    await harness.runner.run(NO_FLAGS);
    expect(harness.printed.some((line: string): boolean => line.includes("https://example.com/a"))).toBe(false);
  });
});
