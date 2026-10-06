import { afterEach, describe, expect, it } from "vitest";
import { Job } from "../models/Job";
import { RepositoryFactory } from "./RepositoryFactory";
import { SqliteDatabase } from "./SqliteDatabase";
import { JobOutput, JobOutputRepository } from "./repositories/JobOutputRepository";
import { JobRepository, StoredJob } from "./repositories/JobRepository";

const databases: SqliteDatabase[] = [];

function open(): RepositoryFactory {
  const database: SqliteDatabase = new SqliteDatabase(":memory:");
  databases.push(database);
  return new RepositoryFactory(database);
}

function posting(externalId: string): Job {
  const job: Job = {
    source: "remoteok",
    externalId: externalId,
    title: "Tech Lead",
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
    description: "Build services.",
    descriptionIsSnippet: false,
  };
  return job;
}

function store(jobs: JobRepository, externalId: string, status: "shortlisted" | "rejected"): number {
  jobs.upsertJobs([posting(externalId)], ["key-" + externalId]);
  const stored: StoredJob = jobs.findByStatus("new", 100).filter((job: StoredJob): boolean => job.externalId === externalId)[0];
  jobs.saveFilterResult(stored.id, {
    status: status,
    reason: status === "rejected" ? "too_old" : null,
    regionEligibility: "open",
    isBangaloreGcc: false,
    salaryUsdMin: null,
    salaryUsdMax: null,
    notes: null,
  });
  return stored.id;
}

describe("scoring repositories", () => {
  afterEach(() => {
    while (databases.length > 0) {
      (databases.pop() as SqliteDatabase).close();
    }
  });

  it("finds only shortlisted jobs that have no score", () => {
    const jobs: JobRepository = open().jobs();
    const scored: number = store(jobs, "scored", "shortlisted");
    const waiting: number = store(jobs, "waiting", "shortlisted");
    store(jobs, "rejected", "rejected");
    jobs.saveScore(scored, 70, "fits", "{}");
    const found: StoredJob[] = jobs.findShortlistedUnscored(10);
    expect(found.map((job: StoredJob): number => job.id)).toEqual([waiting]);
    expect(jobs.findShortlistedUnscored(0).length).toBe(0);
  });

  it("stores score details and an unscored note without scoring the job", () => {
    const jobs: JobRepository = open().jobs();
    const id: number = store(jobs, "a", "shortlisted");
    jobs.saveUnscoredNote(id, "{\"unscored\":true}");
    const noted: StoredJob = jobs.findById(id) as StoredJob;
    expect(noted.score).toBeNull();
    expect(noted.scoreDetails).toBe("{\"unscored\":true}");
    jobs.saveScore(id, 66, "fits", "{\"ok\":1}");
    expect((jobs.findById(id) as StoredJob).scoreDetails).toBe("{\"ok\":1}");
    expect(() => jobs.saveUnscoredNote(id, "{}")).toThrow();
    expect(() => jobs.saveScore(id, 101, "x", "{}")).toThrow();
    expect(() => jobs.saveScore(id, 50.5, "x", "{}")).toThrow();
  });

  it("selects the ranking pool by score, window and sent state", () => {
    const factory: RepositoryFactory = open();
    const jobs: JobRepository = factory.jobs();
    const good: number = store(jobs, "good", "shortlisted");
    const low: number = store(jobs, "low", "shortlisted");
    const sent: number = store(jobs, "sent", "shortlisted");
    jobs.saveScore(good, 80, "fits", "{}");
    jobs.saveScore(low, 30, "weak", "{}");
    jobs.saveScore(sent, 90, "fits", "{}");
    const runId: number = factory.runs().startRun("manual");
    factory.sentJobs().recordSent(sent, "key-sent", runId, 1, 90, "top");
    const pool: StoredJob[] = jobs.findRankingPool("2026-10-01T00:00:00.000Z", 40);
    expect(pool.map((job: StoredJob): number => job.id)).toEqual([good]);
    expect(jobs.findRankingPool("2026-10-06T00:00:00.000Z", 40).length).toBe(0);
  });

  it("resetForReevaluation resets rejected and unscored jobs but never scored ones", () => {
    const factory: RepositoryFactory = open();
    const jobs: JobRepository = factory.jobs();
    const scored: number = store(jobs, "scored", "shortlisted");
    const unscored: number = store(jobs, "unscored", "shortlisted");
    const rejected: number = store(jobs, "rejected", "rejected");
    jobs.saveScore(scored, 75, "fits", "{\"kept\":true}");
    factory.jobOutputs().save({
      jobId: scored,
      runId: null,
      coverLetter: "Dear team, {{NAME}}",
      resumeTweaks: "[]",
      promptVersions: "{}",
      createdAtIso: "2026-10-06T00:00:00.000Z",
    });
    jobs.resetForReevaluation();
    const keptJob: StoredJob = jobs.findById(scored) as StoredJob;
    expect(keptJob.status).toBe("shortlisted");
    expect(keptJob.score).toBe(75);
    expect(keptJob.scoreDetails).toBe("{\"kept\":true}");
    expect((jobs.findById(unscored) as StoredJob).status).toBe("new");
    expect((jobs.findById(rejected) as StoredJob).status).toBe("new");
    expect(factory.jobOutputs().findByJobId(scored)).not.toBeNull();
  });
});

describe("JobOutputRepository", () => {
  afterEach(() => {
    while (databases.length > 0) {
      (databases.pop() as SqliteDatabase).close();
    }
  });

  it("saves, replaces and reads one output per job", () => {
    const factory: RepositoryFactory = open();
    const id: number = store(factory.jobs(), "a", "shortlisted");
    const outputs: JobOutputRepository = factory.jobOutputs();
    expect(outputs.findByJobId(id)).toBeNull();
    outputs.save({ jobId: id, runId: null, coverLetter: "one", resumeTweaks: null, promptVersions: "{\"a\":1}", createdAtIso: "2026-10-06T00:00:00.000Z" });
    outputs.save({ jobId: id, runId: null, coverLetter: "two", resumeTweaks: "[]", promptVersions: "{\"a\":2}", createdAtIso: "2026-10-07T00:00:00.000Z" });
    const found: JobOutput = outputs.findByJobId(id) as JobOutput;
    expect(found.coverLetter).toBe("two");
    expect(found.resumeTweaks).toBe("[]");
    expect(found.createdAt.toISOString()).toBe("2026-10-07T00:00:00.000Z");
  });

  it("refuses an output for a job that does not exist", () => {
    const outputs: JobOutputRepository = open().jobOutputs();
    expect(() => outputs.save({ jobId: 999, runId: null, coverLetter: null, resumeTweaks: null, promptVersions: "{}", createdAtIso: "2026-10-06T00:00:00.000Z" })).toThrow();
  });
});
