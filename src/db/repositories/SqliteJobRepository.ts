import Database from "better-sqlite3";
import { Job, RemoteType } from "../../models/Job";
import { DedupeKeyBuilder } from "../../pipeline/DedupeKeyBuilder";
import { JobRow } from "../rows/TableRows";
import { FilterSaveResult, JobRepository, JobStatus, RegionEligibility, StoredJob, UpsertJobsResult } from "./JobRepository";

interface PresentRow {
  present: number;
}

interface JobInsertBindings {
  source: string;
  externalId: string;
  title: string;
  company: string;
  location: string;
  remoteType: string;
  salaryMin: number | null;
  salaryMax: number | null;
  currency: string | null;
  salaryKnown: number;
  salaryIsEstimated: number;
  url: string;
  postedAt: string | null;
  fetchedAt: string;
  description: string;
  descriptionIsSnippet: number;
  dedupeKey: string;
  status: string;
  rejectionReason: null;
  score: null;
  scoreReason: null;
}

const INSERT_JOB_SQL: string = "INSERT OR IGNORE INTO jobs ("
  + " source, external_id, title, company, location, remote_type,"
  + " salary_min, salary_max, currency, salary_known, salary_is_estimated,"
  + " url, posted_at, fetched_at, description, description_is_snippet,"
  + " dedupe_key, status, rejection_reason, score, score_reason"
  + ") VALUES ("
  + " @source, @externalId, @title, @company, @location, @remoteType,"
  + " @salaryMin, @salaryMax, @currency, @salaryKnown, @salaryIsEstimated,"
  + " @url, @postedAt, @fetchedAt, @description, @descriptionIsSnippet,"
  + " @dedupeKey, @status, @rejectionReason, @score, @scoreReason"
  + ")";

// Inserts ignore an existing source id so a later fetch cannot reset status or score.
export class SqliteJobRepository implements JobRepository {
  public constructor(private readonly connection: Database.Database) {}

  public upsertJobs(jobs: Job[], dedupeKeys?: string[]): UpsertJobsResult {
    const keys: string[] = this.resolveDedupeKeys(jobs, dedupeKeys);
    const result: UpsertJobsResult = { inserted: 0, skipped: 0 };
    const insert: Database.Statement<[JobInsertBindings], unknown> = this.connection.prepare<
      JobInsertBindings,
      unknown
    >(INSERT_JOB_SQL);
    const writeAll: (items: Job[], itemKeys: string[]) => void = this.connection.transaction((items: Job[], itemKeys: string[]): void => {
      for (let index: number = 0; index < items.length; index++) {
        const inserted: boolean = this.insertJob(insert, items[index], itemKeys[index]);
        if (inserted) {
          result.inserted = result.inserted + 1;
        } else {
          result.skipped = result.skipped + 1;
        }
      }
    });
    writeAll(jobs, keys);
    return result;
  }

  public findByStatus(status: JobStatus, limit: number, source?: string, offset?: number): StoredJob[] {
    return this.selectJobs("status = ?", [status], limit, source, offset);
  }

  public existsByDedupeKey(dedupeKey: string): boolean {
    const statement: Database.Statement<[string], PresentRow> = this.connection.prepare<[string], PresentRow>(
      "SELECT 1 AS present FROM jobs WHERE dedupe_key = ? LIMIT 1",
    );
    const row: PresentRow | undefined = statement.get(dedupeKey);
    return row !== undefined;
  }

  public existsByExternalId(source: string, externalId: string): boolean {
    const statement: Database.Statement<[string, string], PresentRow> = this.connection.prepare<[string, string], PresentRow>(
      "SELECT 1 AS present FROM jobs WHERE source = ? AND external_id = ? LIMIT 1",
    );
    const row: PresentRow | undefined = statement.get(source, externalId);
    return row !== undefined;
  }

  public updateStatus(jobId: number, status: JobStatus, rejectionReason?: string): void {
    let reason: string | null = null;
    if (rejectionReason !== undefined) {
      reason = rejectionReason;
    }
    const statement: Database.Statement<[string, string | null, number], unknown> = this.connection.prepare<
      [string, string | null, number],
      unknown
    >("UPDATE jobs SET status = ?, rejection_reason = ? WHERE id = ?");
    const outcome: Database.RunResult = statement.run(status, reason, jobId);
    if (outcome.changes === 0) {
      throw new Error("Job not found.");
    }
  }

  public saveScore(jobId: number, score: number, reason: string): void {
    if (score < 0 || score > 100) {
      throw new Error("Score must be between 0 and 100.");
    }
    const statement: Database.Statement<[number, string, number], unknown> = this.connection.prepare<
      [number, string, number],
      unknown
    >("UPDATE jobs SET score = ?, score_reason = ? WHERE id = ?");
    const outcome: Database.RunResult = statement.run(score, reason, jobId);
    if (outcome.changes === 0) {
      throw new Error("Job not found.");
    }
  }

