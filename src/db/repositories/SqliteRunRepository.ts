import Database from "better-sqlite3";
import { ErrorSanitizer } from "../ErrorSanitizer";
import { RunRow, RunSourceStatusRow } from "../rows/TableRows";
import {
  FinishedRunStatus,
  RunCounts,
  RunRecord,
  RunRepository,
  RunStatus,
  RunTrigger,
  SourceStatus,
  SourceStatusRecord,
} from "./RunRepository";

export class SqliteRunRepository implements RunRepository {
  public constructor(
    private readonly connection: Database.Database,
    private readonly errorSanitizer: ErrorSanitizer,
  ) {}

  public startRun(trigger: RunTrigger): number {
    const startedAt: string = new Date().toISOString();
    const statement: Database.Statement<[string, string], unknown> = this.connection.prepare<[string, string], unknown>(
      "INSERT INTO runs (started_at, status, trigger, fetched_count, filtered_count, shortlisted_count, sent_count) "
      + "VALUES (?, 'running', ?, 0, 0, 0, 0)",
    );
    const outcome: Database.RunResult = statement.run(startedAt, trigger);
    return this.toId(outcome.lastInsertRowid);
  }

  public finishRun(runId: number, status: FinishedRunStatus, counts: RunCounts, notes?: string): void {
    let storedNotes: string | null = null;
    if (notes !== undefined) {
      storedNotes = notes;
    }
    const finishedAt: string = new Date().toISOString();
    const statement: Database.Statement<[string, string, number, number, number, number, string | null, number], unknown> =
      this.connection.prepare<[string, string, number, number, number, number, string | null, number], unknown>(
        "UPDATE runs SET finished_at = ?, status = ?, fetched_count = ?, filtered_count = ?, "
        + "shortlisted_count = ?, sent_count = ?, notes = ? WHERE id = ?",
      );
    const outcome: Database.RunResult = statement.run(
      finishedAt,
      status,
      counts.fetchedCount,
      counts.filteredCount,
      counts.shortlistedCount,
      counts.sentCount,
      storedNotes,
      runId,
    );
    if (outcome.changes === 0) {
      throw new Error("Run not found.");
    }
  }

  public addSourceStatus(runId: number, record: SourceStatusRecord): void {
    const errorMessage: string | null = this.sanitizeError(record.errorMessage);
    const statement: Database.Statement<[number, string, string, number, string | null, number], unknown> =
      this.connection.prepare<[number, string, string, number, string | null, number], unknown>(
        "INSERT INTO run_source_status (run_id, source, status, job_count, error_message, duration_ms) "
        + "VALUES (?, ?, ?, ?, ?, ?)",
      );
    statement.run(runId, record.source, record.status, record.jobCount, errorMessage, record.durationMs);
  }

  public getLastRun(): RunRecord | null {
    const statement: Database.Statement<[], RunRow> = this.connection.prepare<[], RunRow>(
      "SELECT * FROM runs ORDER BY id DESC LIMIT 1",
    );
    const row: RunRow | undefined = statement.get();
    if (row === undefined) {
      return null;
    }
    return this.mapRunRow(row);
  }

  private mapRunRow(row: RunRow): RunRecord {
    const record: RunRecord = {
      id: row.id,
      startedAt: row.started_at,
      finishedAt: row.finished_at,
      status: this.mapRunStatus(row.status),
      trigger: this.mapTrigger(row.trigger),
      fetchedCount: row.fetched_count,
      filteredCount: row.filtered_count,
      shortlistedCount: row.shortlisted_count,
      sentCount: row.sent_count,
      notes: row.notes,
      sourceStatuses: this.loadSourceStatuses(row.id),
    };
    return record;
  }

  private loadSourceStatuses(runId: number): SourceStatusRecord[] {
    const statement: Database.Statement<[number], RunSourceStatusRow> = this.connection.prepare<
      [number],
      RunSourceStatusRow
    >("SELECT * FROM run_source_status WHERE run_id = ? ORDER BY id ASC");
    const rows: RunSourceStatusRow[] = statement.all(runId);
    const records: SourceStatusRecord[] = [];
    for (let index: number = 0; index < rows.length; index++) {
      records.push(this.mapSourceStatusRow(rows[index]));
    }
    return records;
  }

  private mapSourceStatusRow(row: RunSourceStatusRow): SourceStatusRecord {
    const record: SourceStatusRecord = {
      source: row.source,
      status: this.mapSourceStatus(row.status),
      jobCount: row.job_count,
      errorMessage: row.error_message,
      durationMs: row.duration_ms,
    };
    return record;
  }

  private sanitizeError(errorMessage: string | null): string | null {
    if (errorMessage === null) {
      return null;
    }
    return this.errorSanitizer.sanitize(errorMessage);
  }

  private mapRunStatus(value: string): RunStatus {
    if (value === "running" || value === "success" || value === "partial" || value === "failed") {
      return value;
    }
    throw new Error("Run row has an unknown status.");
  }

  private mapTrigger(value: string): RunTrigger {
    if (value === "scheduled" || value === "manual") {
      return value;
    }
    throw new Error("Run row has an unknown trigger.");
  }

  private mapSourceStatus(value: string): SourceStatus {
    if (value === "ok" || value === "error" || value === "skipped") {
      return value;
    }
    throw new Error("Source status row has an unknown status.");
  }

  private toId(value: number | bigint): number {
    if (typeof value === "bigint") {
      return Number(value);
    }
    return value;
  }
}
