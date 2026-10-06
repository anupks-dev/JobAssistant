import { describe, expect, it } from "vitest";
import { ErrorSanitizer } from "../db/ErrorSanitizer";
import { RepositoryFactory } from "../db/RepositoryFactory";
import { StoredJob } from "../db/repositories/JobRepository";
import { RunRecord } from "../db/repositories/RunRepository";
import { SqliteDatabase } from "../db/SqliteDatabase";
import { Job } from "../models/Job";
import { FetchOrchestrator, SourceFetchReport } from "./FetchOrchestrator";
import { JobFetcher } from "./JobFetcher";
import { UrlValidator } from "./parsing/UrlValidator";
import { SourceCatalog } from "./SourceCatalog";
import { SourcePolicy } from "./SourcePolicy";

class FakeFetcher implements JobFetcher {
  public calls: number = 0;

  public constructor(
    private readonly sourceId: string,
    private readonly policy: SourcePolicy,
    private readonly jobs: Job[],
    private readonly failure: Error | null,
  ) {}

  public getSourceName(): string {
    return this.sourceId;
  }

  public getSourceId(): string {
    return this.sourceId;
  }

  public getPolicy(): SourcePolicy {
    return this.policy;
  }

  public async fetchJobs(): Promise<Job[]> {
    this.calls = this.calls + 1;
    if (this.failure !== null) {
      throw this.failure;
    }
    const copy: Job[] = [];
    for (let index: number = 0; index < this.jobs.length; index++) {
      copy.push(this.jobs[index]);
    }
    return copy;
  }
}

function policy(minutes: number): SourcePolicy {
  const value: SourcePolicy = {
    enabled: true,
    minIntervalMinutes: minutes,
    maxPages: 1,
    requestDelayMs: 0,
  };
  return value;
}

function sampleJob(url: string): Job {
  const job: Job = {
    source: "remoteok",
    externalId: "1",
    title: "Backend Engineer",
    company: "Example Labs",
    location: "Remote",
    remoteType: "remote",
    salaryMin: null,
    salaryMax: null,
    currency: null,
    salaryKnown: false,
    salaryIsEstimated: false,
    url: url,
    postedAt: new Date("2026-10-02T12:53:01.000Z"),
    description: "Build APIs.",
    descriptionIsSnippet: false,
  };
  return job;
}