  public findById(jobId: number): StoredJob | null {
    const statement: Database.Statement<[number], JobRow> = this.connection.prepare<[number], JobRow>(
      "SELECT * FROM jobs WHERE id = ?",
    );
    const row: JobRow | undefined = statement.get(jobId);
    if (row === undefined) {
      return null;
    }
    return this.mapJobRow(row);
  }

  public saveFilterResult(jobId: number, result: FilterSaveResult): void {
    const statement: Database.Statement<
      [string, string | null, string | null, number, number | null, number | null, string | null, number],
      unknown
    > = this.connection.prepare<
      [string, string | null, string | null, number, number | null, number | null, string | null, number],
      unknown
    >(
      "UPDATE jobs SET status = ?, rejection_reason = ?, region_eligibility = ?, is_bangalore_gcc = ?,"
      + " salary_usd_min = ?, salary_usd_max = ?, filter_notes = ? WHERE id = ?",
    );
    const outcome: Database.RunResult = statement.run(
      result.status,
      result.reason,
      result.regionEligibility,
      this.toInteger(result.isBangaloreGcc),
      result.salaryUsdMin,
      result.salaryUsdMax,
      result.notes,
      jobId,
    );
    if (outcome.changes === 0) {
      throw new Error("Job not found.");
    }
  }

  public resetForReevaluation(): void {
    const statement: Database.Statement<[], unknown> = this.connection.prepare<[], unknown>(
      "UPDATE jobs SET status = 'new', rejection_reason = NULL, region_eligibility = NULL,"
      + " is_bangalore_gcc = 0, salary_usd_min = NULL, salary_usd_max = NULL, filter_notes = NULL"
      + " WHERE status IN ('rejected', 'shortlisted', 'scored')",
    );
    statement.run();
  }

  public findRejectedByReason(reason: string, limit: number, source?: string, offset?: number): StoredJob[] {
    return this.selectJobs("status = 'rejected' AND rejection_reason = ?", [reason], limit, source, offset);
  }

  public findPostedSince(sinceIso: string): StoredJob[] {
    const statement: Database.Statement<[string], JobRow> = this.connection.prepare<[string], JobRow>(
      "SELECT * FROM jobs WHERE posted_at IS NOT NULL AND posted_at >= ? ORDER BY posted_at ASC",
    );
    const rows: JobRow[] = statement.all(sinceIso);
    return this.mapJobRows(rows);
  }

  public purgeOlderThan(days: number): number {
    const millisPerDay: number = 24 * 60 * 60 * 1000;
    const ageMillis: number = days * millisPerDay;
    const cutoff: Date = new Date(Date.now() - ageMillis);
    const cutoffIso: string = cutoff.toISOString();
    // posted_at is often missing, so retention uses the time we stored the row.
    const statement: Database.Statement<[string], unknown> = this.connection.prepare<[string], unknown>(
      "DELETE FROM jobs WHERE fetched_at < ? AND NOT EXISTS ("
      + "SELECT 1 FROM sent_jobs WHERE sent_jobs.job_id = jobs.id"
      + ")",
    );
    const outcome: Database.RunResult = statement.run(cutoffIso);
    return outcome.changes;
  }

  private selectJobs(whereSql: string, values: string[], limit: number, source?: string, offset?: number): StoredJob[] {
    const start: number = offset === undefined ? 0 : offset;
    if (source === undefined || source.length === 0) {
      const sql: string = "SELECT * FROM jobs WHERE " + whereSql + " ORDER BY id ASC LIMIT ? OFFSET ?";
      const statement: Database.Statement<[string, number, number], JobRow> = this.connection.prepare<
        [string, number, number],
        JobRow
      >(sql);
      return this.mapJobRows(statement.all(values[0], limit, start));
    }
    const sql: string = "SELECT * FROM jobs WHERE " + whereSql + " AND source = ? ORDER BY id ASC LIMIT ? OFFSET ?";
    const statement: Database.Statement<[string, string, number, number], JobRow> = this.connection.prepare<
      [string, string, number, number],
      JobRow
    >(sql);
    return this.mapJobRows(statement.all(values[0], source, limit, start));
  }

  private resolveDedupeKeys(jobs: Job[], dedupeKeys: string[] | undefined): string[] {
    if (dedupeKeys === undefined) {
      const built: string[] = [];
      for (let index: number = 0; index < jobs.length; index++) {
        const job: Job = jobs[index];
        built.push(DedupeKeyBuilder.build(job.company, job.title, job.location));
      }
      return built;
    }
    if (dedupeKeys.length !== jobs.length) {
      throw new Error("Dedupe key count does not match the job count.");
    }
    return dedupeKeys;
  }

