import { describe, expect, it } from "vitest";
import { AppConfig } from "../config/AppConfig";
import { RepositoryFactory } from "../db/RepositoryFactory";
import { SqliteDatabase } from "../db/SqliteDatabase";
import { JobRepository, StoredJob } from "../db/repositories/JobRepository";
import { Job } from "../models/Job";
import { loadConfig } from "../pipeline/FilterTestSupport";
import { RankedJob, RankingService } from "./RankingService";
import { fakeCompanyScorer, withRanking } from "./ScoringTestSupport";

const NOW: Date = new Date("2026-10-06T12:00:00.000Z");
const DAY_MS: number = 24 * 60 * 60 * 1000;

interface Opened {
  database: SqliteDatabase;
  factory: RepositoryFactory;
  jobs: JobRepository;
}

function open(): Opened {
  const database: SqliteDatabase = new SqliteDatabase(":memory:");
  const factory: RepositoryFactory = new RepositoryFactory(database);
  return { database: database, factory: factory, jobs: factory.jobs() };
}

function posting(externalId: string, company: string, ageDays: number | null): Job {
  const postedAt: Date | null = ageDays === null ? null : new Date(NOW.getTime() - ageDays * DAY_MS);
  const job: Job = {
    source: "remoteok",
    externalId: externalId,
    title: "Tech Lead " + externalId,
    company: company,
    location: "Remote",
    remoteType: "remote",
    salaryMin: null,
    salaryMax: null,
    currency: null,
    salaryKnown: false,
    salaryIsEstimated: false,
    url: "https://example.com/" + externalId,
    postedAt: postedAt,
    description: "Build services.",
    descriptionIsSnippet: false,
  };
  return job;
}

// Stores a posting, shortlists it and gives it a score. Returns its id.
function addScored(opened: Opened, externalId: string, company: string, ageDays: number | null, score: number): number {
  opened.jobs.upsertJobs([posting(externalId, company, ageDays)], ["key-" + externalId]);
  const stored: StoredJob = opened.jobs.findByStatus("new", 100).filter((job: StoredJob): boolean => job.externalId === externalId)[0];
  opened.jobs.updateStatus(stored.id, "shortlisted");
  opened.jobs.saveScore(stored.id, score, "fits", "{}");
  return stored.id;
}

function service(opened: Opened, config: AppConfig): RankingService {
  return new RankingService(opened.jobs, config, fakeCompanyScorer());
}

function ids(list: RankedJob[]): number[] {
  const found: number[] = [];
  for (let index: number = 0; index < list.length; index++) {
    found.push(list[index].job.id);
  }
  return found;
}

describe("RankingService", () => {
  it("orders by score, then preferred company, then newer posting", () => {
    const opened: Opened = open();
    const low: number = addScored(opened, "low", "Other Co", 1, 60);
    const olderOther: number = addScored(opened, "older", "Other Co", 3, 80);
    const newerOther: number = addScored(opened, "newer", "Another Co", 1, 80);
    const preferred: number = addScored(opened, "pref", "Northwind Labs", 5, 80);
    const best: number = addScored(opened, "best", "Other Co", 2, 95);
    const list: RankedJob[] = service(opened, withRanking(loadConfig(), 40, 5, 20)).buildDailyList(NOW);
    expect(ids(list)).toEqual([best, preferred, newerOther, olderOther, low]);
    expect(list[0].rank).toBe(1);
    expect(list[4].rank).toBe(5);
    opened.database.close();
  });

  it("splits into top and extra sections and stops at the output size", () => {
    const opened: Opened = open();
    for (let index: number = 0; index < 6; index++) {
      addScored(opened, "job" + String(index), "Other Co", 1, 90 - index);
    }
    const list: RankedJob[] = service(opened, withRanking(loadConfig(), 40, 2, 3)).buildDailyList(NOW);
    expect(list.length).toBe(5);
    expect(list[0].section).toBe("top");
    expect(list[1].section).toBe("top");
    expect(list[2].section).toBe("extra");
    expect(list[4].section).toBe("extra");
    opened.database.close();
  });

  it("drops jobs under the minimum score", () => {
    const opened: Opened = open();
    const kept: number = addScored(opened, "kept", "Other Co", 1, 40);
    addScored(opened, "dropped", "Other Co", 1, 39);
    const list: RankedJob[] = service(opened, withRanking(loadConfig(), 40, 5, 20)).buildDailyList(NOW);
    expect(ids(list)).toEqual([kept]);
    opened.database.close();
  });

  it("excludes sent jobs", () => {
    const opened: Opened = open();
    const sent: number = addScored(opened, "sent", "Other Co", 1, 90);
    const unsent: number = addScored(opened, "unsent", "Other Co", 1, 70);
    const runId: number = opened.factory.runs().startRun("manual");
    opened.factory.sentJobs().recordSent(sent, "key-sent", runId, 1, 90, "top");
    const list: RankedJob[] = service(opened, withRanking(loadConfig(), 40, 5, 20)).buildDailyList(NOW);
    expect(ids(list)).toEqual([unsent]);
    opened.database.close();
  });

  it("excludes jobs older than the posting window and unscored jobs", () => {
    const opened: Opened = open();
    const config: AppConfig = withRanking(loadConfig(), 40, 5, 20);
    const fresh: number = addScored(opened, "fresh", "Other Co", config.filters.postedWithinDays - 1, 70);
    addScored(opened, "stale", "Other Co", config.filters.postedWithinDays + 1, 99);
    opened.jobs.upsertJobs([posting("unscored", "Other Co", 1)], ["key-unscored"]);
    const list: RankedJob[] = service(opened, config).buildDailyList(NOW);
    expect(ids(list)).toEqual([fresh]);
    opened.database.close();
  });
});
