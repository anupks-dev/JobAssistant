export type AtsType = "greenhouse" | "lever" | "ashby" | "none";

export interface CompanyFlags {
  isGcc: boolean;
  isPreferred: boolean;
  isBlocked: boolean;
  atsType: AtsType | null;
  boardSlug: string | null;
}

export interface Company {
  id: number;
  name: string;
  nameKey: string;
  isGcc: boolean;
  isPreferred: boolean;
  isBlocked: boolean;
  atsType: AtsType | null;
  boardSlug: string | null;
  firstSeenAt: string;
}

export interface CompanyRepository {
  upsertCompany(name: string, flags?: CompanyFlags): Company;
  findByName(name: string): Company | null;
  findAll(): Company[];
  setFlags(name: string, flags: CompanyFlags): void;
}