  private insertJob(
    statement: Database.Statement<[JobInsertBindings], unknown>,
    job: Job,
    dedupeKey: string,
  ): boolean {
    const bindings: JobInsertBindings = this.toInsertBindings(job, dedupeKey);
    const outcome: Database.RunResult = statement.run(bindings);
    return outcome.changes === 1;
  }

  private toInsertBindings(job: Job, dedupeKey: string): JobInsertBindings {
    const fetchedAt: string = new Date().toISOString();
    const bindings: JobInsertBindings = {
      source: job.source,
      externalId: job.externalId,
      title: job.title,
      company: job.company,
      location: job.location,
      remoteType: job.remoteType,
      salaryMin: job.salaryMin,
      salaryMax: job.salaryMax,
      currency: job.currency,
      salaryKnown: this.toInteger(this.normalizeSalaryKnown(job)),
      salaryIsEstimated: this.toInteger(job.salaryIsEstimated),
      url: job.url,
      postedAt: this.formatTimestamp(job.postedAt),
      fetchedAt: fetchedAt,
      description: job.description,
      descriptionIsSnippet: this.toInteger(job.descriptionIsSnippet),
      dedupeKey: dedupeKey,
      status: "new",
      rejectionReason: null,
      score: null,
      scoreReason: null,
    };
    return bindings;
  }

  // A predicted salary is not a posted salary, so it cannot be treated as known.
  private normalizeSalaryKnown(job: Job): boolean {
    if (job.salaryIsEstimated) {
      return false;
    }
    return job.salaryKnown;
  }

  private mapJobRows(rows: JobRow[]): StoredJob[] {
    const jobs: StoredJob[] = [];
    for (let index: number = 0; index < rows.length; index++) {
      jobs.push(this.mapJobRow(rows[index]));
    }
    return jobs;
  }

  private mapJobRow(row: JobRow): StoredJob {
    const salaryIsEstimated: boolean = this.toBoolean(row.salary_is_estimated);
    let salaryKnown: boolean = this.toBoolean(row.salary_known);
    if (salaryIsEstimated) {
      salaryKnown = false;
    }
    const job: StoredJob = {
      id: row.id,
      source: row.source,
      externalId: row.external_id,
      title: row.title,
      company: row.company,
      location: row.location,
      remoteType: this.mapRemoteType(row.remote_type),
      salaryMin: row.salary_min,
      salaryMax: row.salary_max,
      currency: row.currency,
      salaryKnown: salaryKnown,
      salaryIsEstimated: salaryIsEstimated,
      url: row.url,
      postedAt: this.parseTimestamp(row.posted_at),
      description: row.description,
      descriptionIsSnippet: this.toBoolean(row.description_is_snippet),
      fetchedAt: this.parseRequiredTimestamp(row.fetched_at),
      dedupeKey: row.dedupe_key,
      status: this.mapStatus(row.status),
      rejectionReason: row.rejection_reason,
      score: row.score,
      scoreReason: row.score_reason,
      regionEligibility: this.mapRegion(row.region_eligibility),
      isBangaloreGcc: this.toBoolean(row.is_bangalore_gcc),
      salaryUsdMin: row.salary_usd_min,
      salaryUsdMax: row.salary_usd_max,
      filterNotes: row.filter_notes,
    };
    return job;
  }

  private mapRemoteType(value: string): RemoteType {
    if (value === "remote" || value === "hybrid" || value === "onsite" || value === "unknown") {
      return value;
    }
    throw new Error("Job row has an unknown remote type.");
  }

  private mapRegion(value: string | null): RegionEligibility | null {
    if (value === null) {
      return null;
    }
    if (value === "open" || value === "unknown" || value === "restricted") {
      return value;
    }
    throw new Error("Job row has an unknown region eligibility.");
  }

  private mapStatus(value: string): JobStatus {
    if (value === "new" || value === "rejected" || value === "shortlisted" || value === "scored" || value === "sent") {
      return value;
    }
    throw new Error("Job row has an unknown status.");
  }

  private formatTimestamp(value: Date | null): string | null {
    if (value === null) {
      return null;
    }
    return value.toISOString();
  }

  private parseTimestamp(value: string | null): Date | null {
    if (value === null) {
      return null;
    }
    return new Date(value);
  }

  private parseRequiredTimestamp(value: string): Date {
    return new Date(value);
  }

  private toInteger(value: boolean): number {
    if (value) {
      return 1;
    }
    return 0;
  }

  private toBoolean(value: number): boolean {
    return value === 1;
  }
}
