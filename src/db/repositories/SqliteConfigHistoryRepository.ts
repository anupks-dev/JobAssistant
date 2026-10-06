import Database from "better-sqlite3";
import { ConfigHistoryRow } from "../rows/TableRows";
import {
  ConfigActor,
  ConfigHistoryEntry,
  ConfigHistoryRepository,
  StoredConfigHistoryEntry,
} from "./ConfigHistoryRepository";

export class SqliteConfigHistoryRepository implements ConfigHistoryRepository {
  public constructor(private readonly connection: Database.Database) {}

  public record(entry: ConfigHistoryEntry): void {
    const statement: Database.Statement<[string, string, string, string | null, string], unknown> =
      this.connection.prepare<[string, string, string, string | null, string], unknown>(
        "INSERT INTO config_history (changed_at, changed_by, \"key\", old_value, new_value) VALUES (?, ?, ?, ?, ?)",
      );
    statement.run(entry.changedAt, entry.changedBy, entry.key, entry.oldValue, entry.newValue);
  }

  public listRecent(limit: number): StoredConfigHistoryEntry[] {
    const statement: Database.Statement<[number], ConfigHistoryRow> = this.connection.prepare<[number], ConfigHistoryRow>(
      "SELECT id, changed_at, changed_by, \"key\", old_value, new_value FROM config_history ORDER BY id DESC LIMIT ?",
    );
    const rows: ConfigHistoryRow[] = statement.all(limit);
    const entries: StoredConfigHistoryEntry[] = [];
    for (let index: number = 0; index < rows.length; index++) {
      entries.push(this.mapConfigHistoryRow(rows[index]));
    }
    return entries;
  }

  private mapConfigHistoryRow(row: ConfigHistoryRow): StoredConfigHistoryEntry {
    const entry: StoredConfigHistoryEntry = {
      id: row.id,
      changedAt: row.changed_at,
      changedBy: this.mapActor(row.changed_by),
      key: row.key,
      oldValue: row.old_value,
      newValue: row.new_value,
    };
    return entry;
  }

  private mapActor(value: string): ConfigActor {
    if (value === "telegram" || value === "file") {
      return value;
    }
    throw new Error("Config history row has an unknown actor.");
  }
}
