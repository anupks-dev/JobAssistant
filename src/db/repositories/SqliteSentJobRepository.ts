import Database from "better-sqlite3";
import { SentJobRow } from "../rows/TableRows";
import { SentJobRecord, SentJobRepository, SentSection } from "./SentJobRepository";

interface PresentRow {
  present: number;
}

export class SqliteSentJobRepository implements SentJobRepository {
  public constructor(private readonly connection: Database.Database) {}

  public recordSent(
    jobId: number,
    dedupeKey: string,
    runId: number,
    rank: number,
    score: number,
    section: SentSection,
  ): void {
    const sentAt: string = new Date().toISOString();
    const statement: Database.Statement<[number, string, number, string, number, number, string], unknown> =
      this.connection.prepare<[number, string, number, string, number, number, string], unknown>(
        "INSERT INTO sent_jobs (job_id, dedupe_key, run_id, sent_at, rank, score, section) VALUES (?, ?, ?, ?, ?, ?, ?)",
      );
    try {
      statement.run(jobId, dedupeKey, runId, sentAt, rank, score, section);
    } catch (error: unknown) {
      if (this.isUniqueConstraint(error)) {
        throw new Error("Job was already recorded as sent.");
      }
      throw error;
    }
  }

  public hasBeenSent(dedupeKey: string): boolean {
    const statement: Database.Statement<[string], PresentRow> = this.connection.prepare<[string], PresentRow>(
      "SELECT 1 AS present FROM sent_jobs WHERE dedupe_key = ? LIMIT 1",
    );
    const row: PresentRow | undefined = statement.get(dedupeKey);
    return row !== undefined;
  }

  public listSentSince(sinceIso: string): SentJobRecord[] {
    const statement: Database.Statement<[string], SentJobRow> = this.connection.prepare<[string], SentJobRow>(
      "SELECT * FROM sent_jobs WHERE sent_at >= ? ORDER BY sent_at ASC",
    );
    const rows: SentJobRow[] = statement.all(sinceIso);
    const records: SentJobRecord[] = [];
    for (let index: number = 0; index < rows.length; index++) {
      records.push(this.mapSentJobRow(rows[index]));
    }
    return records;
  }

  private mapSentJobRow(row: SentJobRow): SentJobRecord {
    const record: SentJobRecord = {
      id: row.id,
      jobId: row.job_id,
      dedupeKey: row.dedupe_key,
      runId: row.run_id,
      sentAt: row.sent_at,
      rank: row.rank,
      score: row.score,
      section: this.mapSection(row.section),
    };
    return record;
  }

  private mapSection(value: string): SentSection {
    if (value === "top" || value === "extra") {
      return value;
    }
    throw new Error("Sent job row has an unknown section.");
  }

  private isUniqueConstraint(error: unknown): boolean {
    if (!(error instanceof Database.SqliteError)) {
      return false;
    }
    return error.code === "SQLITE_CONSTRAINT_UNIQUE";
  }
}
