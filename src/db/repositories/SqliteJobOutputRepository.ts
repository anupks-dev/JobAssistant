import Database from "better-sqlite3";
import { JobOutputRow } from "../rows/TableRows";
import { JobOutput, JobOutputInput, JobOutputRepository } from "./JobOutputRepository";

// One output row per job. Saving again replaces the text so a regenerated letter never duplicates.
export class SqliteJobOutputRepository implements JobOutputRepository {
  public constructor(private readonly connection: Database.Database) {}

  public save(input: JobOutputInput): void {
    const statement: Database.Statement<[number, number | null, string | null, string | null, string, string], unknown> =
      this.connection.prepare<[number, number | null, string | null, string | null, string, string], unknown>(
        "INSERT INTO job_outputs (job_id, run_id, cover_letter, resume_tweaks, prompt_versions, created_at)"
        + " VALUES (?, ?, ?, ?, ?, ?)"
        + " ON CONFLICT (job_id) DO UPDATE SET run_id = excluded.run_id, cover_letter = excluded.cover_letter,"
        + " resume_tweaks = excluded.resume_tweaks, prompt_versions = excluded.prompt_versions,"
        + " created_at = excluded.created_at",
      );
    statement.run(
      input.jobId,
      input.runId,
      input.coverLetter,
      input.resumeTweaks,
      input.promptVersions,
      input.createdAtIso,
    );
  }

  public findByJobId(jobId: number): JobOutput | null {
    const statement: Database.Statement<[number], JobOutputRow> = this.connection.prepare<[number], JobOutputRow>(
      "SELECT * FROM job_outputs WHERE job_id = ?",
    );
    const row: JobOutputRow | undefined = statement.get(jobId);
    if (row === undefined) {
      return null;
    }
    const output: JobOutput = {
      id: row.id,
      jobId: row.job_id,
      runId: row.run_id,
      coverLetter: row.cover_letter,
      resumeTweaks: row.resume_tweaks,
      promptVersions: row.prompt_versions,
      createdAt: new Date(row.created_at),
    };
    return output;
  }
}
