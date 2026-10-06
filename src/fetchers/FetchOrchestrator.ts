import { ErrorSanitizer } from "../db/ErrorSanitizer";
import { AppStateRepository } from "../db/repositories/AppStateRepository";
import { JobRepository, UpsertJobsResult } from "../db/repositories/JobRepository";
import { RunRepository, SourceStatus, SourceStatusRecord } from "../db/repositories/RunRepository";
import { Job } from "../models/Job";
import { DedupeKeyBuilder } from "../pipeline/DedupeKeyBuilder";
import { FetchBatch } from "./FetchBatch";
import { BatchJobFetcher, JobFetcher } from "./JobFetcher";
import { UrlRejection, UrlValidator } from "./parsing/UrlValidator";

interface FilteredJobs {
  accepted: Job[];
  droppedUrls: number;
  droppedHosts: number;
  droppedInvalidUrls: number;
}

export interface SourceFetchReport {
  sourceId: string;
  status: SourceStatus;
  fetched: number;
  inserted: number;
  skipped: number;
  droppedUrls: number;
  droppedHosts: number;
  droppedInvalidUrls: number;
}

// Sources run one after another so a failure or a rate limit in one feed cannot take down the others.
export class FetchOrchestrator {
  public constructor(
    private readonly fetchers: JobFetcher[],
    private readonly jobRepository: JobRepository,
    private readonly runRepository: RunRepository,
    private readonly appStateRepository: AppStateRepository,
    private readonly urlValidator: UrlValidator,
    private readonly errorSanitizer: ErrorSanitizer,
  ) {}

  public async fetchAll(runId: number, force: boolean): Promise<SourceFetchReport[]> {
    const reports: SourceFetchReport[] = [];
    for (let index: number = 0; index < this.fetchers.length; index++) {
      const produced: SourceFetchReport[] = await this.fetchOne(runId, this.fetchers[index], force);
      for (let reportIndex: number = 0; reportIndex < produced.length; reportIndex++) {
        reports.push(produced[reportIndex]);
      }
    }
    return reports;
  }

  private async fetchOne(runId: number, fetcher: JobFetcher, force: boolean): Promise<SourceFetchReport[]> {
    if (this.shouldSkip(fetcher, force)) {
      this.recordStatus(runId, fetcher.getSourceId(), "skipped", 0, null, 0);
      return [this.report(fetcher.getSourceId(), "skipped", 0, 0, 0, 0, 0, 0)];
    }
    if (this.isBatchFetcher(fetcher)) {
      return this.fetchBatches(runId, fetcher);
    }
    const single: SourceFetchReport = await this.fetchSingle(runId, fetcher);
    return [single];
  }

  private async fetchBatches(runId: number, fetcher: BatchJobFetcher): Promise<SourceFetchReport[]> {
    const startedAt: number = Date.now();
    try {
      const batches: FetchBatch[] = await fetcher.fetchBatches();
      if (batches.length === 0) {
        const durationMs: number = Date.now() - startedAt;
        this.appStateRepository.set(this.fetchKey(fetcher.getSourceId()), new Date().toISOString());
        this.recordStatus(runId, fetcher.getSourceId(), "ok", 0, null, durationMs);
        return [this.report(fetcher.getSourceId(), "ok", 0, 0, 0, 0, 0, 0)];
      }
      const reports: SourceFetchReport[] = [];
      let anyOk: boolean = false;
      for (let index: number = 0; index < batches.length; index++) {
        const batch: FetchBatch = batches[index];
        if (batch.status === "ok") {
          anyOk = true;
        }
        reports.push(this.applyBatch(runId, batch));
      }
      if (anyOk) {
        this.appStateRepository.set(this.fetchKey(fetcher.getSourceId()), new Date().toISOString());
      }
      return reports;
    } catch (error: unknown) {
      const durationMs: number = Date.now() - startedAt;
      const message: string = this.safeMessage(error);
      this.recordStatus(runId, fetcher.getSourceId(), "error", 0, message, durationMs);
      return [this.report(fetcher.getSourceId(), "error", 0, 0, 0, 0, 0, 0)];
    }
  }

  private applyBatch(runId: number, batch: FetchBatch): SourceFetchReport {
    const note: string | null = this.sanitizeNote(batch.note);
    if (batch.status !== "ok" && batch.jobs.length === 0) {
      this.recordStatus(runId, batch.sourceId, batch.status, 0, note, batch.durationMs);
      return this.report(batch.sourceId, batch.status, 0, 0, 0, 0, 0, 0);
    }
    const filtered: FilteredJobs = this.filterUrls(batch.jobs, batch.catalogSourceId);
    if (batch.status === "ok" || batch.jobs.length > 0) {
      const saved: UpsertJobsResult = this.jobRepository.upsertJobs(filtered.accepted, this.dedupeKeys(filtered.accepted));
      this.recordStatus(runId, batch.sourceId, batch.status, batch.jobs.length, note, batch.durationMs);
      return this.report(
        batch.sourceId,
        batch.status,
        batch.jobs.length,
        saved.inserted,
        saved.skipped,
        filtered.droppedUrls,
        filtered.droppedHosts,
        filtered.droppedInvalidUrls,
      );
    }
    this.recordStatus(runId, batch.sourceId, batch.status, 0, note, batch.durationMs);
    return this.report(batch.sourceId, batch.status, 0, 0, 0, 0, 0, 0);
  }

