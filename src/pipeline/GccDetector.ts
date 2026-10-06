import { Company } from "../db/repositories/CompanyRepository";
import { PhraseMatcher } from "./PhraseMatcher";

const DESCRIPTION_LIMIT: number = 2000;

export class GccDetector {
  public constructor(private readonly phrases: PhraseMatcher) {}

  public isGcc(companyName: string, description: string, seedCompanies: string[], keywords: string[], companies: Company[]): boolean {
    if (this.seedMatch(companyName, seedCompanies)) {
      return true;
    }
    if (this.flaggedGcc(companyName, companies)) {
      return true;
    }
    return this.keywordMatch(companyName, description, keywords);
  }

  private seedMatch(companyName: string, seedCompanies: string[]): boolean {
    for (let index: number = 0; index < seedCompanies.length; index++) {
      if (this.phrases.containsPhrase(companyName, seedCompanies[index])) {
        return true;
      }
    }
    const normalizedName: string = this.phrases.normalizeCompany(companyName);
    for (let index: number = 0; index < seedCompanies.length; index++) {
      if (this.phrases.normalizeCompany(seedCompanies[index]) === normalizedName) {
        return true;
      }
    }
    return false;
  }

  private flaggedGcc(companyName: string, companies: Company[]): boolean {
    const normalizedName: string = this.phrases.normalizeCompany(companyName);
    for (let index: number = 0; index < companies.length; index++) {
      const company: Company = companies[index];
      if (!company.isGcc) {
        continue;
      }
      if (this.phrases.normalizeCompany(company.name) === normalizedName) {
        return true;
      }
    }
    return false;
  }

  private keywordMatch(companyName: string, description: string, keywords: string[]): boolean {
    const excerpt: string = description.slice(0, DESCRIPTION_LIMIT);
    for (let index: number = 0; index < keywords.length; index++) {
      const keyword: string = keywords[index];
      if (this.phrases.normalize(keyword) === "gcc") {
        if (this.phrases.containsGccToken(companyName) || this.phrases.containsGccToken(excerpt)) {
          return true;
        }
        continue;
      }
      if (this.phrases.containsPhrase(companyName, keyword) || this.phrases.containsPhrase(excerpt, keyword)) {
        return true;
      }
    }
    return false;
  }
}
