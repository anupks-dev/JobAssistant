import { StoredJob } from "../db/repositories/JobRepository";
import { FilterContext } from "./FilterContext";
import { PhraseMatcher } from "./PhraseMatcher";

export interface PreScoreInput {
  job: StoredJob;
  regionOpen: boolean;
  isBangaloreGcc: boolean;
  salaryUsdMax: number | null;
}

// Cheap points used only to choose which jobs stay when the shortlist is over the cap.
export class PreScorerWeights {
  public static readonly preferredCompany: number = 30;
  public static readonly exactRolePhrase: number = 25;
  public static readonly postedWithinTwoDays: number = 20;
  public static readonly salaryAboveFloor: number = 15;
  public static readonly fullDescription: number = 10;
  public static readonly bangaloreGcc: number = 20;
  public static readonly regionOpen: number = 10;
}

const TWO_DAYS_MS: number = 2 * 24 * 60 * 60 * 1000;

export class PreScorer {
  public constructor(private readonly phrases: PhraseMatcher) {}

  public score(input: PreScoreInput, context: FilterContext): number {
    let total: number = 0;
    if (this.isPreferred(input.job.company, context.preferredCompanyNames)) {
      total = total + PreScorerWeights.preferredCompany;
    }
    if (this.hasExactRole(input.job.title, context)) {
      total = total + PreScorerWeights.exactRolePhrase;
    }
    if (this.isRecent(input.job, context)) {
      total = total + PreScorerWeights.postedWithinTwoDays;
    }
    if (this.salaryAboveFloor(input.salaryUsdMax, context.config.filters.minSalaryUsd)) {
      total = total + PreScorerWeights.salaryAboveFloor;
    }
    if (!input.job.descriptionIsSnippet) {
      total = total + PreScorerWeights.fullDescription;
    }
    if (input.isBangaloreGcc) {
      total = total + PreScorerWeights.bangaloreGcc;
    }
    if (input.regionOpen) {
      total = total + PreScorerWeights.regionOpen;
    }
    return total;
  }

  private isPreferred(companyName: string, preferredNames: string[]): boolean {
    const normalized: string = this.phrases.normalizeCompany(companyName);
    for (let index: number = 0; index < preferredNames.length; index++) {
      if (this.phrases.normalizeCompany(preferredNames[index]) === normalized) {
        return true;
      }
    }
    return false;
  }

  private hasExactRole(title: string, context: FilterContext): boolean {
    const roles: string[] = context.config.roles;
    for (let index: number = 0; index < roles.length; index++) {
      const phrase: string = this.rolePhrase(roles[index]);
      if (phrase.length > 0 && this.phrases.containsPhrase(title, phrase)) {
        return true;
      }
    }
    return false;
  }

  private rolePhrase(role: string): string {
    const normalized: string = this.phrases.normalize(role);
    const parts: string[] = normalized.split(" ");
    const kept: string[] = [];
    for (let index: number = 0; index < parts.length; index++) {
      if (parts[index] === "senior" || parts[index] === "sr") {
        continue;
      }
      kept.push(parts[index]);
    }
    return kept.join(" ");
  }

  private isRecent(job: StoredJob, context: FilterContext): boolean {
    const posted: Date = job.postedAt === null ? job.fetchedAt : job.postedAt;
    const ageMs: number = context.clock.now().getTime() - posted.getTime();
    return ageMs <= TWO_DAYS_MS;
  }

  private salaryAboveFloor(salaryUsdMax: number | null, floor: number): boolean {
    if (salaryUsdMax === null) {
      return false;
    }
    return salaryUsdMax >= floor;
  }
}
