import Database from "better-sqlite3";
import { AppStateRow } from "../rows/TableRows";
import { AppStateRepository } from "./AppStateRepository";

export class SqliteAppStateRepository implements AppStateRepository {
  public constructor(private readonly connection: Database.Database) {}

  public get(key: string): string | null {
    const statement: Database.Statement<[string], AppStateRow> = this.connection.prepare<[string], AppStateRow>(
      "SELECT \"key\", value, updated_at FROM app_state WHERE \"key\" = ?",
    );
    const row: AppStateRow | undefined = statement.get(key);
    if (row === undefined) {
      return null;
    }
    return row.value;
  }

  public set(key: string, value: string): void {
    const updatedAt: string = new Date().toISOString();
    const statement: Database.Statement<[string, string, string], unknown> = this.connection.prepare<
      [string, string, string],
      unknown
    >(
      "INSERT INTO app_state (\"key\", value, updated_at) VALUES (?, ?, ?) "
      + "ON CONFLICT (\"key\") DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
    );
    statement.run(key, value, updatedAt);
  }
}
