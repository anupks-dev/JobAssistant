import Database from "better-sqlite3";
import { chmodSync, existsSync, mkdirSync } from "fs";
import { dirname } from "path";
import { FilterColumnsMigration } from "./migrations/FilterColumnsMigration";
import { InitialSchemaMigration } from "./migrations/InitialSchemaMigration";
import { Migration } from "./migrations/Migration";
import { MigrationRunner } from "./MigrationRunner";

// Opens SQLite, turns on the safety pragmas, and applies migrations before any repository runs.
export class SqliteDatabase {
  private readonly connection: Database.Database;
  private readonly migrationRunner: MigrationRunner;

  public constructor(databasePath: string) {
    this.prepareDirectory(databasePath);
    this.connection = new Database(databasePath);
    this.applyPragmas();
    this.restrictFileMode(databasePath);
    const migrations: Migration[] = [];
    migrations.push(new InitialSchemaMigration());
    migrations.push(new FilterColumnsMigration());
    this.migrationRunner = new MigrationRunner(this.connection, migrations);
    this.migrationRunner.applyPending();
  }

  public getConnection(): Database.Database {
    return this.connection;
  }

  public migrate(): void {
    this.migrationRunner.applyPending();
  }

  public getSchemaVersion(): number {
    return this.migrationRunner.getSchemaVersion();
  }

  public close(): void {
    this.connection.close();
  }

  private prepareDirectory(databasePath: string): void {
    if (databasePath === ":memory:") {
      return;
    }
    const directoryPath: string = dirname(databasePath);
    mkdirSync(directoryPath, { recursive: true });
  }

  private applyPragmas(): void {
    this.connection.pragma("journal_mode = WAL");
    this.connection.pragma("foreign_keys = ON");
    this.connection.pragma("busy_timeout = 5000");
  }

  // WAL mode also writes sidecar files. Those pages can hold job text, so they stay private too.
  private restrictFileMode(databasePath: string): void {
    if (databasePath === ":memory:") {
      return;
    }
    chmodSync(databasePath, 0o600);
    const walPath: string = databasePath + "-wal";
    const shmPath: string = databasePath + "-shm";
    if (existsSync(walPath)) {
      chmodSync(walPath, 0o600);
    }
    if (existsSync(shmPath)) {
      chmodSync(shmPath, 0o600);
    }
  }
}
