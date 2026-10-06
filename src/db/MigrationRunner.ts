import Database from "better-sqlite3";
import { Migration } from "./migrations/Migration";
import { SchemaMigrationRow } from "./rows/TableRows";

interface SchemaVersionRow {
  version: number | null;
}

// Applies numbered SQL files once. The version table makes a second startup a no-op.
export class MigrationRunner {
  public constructor(
    private readonly connection: Database.Database,
    private readonly migrations: Migration[],
  ) {}

  public applyPending(): void {
    this.ensureMigrationsTable();
    const ordered: Migration[] = this.orderedMigrations();
    for (let index: number = 0; index < ordered.length; index++) {
      const migration: Migration = ordered[index];
      if (!this.isApplied(migration.getVersion())) {
        this.applyOne(migration);
      }
    }
  }

  public getSchemaVersion(): number {
    this.ensureMigrationsTable();
    const statement: Database.Statement<[], SchemaVersionRow> = this.connection.prepare<[], SchemaVersionRow>(
      "SELECT MAX(version) AS version FROM schema_migrations",
    );
    const row: SchemaVersionRow | undefined = statement.get();
    if (row === undefined || row.version === null) {
      return 0;
    }
    return row.version;
  }

  private ensureMigrationsTable(): void {
    this.connection.exec(
      "CREATE TABLE IF NOT EXISTS schema_migrations ("
      + " version INTEGER PRIMARY KEY,"
      + " applied_at TEXT NOT NULL"
      + ")",
    );
  }

  private orderedMigrations(): Migration[] {
    const ordered: Migration[] = [];
    for (let index: number = 0; index < this.migrations.length; index++) {
      ordered.push(this.migrations[index]);
    }
    ordered.sort((left: Migration, right: Migration): number => {
      return left.getVersion() - right.getVersion();
    });
    return ordered;
  }

  private isApplied(version: number): boolean {
    const statement: Database.Statement<[number], SchemaMigrationRow> = this.connection.prepare<
      [number],
      SchemaMigrationRow
    >("SELECT version, applied_at FROM schema_migrations WHERE version = ?");
    const row: SchemaMigrationRow | undefined = statement.get(version);
    return row !== undefined;
  }

  private applyOne(migration: Migration): void {
    const statements: string[] = migration.getStatements();
    const appliedAt: string = new Date().toISOString();
    const apply: () => void = this.connection.transaction((): void => {
      for (let index: number = 0; index < statements.length; index++) {
        this.connection.exec(statements[index]);
      }
      const insert: Database.Statement<[number, string], unknown> = this.connection.prepare<
        [number, string],
        unknown
      >("INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)");
      insert.run(migration.getVersion(), appliedAt);
    });
    apply();
  }
}
