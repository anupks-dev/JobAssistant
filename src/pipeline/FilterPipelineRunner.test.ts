import { describe, expect, it } from "vitest";
import { AppConfig } from "../config/AppConfig";
import { RepositoryFactory } from "../db/RepositoryFactory";
import { SqliteDatabase } from "../db/SqliteDatabase";
import { JobRepository, StoredJob } from "../db/repositories/JobRepository";
import { Job } from "../models/Job";
import { FixedClock, loadConfig } from "./FilterTestSupport";
import { FilterCommand } from "./cli/FilterCommand";
import { FilterSummaryPrinter } from "./cli/FilterSummaryPrinter";
import { FilterPipelineRunner, FilterRunSummary, ReasonCount } from "./FilterPipelineRunner";
import { JobFilterPipeline } from "./JobFilterPipeline";
import { PhraseMatcher } from "./PhraseMatcher";
import { PreScorer } from "./PreScorer";

const NOW: Date = new Date("2026-10-04T12:00:00.000Z");

function posting(
  source: string,
  externalId: string,
  company: string,
  title: string,
  location: string,
  postedAt: Date,
): Job {
  const job: Job = {
    source: source,
    externalId: externalId,
    title: title,
    company: company,
    location: location,
    remoteType: "remote",
    salaryMin: null,
    salaryMax: null,
    currency: null,
    salaryKnown: false,
    salaryIsEstimated: false,
    url: "https://example.com/jobs/" + externalId,
    postedAt: postedAt,
    description: "Build backend services for the platform.",
    descriptionIsSnippet: false,
  };
  return job;
}

function countFor(summary: FilterRunSummary, reason: string): number {
  for (let index: number = 0; index < summary.rejectedByReason.length; index++) {
    const entry: ReasonCount = summary.rejectedByReason[index];
    if (entry.reason === reason) {
      return entry.count;
    }
  }
  return 0;
}

function openRunner(config: AppConfig): { database: SqliteDatabase; jobs: JobRepository; runner: FilterPipelineRunner } {
  const database: SqliteDatabase = new SqliteDatabase(":memory:");
  const factory: RepositoryFactory = new RepositoryFactory(database);
  const phrases: PhraseMatcher = new PhraseMatcher();
  const runner: FilterPipelineRunner = new FilterPipelineRunner(
    factory.jobs(),
    factory.sentJobs(),
    factory.companies(),
    config,
    new FixedClock(NOW),
    new JobFilterPipeline(new FilterCommand().filters(phrases)),
    new PreScorer(phrases),
  );
  return { database: database, jobs: factory.jobs(), runner: runner };
}

