import Database from "better-sqlite3";
import { CompanyRow } from "../rows/TableRows";
import { AtsType, Company, CompanyFlags, CompanyRepository } from "./CompanyRepository";

export class SqliteCompanyRepository implements CompanyRepository {
  public constructor(private readonly connection: Database.Database) {}

  public upsertCompany(name: string, flags?: CompanyFlags): Company {
    const save: () => Company = this.connection.transaction((): Company => {
      return this.upsertCompanyNow(name, flags);
    });
    return save();
  }

  public findByName(name: string): Company | null {
    const nameKey: string = this.toNameKey(name);
    const statement: Database.Statement<[string], CompanyRow> = this.connection.prepare<[string], CompanyRow>(
      "SELECT * FROM companies WHERE name_key = ?",
    );
    const row: CompanyRow | undefined = statement.get(nameKey);
    if (row === undefined) {
      return null;
    }
    return this.mapCompanyRow(row);
  }

  public findAll(): Company[] {
    const statement: Database.Statement<[], CompanyRow> = this.connection.prepare<[], CompanyRow>(
      "SELECT * FROM companies ORDER BY id ASC",
    );
    const rows: CompanyRow[] = statement.all();
    const companies: Company[] = [];
    for (let index: number = 0; index < rows.length; index++) {
      companies.push(this.mapCompanyRow(rows[index]));
    }
    return companies;
  }

  public setFlags(name: string, flags: CompanyFlags): void {
    const nameKey: string = this.toNameKey(name);
    const statement: Database.Statement<[number, number, number, string | null, string | null, string], unknown> =
      this.connection.prepare<[number, number, number, string | null, string | null, string], unknown>(
        "UPDATE companies SET is_gcc = ?, is_preferred = ?, is_blocked = ?, ats_type = ?, board_slug = ? WHERE name_key = ?",
      );
    const outcome: Database.RunResult = statement.run(
      this.toInteger(flags.isGcc),
      this.toInteger(flags.isPreferred),
      this.toInteger(flags.isBlocked),
      flags.atsType,
      flags.boardSlug,
      nameKey,
    );
    if (outcome.changes === 0) {
      throw new Error("Company not found.");
    }
  }

  private upsertCompanyNow(name: string, flags: CompanyFlags | undefined): Company {
    const existing: Company | null = this.findByName(name);
    if (existing === null) {
      const storedFlags: CompanyFlags = flags === undefined ? this.defaultFlags() : flags;
      this.insertCompany(name, storedFlags);
    } else if (flags !== undefined) {
      this.setFlags(name, flags);
      this.updateName(name);
    } else {
      this.updateName(name);
    }
    const saved: Company | null = this.findByName(name);
    if (saved === null) {
      throw new Error("Company could not be saved.");
    }
    return saved;
  }

  private insertCompany(name: string, flags: CompanyFlags): void {
    const statement: Database.Statement<
      [string, string, number, number, number, string | null, string | null, string],
      unknown
    > = this.connection.prepare<
      [string, string, number, number, number, string | null, string | null, string],
      unknown
    >(
      "INSERT INTO companies ("
      + " name, name_key, is_gcc, is_preferred, is_blocked, ats_type, board_slug, first_seen_at"
      + ") VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    );
    const firstSeenAt: string = new Date().toISOString();
    statement.run(
      name,
      this.toNameKey(name),
      this.toInteger(flags.isGcc),
      this.toInteger(flags.isPreferred),
      this.toInteger(flags.isBlocked),
      flags.atsType,
      flags.boardSlug,
      firstSeenAt,
    );
  }

  private updateName(name: string): void {
    const statement: Database.Statement<[string, string], unknown> = this.connection.prepare<[string, string], unknown>(
      "UPDATE companies SET name = ? WHERE name_key = ?",
    );
    statement.run(name, this.toNameKey(name));
  }

  private mapCompanyRow(row: CompanyRow): Company {
    const company: Company = {
      id: row.id,
      name: row.name,
      nameKey: row.name_key,
      isGcc: this.toBoolean(row.is_gcc),
      isPreferred: this.toBoolean(row.is_preferred),
      isBlocked: this.toBoolean(row.is_blocked),
      atsType: this.mapAtsType(row.ats_type),
      boardSlug: row.board_slug,
      firstSeenAt: row.first_seen_at,
    };
    return company;
  }

  private mapAtsType(value: string | null): AtsType | null {
    if (value === null) {
      return null;
    }
    if (value === "greenhouse" || value === "lever" || value === "ashby" || value === "none") {
      return value;
    }
    throw new Error("Company row has an unknown ATS type.");
  }

  private defaultFlags(): CompanyFlags {
    const flags: CompanyFlags = {
      isGcc: false,
      isPreferred: false,
      isBlocked: false,
      atsType: null,
      boardSlug: null,
    };
    return flags;
  }

  private toNameKey(name: string): string {
    return name.trim().toLowerCase();
  }

  private toInteger(value: boolean): number {
    if (value) {
      return 1;
    }
    return 0;
  }

  private toBoolean(value: number): boolean {
    return value === 1;
  }
}
