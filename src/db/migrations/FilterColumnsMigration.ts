import { Migration } from "./Migration";

// Nullable filter columns so rows stored before this migration stay valid.
export class FilterColumnsMigration implements Migration {
  public getVersion(): number {
    return 2;
  }

  public getStatements(): string[] {
    const statements: string[] = [];
    statements.push("ALTER TABLE jobs ADD COLUMN region_eligibility TEXT");
    statements.push("ALTER TABLE jobs ADD COLUMN is_bangalore_gcc INTEGER NOT NULL DEFAULT 0");
    statements.push("ALTER TABLE jobs ADD COLUMN salary_usd_min REAL");
    statements.push("ALTER TABLE jobs ADD COLUMN salary_usd_max REAL");
    statements.push("ALTER TABLE jobs ADD COLUMN filter_notes TEXT");
    return statements;
  }
}