describe("FilterPipelineRunner", () => {
  it("stops at the first rejection and reports counts", () => {
    const config: AppConfig = loadConfig();
    const blocked: AppConfig = {
      ...config,
      companies: { preferred: config.companies.preferred, blocked: ["Acme"] },
    };
    const opened = openRunner(blocked);
    const oldPosted: Date = new Date(NOW.getTime() - 8 * 24 * 60 * 60 * 1000);
    opened.jobs.upsertJobs([
      posting("remoteok", "blocked", "Acme", "Tech Lead", "Remote - Worldwide", oldPosted),
      posting("remoteok", "kept", "Example Labs", "Tech Lead", "Remote - Worldwide", NOW),
    ]);
    const summary: FilterRunSummary = opened.runner.run(false);
    expect(summary.evaluated).toBe(2);
    expect(summary.shortlisted).toBe(1);
    expect(summary.capped).toBe(0);
    expect(countFor(summary, "blocked_company")).toBe(1);
    expect(countFor(summary, "too_old")).toBe(0);
    const rejected: StoredJob[] = opened.jobs.findRejectedByReason("blocked_company", 20);
    expect(rejected.length).toBe(1);
    expect(rejected[0].company).toBe("Acme");
    opened.database.close();
  });

  it("caps the shortlist with the pre-scorer", () => {
    const config: AppConfig = loadConfig();
    const cappedConfig: AppConfig = {
      ...config,
      filters: { ...config.filters, maxShortlist: 1 },
    };
    const opened = openRunner(cappedConfig);
    opened.jobs.upsertJobs([
      posting("remoteok", "apple", "Apple", "Tech Lead", "Remote - Worldwide", NOW),
      posting("remoteok", "other", "Other Labs", "Tech Lead", "Remote - Worldwide", NOW),
    ]);
    const summary: FilterRunSummary = opened.runner.run(false);
    expect(summary.evaluated).toBe(2);
    expect(summary.shortlisted).toBe(1);
    expect(summary.capped).toBe(1);
    const kept: StoredJob[] = opened.jobs.findByStatus("shortlisted", 10);
    expect(kept.length).toBe(1);
    expect(kept[0].company).toBe("Apple");
    const capped: StoredJob[] = opened.jobs.findRejectedByReason("capped", 10);
    expect(capped.length).toBe(1);
    expect(capped[0].company).toBe("Other Labs");
    opened.database.close();
  });

  it("leaves sent jobs in place when reevaluating", () => {
    const opened = openRunner(loadConfig());
    opened.jobs.upsertJobs([
      posting("greenhouse", "sent", "Sent Co", "Tech Lead", "Remote - Worldwide", NOW),
      posting("greenhouse", "scored", "Keep Co", "Tech Lead", "Remote - Worldwide", NOW),
      posting("greenhouse", "sales", "Keep Co", "Sales Engineer", "Remote - Worldwide", NOW),
    ]);
    opened.runner.run(false);
    const sentBefore: StoredJob[] = opened.jobs.findByStatus("shortlisted", 10);
    let sentId: number = 0;
    let scoredId: number = 0;
    for (let index: number = 0; index < sentBefore.length; index++) {
      if (sentBefore[index].company === "Sent Co") {
        sentId = sentBefore[index].id;
      }
      if (sentBefore[index].company === "Keep Co" && sentBefore[index].title === "Tech Lead") {
        scoredId = sentBefore[index].id;
      }
    }
    opened.jobs.updateStatus(sentId, "sent");
    opened.jobs.updateStatus(scoredId, "scored");
    const factory: RepositoryFactory = new RepositoryFactory(opened.database);
    const runId: number = factory.runs().startRun("manual");
    const sentJob: StoredJob | null = opened.jobs.findById(sentId);
    expect(sentJob).not.toBeNull();
    factory.sentJobs().recordSent(sentId, sentJob === null ? "" : sentJob.dedupeKey, runId, 1, 1, "top");
    const summary: FilterRunSummary = opened.runner.run(true);
    expect(opened.jobs.findById(sentId)?.status).toBe("sent");
    expect(opened.jobs.findById(scoredId)?.status).toBe("shortlisted");
    expect(summary.shortlisted).toBe(1);
    expect(countFor(summary, "title_excluded")).toBe(1);
    opened.database.close();
  });

  it("counts rejections per source", () => {
    const opened = openRunner(loadConfig());
    opened.jobs.upsertJobs([
      posting("greenhouse", "place", "Example Labs", "Tech Lead", "Guatemala", NOW),
      posting("adzuna", "kept", "Example Labs", "Tech Lead", "Remote - Worldwide", NOW),
    ]);
    const summary: FilterRunSummary = opened.runner.run(false);
    expect(summary.bySource).toEqual([
      { source: "adzuna", reason: "shortlisted", count: 1 },
      { source: "greenhouse", reason: "onsite_other_location", count: 1 },
    ]);
    const printer: FilterSummaryPrinter = new FilterSummaryPrinter();
    const lines: string[] = printer.lines(summary);
    expect(lines).toContain("source | reason | count");
    expect(lines).toContain("greenhouse | onsite_other_location | 1");
    expect(lines).toContain("adzuna | shortlisted | 1");
    const rejected: StoredJob[] = opened.jobs.findRejectedByReason("onsite_other_location", 1, "greenhouse", 0);
    expect(rejected.length).toBe(1);
    expect(rejected[0].location).toBe("Guatemala");
    const skipped: StoredJob[] = opened.jobs.findRejectedByReason("onsite_other_location", 1, "greenhouse", 1);
    expect(skipped.length).toBe(0);
    const otherSource: StoredJob[] = opened.jobs.findRejectedByReason("onsite_other_location", 10, "adzuna", 0);
    expect(otherSource.length).toBe(0);
    opened.database.close();
  });
});
