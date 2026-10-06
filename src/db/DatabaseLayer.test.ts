import Database from "better-sqlite3";
import { mkdtempSync, rmSync, statSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, describe, expect, it } from "vitest";
import { Job } from "../models/Job";
import { DedupeKeyBuilder } from "../pipeline/DedupeKeyBuilder";
import { RepositoryFactory } from "./RepositoryFactory";
import { SqliteDatabase } from "./SqliteDatabase";
import { ApiUsageRepository } from "./repositories/ApiUsageRepository";
import { AppStateRepository } from "./repositories/AppStateRepository";
import { Company, CompanyFlags, CompanyRepository } from "./repositories/CompanyRepository";
import { ConfigHistoryEntry, ConfigHistoryRepository, StoredConfigHistoryEntry } from "./repositories/ConfigHistoryRepository";
import { JobRepository, StoredJob, UpsertJobsResult } from "./repositories/JobRepository";
import { RunCounts, RunRecord, RunRepository, SourceStatusRecord } from "./repositories/RunRepository";
import { SentJobRecord, SentJobRepository } from "./repositories/SentJobRepository";

const databases: SqliteDatabase[] = [];
const directories: string[] = [];

interface TableNameRow {
  name: string;
}

function openMemoryDatabase(): SqliteDatabase {
  const database: SqliteDatabase = new SqliteDatabase(":memory:");
  databases.push(database);
  return database;
}

function sampleJob(source: string, externalId: string, postedAt: Date | null): Job {
  const job: Job = {
    source: source,
    externalId: externalId,
    title: "Backend Engineer",
    company: "Northwind Labs",
    location: "Bengaluru",
    remoteType: "remote",
    salaryMin: 100000,
    salaryMax: 120000,
    currency: "USD",
    salaryKnown: true,
    salaryIsEstimated: false,
    url: "https://example.com/jobs/" + externalId,
    postedAt: postedAt,
    description: "Builds APIs with TypeScript.",
    descriptionIsSnippet: false,
  };
  return job;
}

