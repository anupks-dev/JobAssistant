import { Company } from "../db/repositories/CompanyRepository";
import { GccDetector } from "../pipeline/GccDetector";
import { PhraseMatcher } from "../pipeline/PhraseMatcher";

export class CompanyScores {
  public static readonly preferred: number = 100;
  public static readonly gccSeed: number = 70;
  public static readonly other: number = 40;
}

export interface CompanyScoringLists {
  preferredNames: string[];
  gccSeedNames: string[];
  gccKeywords: string[];
  knownCompanies: Company[];
}

export class CompanyScorer {
  public constructor(
    private readonly phrases: PhraseMatcher,
    private readonly gccDetector: GccDetector,
    private readonly lists: CompanyScoringLists,
  ) {}

  public score(companyName: string): number {
    if (this.isPreferred(companyName)) {
      return CompanyScores.preferred;
    }
    if (this.isGccSeed(companyName)) {
      return CompanyScores.gccSeed;
    }
    return CompanyScores.other;
  }

  public isPreferred(companyName: string): boolean {
    const normalized: string = this.phrases.normalizeCompany(companyName);
    for (let index: number = 0; index < this.lists.preferredNames.length; index++) {
      if (this.phrases.normalizeCompany(this.lists.preferredNames[index]) === normalized) {
        return true;
      }
    }
    return false;
  }

  // Company name only: a job description must not be able to promote its own company.
  private isGccSeed(companyName: string): boolean {
    return this.gccDetector.isGcc(
      companyName,
      "",
      this.lists.gccSeedNames,
      this.lists.gccKeywords,
      this.lists.knownCompanies,
    );
  }
}