describe("FetchOrchestrator", () => {
  it("continues after one source fails and stores a sanitized error", async () => {
    const database: SqliteDatabase = new SqliteDatabase(":memory:");
    const factory: RepositoryFactory = new RepositoryFactory(database);
    const failing: FakeFetcher = new FakeFetcher("remoteok", policy(720), [], new Error("token=fake-token-999"));
    const remotiveJob: Job = sampleJob("https://remotive.com/remote-jobs/1");
    remotiveJob.source = "remotive";
    const working: FakeFetcher = new FakeFetcher("remotive", policy(360), [remotiveJob], null);
    const fetchers: JobFetcher[] = [failing, working];
    const orchestrator: FetchOrchestrator = new FetchOrchestrator(
      fetchers,
      factory.jobs(),
      factory.runs(),
      factory.appState(),
      new UrlValidator(new SourceCatalog()),
      new ErrorSanitizer(),
    );
    const runId: number = factory.runs().startRun("manual");
    const reports: SourceFetchReport[] = await orchestrator.fetchAll(runId, false);
    expect(reports[0].status).toBe("error");
    expect(reports[1].status).toBe("ok");
    expect(reports[1].inserted).toBe(1);
    const stored: StoredJob[] = factory.jobs().findByStatus("new", 10);
    expect(stored.length).toBe(1);
    expect(stored[0].status).toBe("new");
    const run: RunRecord | null = factory.runs().getLastRun();
    expect(run).not.toBeNull();
    const message: string = run?.sourceStatuses[0].errorMessage ?? "";
    expect(message).not.toContain("fake-token-999");
    database.close();
  });

  it("skips a source inside its interval unless force is set", async () => {
    const database: SqliteDatabase = new SqliteDatabase(":memory:");
    const factory: RepositoryFactory = new RepositoryFactory(database);
    factory.appState().set("last_fetch_at:remoteok", new Date().toISOString());
    const fetcher: FakeFetcher = new FakeFetcher("remoteok", policy(720), [sampleJob("https://remoteok.com/remote-jobs/1")], null);
    const orchestrator: FetchOrchestrator = new FetchOrchestrator(
      [fetcher],
      factory.jobs(),
      factory.runs(),
      factory.appState(),
      new UrlValidator(new SourceCatalog()),
      new ErrorSanitizer(),
    );
    const skippedRun: number = factory.runs().startRun("manual");
    const skipped: SourceFetchReport[] = await orchestrator.fetchAll(skippedRun, false);
    expect(fetcher.calls).toBe(0);
    expect(skipped[0].status).toBe("skipped");
    const forcedRun: number = factory.runs().startRun("manual");
    const forced: SourceFetchReport[] = await orchestrator.fetchAll(forcedRun, true);
    expect(fetcher.calls).toBe(1);
    expect(forced[0].status).toBe("ok");
    database.close();
  });

  it("drops a URL whose host is not allowed", async () => {
    const database: SqliteDatabase = new SqliteDatabase(":memory:");
    const factory: RepositoryFactory = new RepositoryFactory(database);
    const jobs: Job[] = [
      sampleJob("http://remoteok.com/remote-jobs/1"),
      sampleJob("https://remoteok.com/remote-jobs/2"),
    ];
    jobs[1].externalId = "2";
    const fetcher: FakeFetcher = new FakeFetcher("remoteok", policy(720), jobs, null);
    const orchestrator: FetchOrchestrator = new FetchOrchestrator(
      [fetcher],
      factory.jobs(),
      factory.runs(),
      factory.appState(),
      new UrlValidator(new SourceCatalog()),
      new ErrorSanitizer(),
    );
    const runId: number = factory.runs().startRun("manual");
    const reports: SourceFetchReport[] = await orchestrator.fetchAll(runId, false);
    expect(reports[0].droppedUrls).toBe(1);
    expect(reports[0].droppedInvalidUrls).toBe(1);
    expect(reports[0].droppedHosts).toBe(0);
    expect(reports[0].inserted).toBe(1);
    const stored: StoredJob[] = factory.jobs().findByStatus("new", 10);
    expect(stored.length).toBe(1);
    expect(stored[0].url).toBe("https://remoteok.com/remote-jobs/2");
    database.close();
  });

  it("keeps Arbeitnow jobs on the com, ch, and fr hosts", async () => {
    const database: SqliteDatabase = new SqliteDatabase(":memory:");
    const factory: RepositoryFactory = new RepositoryFactory(database);
    const jobs: Job[] = [
      sampleJob("https://www.arbeitnow.com/jobs/remote-backend-example"),
      sampleJob("https://www.arbeitnow.ch/jobs/remote-backend-example"),
      sampleJob("https://www.arbeitnow.fr/jobs/remote-backend-example"),
    ];
    jobs[0].source = "arbeitnow";
    jobs[0].externalId = "com";
    jobs[1].source = "arbeitnow";
    jobs[1].externalId = "ch";
    jobs[1].title = "Backend Engineer CH";
    jobs[2].source = "arbeitnow";
    jobs[2].externalId = "fr";
    jobs[2].title = "Backend Engineer FR";
    const fetcher: FakeFetcher = new FakeFetcher("arbeitnow", policy(720), jobs, null);
    const orchestrator: FetchOrchestrator = new FetchOrchestrator(
      [fetcher],
      factory.jobs(),
      factory.runs(),
      factory.appState(),
      new UrlValidator(new SourceCatalog()),
      new ErrorSanitizer(),
    );
    const runId: number = factory.runs().startRun("manual");
    const reports: SourceFetchReport[] = await orchestrator.fetchAll(runId, false);
    expect(reports[0].droppedUrls).toBe(0);
    expect(reports[0].inserted).toBe(3);
    database.close();
  });
});
