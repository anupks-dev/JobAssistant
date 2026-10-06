export class JsonFields {
  public static record(value: unknown): Record<string, unknown> | null {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      return null;
    }
    return value as Record<string, unknown>;
  }

  public static string(record: Record<string, unknown>, key: string): string | null {
    const value: unknown = record[key];
    if (typeof value !== "string") {
      return null;
    }
    return value;
  }

  public static number(record: Record<string, unknown>, key: string): number | null {
    const value: unknown = record[key];
    if (typeof value !== "number" || !Number.isFinite(value)) {
      return null;
    }
    return value;
  }

  public static boolean(record: Record<string, unknown>, key: string): boolean | null {
    const value: unknown = record[key];
    if (typeof value !== "boolean") {
      return null;
    }
    return value;
  }

  public static stringList(record: Record<string, unknown>, key: string): string[] {
    const value: unknown = record[key];
    if (!Array.isArray(value)) {
      return [];
    }
    const items: string[] = [];
    for (let index: number = 0; index < value.length; index++) {
      const item: unknown = value[index];
      if (typeof item === "string") {
        items.push(item);
      }
    }
    return items;
  }

  public static list(record: Record<string, unknown>, key: string): unknown[] {
    const value: unknown = record[key];
    if (!Array.isArray(value)) {
      return [];
    }
    return value;
  }

  // Live feeds mix numeric ids and numeric strings. Both stay stable external ids.
  public static id(record: Record<string, unknown>, key: string): string | null {
    const value: unknown = record[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value);
    }
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
    return null;
  }
}
