import { Migration } from "./Migration";

// Version 3 stores score details on the job and adds the table that Stage 4 fills with letters.
export class ScoringMigration implements Migration {
  public getVersion(): number {
    return 3;
  }

  public getStatements(): string[] {
    const statements: string[] = [];
    statements.push("ALTER TABLE jobs ADD COLUMN score_details TEXT");
    statements.push(
      "CREATE TABLE job_outputs ("
      + " id INTEGER PRIMARY KEY AUTOINCREMENT,"
      + " job_id INTEGER NOT NULL UNIQUE REFERENCES jobs (id),"
      + " run_id INTEGER REFERENCES runs (id),"
      + " cover_letter TEXT,"
      + " resume_tweaks TEXT,"
      + " prompt_versions TEXT NOT NULL,"
      + " created_at TEXT NOT NULL"
      + ")",
    );
    return statements;
  }
}
