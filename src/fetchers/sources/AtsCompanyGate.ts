import { AtsType, Company, CompanyFlags, CompanyRepository } from "../../db/repositories/CompanyRepository";

export class AtsCompanyGate {
  public constructor(private readonly companies: CompanyRepository) {}

  public save(name: string, atsType: AtsType, boardSlug: string | null): "ok" | "blocked" {
    const existing: Company | null = this.companies.findByName(name);
    const blocked: boolean = existing !== null && existing.isBlocked;
    const flags: CompanyFlags = {
      isGcc: existing === null ? false : existing.isGcc,
      isPreferred: existing === null ? false : existing.isPreferred,
      isBlocked: blocked,
      atsType: atsType,
      boardSlug: boardSlug,
    };
    const storedName: string = existing === null ? name : existing.name;
    this.companies.upsertCompany(storedName, flags);
    if (blocked) {
      return "blocked";
    }
    return "ok";
  }
}