  private async fetchSingle(runId: number, fetcher: JobFetcher): Promise<SourceFetchReport> {
    const startedAt: number = Date.now();
    try {
      const fetchedJobs: Job[] = await fetcher.fetchJobs();
      const accepted: Job[] = [];
      let droppedUrls: number = 0;
      let droppedHosts: number = 0;
      let droppedInvalidUrls: number = 0;
      for (let index: number = 0; index < fetchedJobs.length; index++) {
        const job: Job = fetchedJobs[index];
        const rejection: UrlRejection | null = this.urlValidator.rejection(job.url, fetcher.getSourceId());
        if (rejection === null) {
          accepted.push(job);
        } else {
          droppedUrls = droppedUrls + 1;
          if (rejection === "host") {
            droppedHosts = droppedHosts + 1;
          } else {
            droppedInvalidUrls = droppedInvalidUrls + 1;
          }
        }
      }
      const keys: string[] = this.dedupeKeys(accepted);
      const saved: UpsertJobsResult = this.jobRepository.upsertJobs(accepted, keys);
      const durationMs: number = Date.now() - startedAt;
      this.appStateRepository.set(this.fetchKey(fetcher.getSourceId()), new Date().toISOString());
      this.recordStatus(runId, fetcher.getSourceId(), "ok", fetchedJobs.length, null, durationMs);
      return this.report(
        fetcher.getSourceId(),
        "ok",
        fetchedJobs.length,
        saved.inserted,
        saved.skipped,
        droppedUrls,
        droppedHosts,
        droppedInvalidUrls,
      );
    } catch (error: unknown) {
      const durationMs: number = Date.now() - startedAt;
      const message: string = this.safeMessage(error);
      this.recordStatus(runId, fetcher.getSourceId(), "error", 0, message, durationMs);
      return this.report(fetcher.getSourceId(), "error", 0, 0, 0, 0, 0, 0);
    }
  }

  private shouldSkip(fetcher: JobFetcher, force: boolean): boolean {
    if (force) {
      return false;
    }
    const raw: string | null = this.appStateRepository.get(this.fetchKey(fetcher.getSourceId()));
    if (raw === null) {
      return false;
    }
    const lastMs: number = Date.parse(raw);
    if (Number.isNaN(lastMs)) {
      return false;
    }
    const intervalMs: number = fetcher.getPolicy().minIntervalMinutes * 60 * 1000;
    const elapsedMs: number = Date.now() - lastMs;
    return elapsedMs < intervalMs;
  }

  private filterUrls(jobs: Job[], catalogSourceId: string): FilteredJobs {
    const accepted: Job[] = [];
    let droppedUrls: number = 0;
    let droppedHosts: number = 0;
    let droppedInvalidUrls: number = 0;
    for (let index: number = 0; index < jobs.length; index++) {
      const job: Job = jobs[index];
      const rejection: UrlRejection | null = this.urlValidator.rejection(job.url, catalogSourceId);
      if (rejection === null) {
        accepted.push(job);
      } else {
        droppedUrls = droppedUrls + 1;
        if (rejection === "host") {
          droppedHosts = droppedHosts + 1;
        } else {
          droppedInvalidUrls = droppedInvalidUrls + 1;
        }
      }
    }
    const filtered: FilteredJobs = {
      accepted: accepted,
      droppedUrls: droppedUrls,
      droppedHosts: droppedHosts,
      droppedInvalidUrls: droppedInvalidUrls,
    };
    return filtered;
  }

  private sanitizeNote(note: string | null): string | null {
    if (note === null) {
      return null;
    }
    return this.errorSanitizer.sanitize(note);
  }

  private isBatchFetcher(fetcher: JobFetcher): fetcher is BatchJobFetcher {
    const candidate: BatchJobFetcher = fetcher as BatchJobFetcher;
    return typeof candidate.fetchBatches === "function";
  }

  private dedupeKeys(jobs: Job[]): string[] {
    const keys: string[] = [];
    for (let index: number = 0; index < jobs.length; index++) {
      const job: Job = jobs[index];
      keys.push(DedupeKeyBuilder.build(job.company, job.title, job.location));
    }
    return keys;
  }

  private recordStatus(
    runId: number,
    sourceId: string,
    status: SourceStatus,
    jobCount: number,
    errorMessage: string | null,
    durationMs: number,
  ): void {
    const record: SourceStatusRecord = {
      source: sourceId,
      status: status,
      jobCount: jobCount,
      errorMessage: errorMessage,
      durationMs: durationMs,
    };
    this.runRepository.addSourceStatus(runId, record);
  }

  private safeMessage(error: unknown): string {
    if (error instanceof Error) {
      return this.errorSanitizer.sanitize(error.message);
    }
    return "Source request failed.";
  }

  private fetchKey(sourceId: string): string {
    return "last_fetch_at:" + sourceId;
  }

  private report(
    sourceId: string,
    status: SourceStatus,
    fetched: number,
    inserted: number,
    skipped: number,
    droppedUrls: number,
    droppedHosts: number,
    droppedInvalidUrls: number,
  ): SourceFetchReport {
    const report: SourceFetchReport = {
      sourceId: sourceId,
      status: status,
      fetched: fetched,
      inserted: inserted,
      skipped: skipped,
      droppedUrls: droppedUrls,
      droppedHosts: droppedHosts,
      droppedInvalidUrls: droppedInvalidUrls,
    };
    return report;
  }
}
