export type ConfigActor = "telegram" | "file";

export interface ConfigHistoryEntry {
  changedAt: string;
  changedBy: ConfigActor;
  key: string;
  oldValue: string | null;
  newValue: string;
}

export interface StoredConfigHistoryEntry extends ConfigHistoryEntry {
  id: number;
}

export interface ConfigHistoryRepository {
  record(entry: ConfigHistoryEntry): void;
  listRecent(limit: number): StoredConfigHistoryEntry[];
}
