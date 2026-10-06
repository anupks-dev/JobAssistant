import Database from "better-sqlite3";
import { ApiUsageRepository } from "./ApiUsageRepository";

interface CountRow {
  total: number;
}

interface CallCountRow {
  call_count: number;
}

export class SqliteApiUsageRepository implements ApiUsageRepository {
  public constructor(private readonly connection: Database.Database) {}

  public increment(source: string, dayIso: string): void {
    this.assertDay(dayIso);
    const statement: Database.Statement<[string, string], unknown> = this.connection.prepare<[string, string], unknown>(
      "INSERT INTO api_usage (source, day, call_count) VALUES (?, ?, 1) "
      + "ON CONFLICT (source, day) DO UPDATE SET call_count = call_count + 1",
    );
    statement.run(source, dayIso);
  }

  public getDayCount(source: string, dayIso: string): number {
    this.assertDay(dayIso);
    const statement: Database.Statement<[string, string], CallCountRow> = this.connection.prepare<
      [string, string],
      CallCountRow
    >("SELECT call_count FROM api_usage WHERE source = ? AND day = ?");
    const row: CallCountRow | undefined = statement.get(source, dayIso);
    if (row === undefined) {
      return 0;
    }
    return row.call_count;
  }

  public getMonthCount(source: string, monthPrefix: string): number {
    const startDay: string = this.monthStart(monthPrefix);
    const endDay: string = this.nextMonthStart(monthPrefix);
    // The bounds are parameters so the month text never becomes part of the SQL.
    const statement: Database.Statement<[string, string, string], CountRow> = this.connection.prepare<
      [string, string, string],
      CountRow
    >("SELECT COALESCE(SUM(call_count), 0) AS total FROM api_usage WHERE source = ? AND day >= ? AND day < ?");
    const row: CountRow | undefined = statement.get(source, startDay, endDay);
    if (row === undefined) {
      return 0;
    }
    return row.total;
  }

  private assertDay(dayIso: string): void {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dayIso)) {
      throw new Error("Day must look like YYYY-MM-DD.");
    }
  }

  private monthStart(monthPrefix: string): string {
    this.assertMonth(monthPrefix);
    return monthPrefix + "-01";
  }

  private nextMonthStart(monthPrefix: string): string {
    this.assertMonth(monthPrefix);
    const parts: string[] = monthPrefix.split("-");
    const year: number = Number(parts[0]);
    const month: number = Number(parts[1]);
    let nextYear: number = year;
    let nextMonth: number = month + 1;
    if (nextMonth === 13) {
      nextMonth = 1;
      nextYear = year + 1;
    }
    let monthText: string = String(nextMonth);
    if (nextMonth < 10) {
      monthText = "0" + monthText;
    }
    return String(nextYear) + "-" + monthText + "-01";
  }

  private assertMonth(monthPrefix: string): void {
    if (!/^\d{4}-\d{2}$/.test(monthPrefix)) {
      throw new Error("Month prefix must look like YYYY-MM.");
    }
    const parts: string[] = monthPrefix.split("-");
    const month: number = Number(parts[1]);
    if (month < 1 || month > 12) {
      throw new Error("Month prefix must look like YYYY-MM.");
    }
  }
}
