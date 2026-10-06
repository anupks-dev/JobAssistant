import { Migration } from "./Migration";

// Version 1 is the full baseline. Later changes get a new version instead of editing this one.
export class InitialSchemaMigration implements Migration {
  public getVersion(): number {
    return 1;
  }

  public getStatements(): string[] {
    const statements: string[] = [];
    statements.push(
      "CREATE TABLE jobs ("
      + " id INTEGER PRIMARY KEY AUTOINCREMENT,"
      + " source TEXT NOT NULL,"
      + " external_id TEXT NOT NULL,"
      + " title TEXT NOT NULL,"
      + " company TEXT NOT NULL,"
      + " location TEXT NOT NULL,"
      + " remote_type TEXT NOT NULL CHECK (remote_type IN ('remote', 'hybrid', 'onsite', 'unknown')),"
      + " salary_min REAL,"
      + " salary_max REAL,"
      + " currency TEXT,"
      + " salary_known INTEGER NOT NULL CHECK (salary_known IN (0, 1)),"
      + " salary_is_estimated INTEGER NOT NULL CHECK (salary_is_estimated IN (0, 1)),"
      + " url TEXT NOT NULL,"
      + " posted_at TEXT,"
      + " fetched_at TEXT NOT NULL,"
      + " description TEXT NOT NULL,"
      + " description_is_snippet INTEGER NOT NULL CHECK (description_is_snippet IN (0, 1)),"
      + " dedupe_key TEXT NOT NULL,"
      + " status TEXT NOT NULL CHECK (status IN ('new', 'rejected', 'shortlisted', 'scored', 'sent')),"
      + " rejection_reason TEXT,"
      + " score INTEGER CHECK (score IS NULL OR (score >= 0 AND score <= 100)),"
      + " score_reason TEXT,"
      + " UNIQUE (source, external_id)"
      + ")",
    );
    statements.push("CREATE INDEX idx_jobs_dedupe_key ON jobs (dedupe_key)");
    statements.push("CREATE INDEX idx_jobs_status ON jobs (status)");
    statements.push("CREATE INDEX idx_jobs_posted_at ON jobs (posted_at)");
    statements.push(
      "CREATE TABLE runs ("
      + " id INTEGER PRIMARY KEY AUTOINCREMENT,"
      + " started_at TEXT NOT NULL,"
      + " finished_at TEXT,"
      + " status TEXT NOT NULL CHECK (status IN ('running', 'success', 'partial', 'failed')),"
      + " trigger TEXT NOT NULL CHECK (trigger IN ('scheduled', 'manual')),"
      + " fetched_count INTEGER NOT NULL DEFAULT 0,"
      + " filtered_count INTEGER NOT NULL DEFAULT 0,"
      + " shortlisted_count INTEGER NOT NULL DEFAULT 0,"
      + " sent_count INTEGER NOT NULL DEFAULT 0,"
      + " notes TEXT"
      + ")",
    );
    statements.push(
      "CREATE TABLE sent_jobs ("
      + " id INTEGER PRIMARY KEY AUTOINCREMENT,"
      + " job_id INTEGER NOT NULL UNIQUE REFERENCES jobs (id),"
      + " dedupe_key TEXT NOT NULL,"
      + " run_id INTEGER NOT NULL REFERENCES runs (id),"
      + " sent_at TEXT NOT NULL,"
      + " rank INTEGER NOT NULL,"
      + " score INTEGER NOT NULL,"
      + " section TEXT NOT NULL CHECK (section IN ('top', 'extra'))"
      + ")",
    );
    statements.push("CREATE INDEX idx_sent_jobs_dedupe_key ON sent_jobs (dedupe_key)");
    statements.push(
      "CREATE TABLE companies ("
      + " id INTEGER PRIMARY KEY AUTOINCREMENT,"
      + " name TEXT NOT NULL,"
      + " name_key TEXT NOT NULL UNIQUE,"
      + " is_gcc INTEGER NOT NULL CHECK (is_gcc IN (0, 1)),"
      + " is_preferred INTEGER NOT NULL CHECK (is_preferred IN (0, 1)),"
      + " is_blocked INTEGER NOT NULL CHECK (is_blocked IN (0, 1)),"
      + " ats_type TEXT CHECK (ats_type IS NULL OR ats_type IN ('greenhouse', 'lever', 'ashby', 'none')),"
      + " board_slug TEXT,"
      + " first_seen_at TEXT NOT NULL"
      + ")",
    );
    statements.push(
      "CREATE TABLE run_source_status ("
      + " id INTEGER PRIMARY KEY AUTOINCREMENT,"
      + " run_id INTEGER NOT NULL REFERENCES runs (id),"
      + " source TEXT NOT NULL,"
      + " status TEXT NOT NULL CHECK (status IN ('ok', 'error', 'skipped')),"
      + " job_count INTEGER NOT NULL,"
      + " error_message TEXT,"
      + " duration_ms INTEGER NOT NULL"
      + ")",
    );
    statements.push(
      "CREATE TABLE config_history ("
      + " id INTEGER PRIMARY KEY AUTOINCREMENT,"
      + " changed_at TEXT NOT NULL,"
      + " changed_by TEXT NOT NULL CHECK (changed_by IN ('telegram', 'file')),"
      + " \"key\" TEXT NOT NULL,"
      + " old_value TEXT,"
      + " new_value TEXT NOT NULL"
      + ")",
    );
    statements.push(
      "CREATE TABLE app_state ("
      + " \"key\" TEXT PRIMARY KEY,"
      + " value TEXT NOT NULL,"
      + " updated_at TEXT NOT NULL"
      + ")",
    );
    statements.push(
      "CREATE TABLE api_usage ("
      + " source TEXT NOT NULL,"
      + " day TEXT NOT NULL,"
      + " call_count INTEGER NOT NULL,"
      + " PRIMARY KEY (source, day)"
      + ")",
    );
    return statements;
  }
}