describe("database layer", () => {
  afterEach(() => {
    for (let index: number = 0; index < databases.length; index++) {
      databases[index].close();
    }
    databases.length = 0;
    for (let index: number = 0; index < directories.length; index++) {
      rmSync(directories[index], { recursive: true, force: true });
    }
    directories.length = 0;
  });

  it("creates every table and can migrate twice", () => {
    const database: SqliteDatabase = openMemoryDatabase();
    database.migrate();
    expect(database.getSchemaVersion()).toBe(3);
    const statement: Database.Statement<[], TableNameRow> = database.getConnection().prepare<[], TableNameRow>(
      "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name ASC",
    );
    const rows: TableNameRow[] = statement.all();
    const names: string[] = [];
    for (let index: number = 0; index < rows.length; index++) {
      names.push(rows[index].name);
    }
    expect(names).toContain("schema_migrations");
    expect(names).toContain("jobs");
    expect(names).toContain("sent_jobs");
    expect(names).toContain("companies");
    expect(names).toContain("runs");
    expect(names).toContain("run_source_status");
    expect(names).toContain("config_history");
    expect(names).toContain("app_state");
    expect(names).toContain("api_usage");
    const factory: RepositoryFactory = new RepositoryFactory(database);
    expect(factory.jobs().findByStatus("new", 1)).toEqual([]);
  });

  it("creates a database file with mode 600", () => {
    const directoryPath: string = mkdtempSync(join(tmpdir(), "jobagent-db-"));
    directories.push(directoryPath);
    const databasePath: string = join(directoryPath, "jobagent.sqlite");
    const database: SqliteDatabase = new SqliteDatabase(databasePath);
    databases.push(database);
    const mode: number = statSync(databasePath).mode & 0o777;
    expect(mode).toBe(0o600);
    expect(database.getSchemaVersion()).toBe(3);
  });

  it("inserts new jobs and does not overwrite status or score", () => {
    const database: SqliteDatabase = openMemoryDatabase();
    const jobs: JobRepository = new RepositoryFactory(database).jobs();
    const first: Job = sampleJob("remoteok", "ext-1", new Date("2026-10-01T00:00:00.000Z"));
    const created: UpsertJobsResult = jobs.upsertJobs([first]);
    expect(created.inserted).toBe(1);
    expect(created.skipped).toBe(0);
    const stored: StoredJob = jobs.findByStatus("new", 10)[0];
    jobs.updateStatus(stored.id, "rejected", "too junior");
    jobs.saveScore(stored.id, 12, "weak match", "{}");
    const again: UpsertJobsResult = jobs.upsertJobs([first]);
    expect(again.inserted).toBe(0);
    expect(again.skipped).toBe(1);
    const after: StoredJob = jobs.findByStatus("rejected", 10)[0];
    expect(after.status).toBe("rejected");
    expect(after.score).toBe(12);
    expect(after.scoreReason).toBe("weak match");
    expect(after.rejectionReason).toBe("too junior");
    const posted: StoredJob[] = jobs.findPostedSince("2026-01-01T00:00:00.000Z");
    expect(posted.length).toBe(1);
  });

  it("treats the same title at the same company as one dedupe key across sources", () => {
    const database: SqliteDatabase = openMemoryDatabase();
    const factory: RepositoryFactory = new RepositoryFactory(database);
    const jobs: JobRepository = factory.jobs();
    const sent: SentJobRepository = factory.sentJobs();
    const runs: RunRepository = factory.runs();
    const postedAt: Date = new Date("2026-10-01T00:00:00.000Z");
    jobs.upsertJobs([
      sampleJob("remoteok", "ext-1", postedAt),
      sampleJob("remotive", "ext-2", postedAt),
    ]);
    const key: string = DedupeKeyBuilder.build("Northwind Labs", "Backend Engineer", "Bengaluru");
    expect(jobs.existsByDedupeKey(key)).toBe(true);
    const stored: StoredJob[] = jobs.findByStatus("new", 10);
    const runId: number = runs.startRun("manual");
    sent.recordSent(stored[0].id, key, runId, 1, 80, "top");
    expect(sent.hasBeenSent(key)).toBe(true);
    expect(() => sent.recordSent(stored[0].id, key, runId, 1, 80, "top")).toThrow(/already recorded as sent/);
  });

  it("purges old unsent jobs and keeps sent ones", () => {
    const database: SqliteDatabase = openMemoryDatabase();
    const factory: RepositoryFactory = new RepositoryFactory(database);
    const jobs: JobRepository = factory.jobs();
    const sent: SentJobRepository = factory.sentJobs();
    const runs: RunRepository = factory.runs();
    const postedAt: Date = new Date("2026-10-01T00:00:00.000Z");
    jobs.upsertJobs([
      sampleJob("remoteok", "old-unsent", postedAt),
      sampleJob("remoteok", "old-sent", postedAt),
      sampleJob("remoteok", "fresh", postedAt),
    ]);
    const rows: StoredJob[] = jobs.findByStatus("new", 10);
    let oldUnsentId: number = 0;
    let oldSentId: number = 0;
    let freshId: number = 0;
    for (let index: number = 0; index < rows.length; index++) {
      const row: StoredJob = rows[index];
      if (row.externalId === "old-unsent") {
        oldUnsentId = row.id;
      }
      if (row.externalId === "old-sent") {
        oldSentId = row.id;
      }
      if (row.externalId === "fresh") {
        freshId = row.id;
      }
    }
    const oldStamp: string = "2020-01-01T00:00:00.000Z";
    database.getConnection().prepare("UPDATE jobs SET fetched_at = ? WHERE id = ?").run(oldStamp, oldUnsentId);
    database.getConnection().prepare("UPDATE jobs SET fetched_at = ? WHERE id = ?").run(oldStamp, oldSentId);
    const runId: number = runs.startRun("manual");
    sent.recordSent(oldSentId, rows[0].dedupeKey, runId, 2, 70, "extra");
    const removed: number = jobs.purgeOlderThan(30);
    expect(removed).toBe(1);
    expect(jobs.existsByDedupeKey(DedupeKeyBuilder.build("Northwind Labs", "Backend Engineer", "Bengaluru"))).toBe(true);
    const remaining: StoredJob[] = jobs.findByStatus("new", 10);
    const remainingIds: number[] = [];
    for (let index: number = 0; index < remaining.length; index++) {
      remainingIds.push(remaining[index].id);
    }
    expect(remainingIds).toContain(oldSentId);
    expect(remainingIds).toContain(freshId);
    expect(remainingIds).not.toContain(oldUnsentId);
  });

  it("forces salaryKnown to false when the salary is estimated", () => {
    const database: SqliteDatabase = openMemoryDatabase();
    const jobs: JobRepository = new RepositoryFactory(database).jobs();
    const estimated: Job = sampleJob("adzuna", "est-1", new Date("2026-10-01T00:00:00.000Z"));
    estimated.salaryKnown = true;
    estimated.salaryIsEstimated = true;
    estimated.descriptionIsSnippet = true;
    jobs.upsertJobs([estimated]);
    const stored: StoredJob = jobs.findByStatus("new", 1)[0];
    expect(stored.salaryIsEstimated).toBe(true);
    expect(stored.salaryKnown).toBe(false);
    expect(stored.descriptionIsSnippet).toBe(true);
    database.getConnection().prepare(
      "UPDATE jobs SET salary_known = 1, salary_is_estimated = 1 WHERE id = ?",
    ).run(stored.id);
    const reread: StoredJob = jobs.findByStatus("new", 1)[0];
    expect(reread.salaryIsEstimated).toBe(true);
    expect(reread.salaryKnown).toBe(false);
  });

  it("runs from start through source status to finish", () => {
    const database: SqliteDatabase = openMemoryDatabase();
    const runs: RunRepository = new RepositoryFactory(database).runs();
    expect(runs.getLastRun()).toBeNull();
    const runId: number = runs.startRun("scheduled");
    const sourceStatus: SourceStatusRecord = {
      source: "remoteok",
      status: "error",
      jobCount: 0,
      errorMessage: "GET https://api.example.com/search?api_key=fake-key-123 failed Bearer fake-token-999",
      durationMs: 40,
    };
    runs.addSourceStatus(runId, sourceStatus);
    const counts: RunCounts = {
      fetchedCount: 4,
      filteredCount: 3,
      shortlistedCount: 2,
      sentCount: 1,
    };
    runs.finishRun(runId, "partial", counts, "one source failed");
    const last: RunRecord | null = runs.getLastRun();
    expect(last).not.toBeNull();
    if (last === null) {
      return;
    }
    expect(last.id).toBe(runId);
    expect(last.status).toBe("partial");
    expect(last.trigger).toBe("scheduled");
    expect(last.fetchedCount).toBe(4);
    expect(last.sentCount).toBe(1);
    expect(last.notes).toBe("one source failed");
    expect(last.finishedAt).not.toBeNull();
    expect(last.sourceStatuses.length).toBe(1);
    expect(last.sourceStatuses[0].status).toBe("error");
    expect(last.sourceStatuses[0].errorMessage).not.toContain("fake-key-123");
    expect(last.sourceStatuses[0].errorMessage).not.toContain("fake-token-999");
  });

  it("counts API calls per day and per month", () => {
    const usage: ApiUsageRepository = new RepositoryFactory(openMemoryDatabase()).apiUsage();
    usage.increment("adzuna", "2026-10-01");
    usage.increment("adzuna", "2026-10-01");
    usage.increment("adzuna", "2026-10-02");
    usage.increment("adzuna", "2026-09-30");
    expect(usage.getDayCount("adzuna", "2026-10-01")).toBe(2);
    expect(usage.getDayCount("adzuna", "2026-10-03")).toBe(0);
    expect(usage.getMonthCount("adzuna", "2026-10")).toBe(3);
    expect(usage.getMonthCount("adzuna", "2026-09")).toBe(1);
  });

  it("gets and overwrites app state", () => {
    const state: AppStateRepository = new RepositoryFactory(openMemoryDatabase()).appState();
    expect(state.get("paused")).toBeNull();
    state.set("paused", "false");
    expect(state.get("paused")).toBe("false");
    state.set("paused", "true");
    expect(state.get("paused")).toBe("true");
  });

  it("stores companies and config history", () => {
    const database: SqliteDatabase = openMemoryDatabase();
    const factory: RepositoryFactory = new RepositoryFactory(database);
    const companies: CompanyRepository = factory.companies();
    const flags: CompanyFlags = {
      isGcc: true,
      isPreferred: true,
      isBlocked: false,
      atsType: "greenhouse",
      boardSlug: "northwind",
    };
    const created: Company = companies.upsertCompany("  Northwind Labs ", flags);
    expect(created.nameKey).toBe("northwind labs");
    expect(created.isGcc).toBe(true);
    const found: Company | null = companies.findByName("northwind labs");
    expect(found).not.toBeNull();
    if (found !== null) {
      expect(found.boardSlug).toBe("northwind");
    }
    const updatedFlags: CompanyFlags = {
      isGcc: false,
      isPreferred: false,
      isBlocked: true,
      atsType: "none",
      boardSlug: null,
    };
    companies.setFlags("Northwind Labs", updatedFlags);
    const blocked: Company | null = companies.findByName("Northwind Labs");
    expect(blocked).not.toBeNull();
    if (blocked !== null) {
      expect(blocked.isBlocked).toBe(true);
      expect(blocked.firstSeenAt).toBe(created.firstSeenAt);
    }
    expect(companies.findAll().length).toBe(1);

    const history: ConfigHistoryRepository = factory.configHistory();
    const firstEntry: ConfigHistoryEntry = {
      changedAt: "2026-10-01T00:00:00.000Z",
      changedBy: "file",
      key: "filters.minSalaryUsd",
      oldValue: null,
      newValue: "100000",
    };
    const secondEntry: ConfigHistoryEntry = {
      changedAt: "2026-10-02T00:00:00.000Z",
      changedBy: "telegram",
      key: "filters.minSalaryUsd",
      oldValue: "100000",
      newValue: "120000",
    };
    history.record(firstEntry);
    history.record(secondEntry);
    const recent: StoredConfigHistoryEntry[] = history.listRecent(1);
    expect(recent.length).toBe(1);
    expect(recent[0].newValue).toBe("120000");
    expect(recent[0].changedBy).toBe("telegram");
  });

  it("lists sent jobs since a timestamp", () => {
    const database: SqliteDatabase = openMemoryDatabase();
    const factory: RepositoryFactory = new RepositoryFactory(database);
    const jobs: JobRepository = factory.jobs();
    const sent: SentJobRepository = factory.sentJobs();
    const runs: RunRepository = factory.runs();
    jobs.upsertJobs([sampleJob("remoteok", "ext-9", new Date("2026-10-01T00:00:00.000Z"))]);
    const stored: StoredJob = jobs.findByStatus("new", 1)[0];
    const runId: number = runs.startRun("manual");
    const before: string = new Date().toISOString();
    sent.recordSent(stored.id, stored.dedupeKey, runId, 1, 90, "top");
    const listed: SentJobRecord[] = sent.listSentSince(before);
    expect(listed.length).toBe(1);
    expect(listed[0].jobId).toBe(stored.id);
    expect(listed[0].section).toBe("top");
  });
});
