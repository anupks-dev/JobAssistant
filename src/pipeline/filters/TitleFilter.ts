import { StoredJob } from "../../db/repositories/JobRepository";
import { FilterContext } from "../FilterContext";
import { FilterDecision, JobFilter } from "../JobFilter";
import { PhraseMatcher } from "../PhraseMatcher";
import { TitlePrimarySegment } from "../TitlePrimarySegment";

export class TitleFilter implements JobFilter {
  public constructor(
    private readonly phrases: PhraseMatcher,
    private readonly primarySegment: TitlePrimarySegment,
  ) {}

  public getName(): string {
    return "TitleFilter";
  }

  public evaluate(job: StoredJob, context: FilterContext): FilterDecision {
    const title: string = job.title;
    if (this.matchesAny(title, context.config.titleRules.excludeKeywords)) {
      return this.reject("title_excluded");
    }
    if (this.matchesAny(title, context.config.excludeRoles)) {
      return this.reject("title_excluded");
    }
    if (this.matchesAny(title, context.config.titleRules.excludeAnywhereWords)) {
      return this.reject("title_excluded");
    }
    const segment: string = this.primarySegment.extract(title);
    const allowed: string = this.phrases.removePhrases(segment, context.config.titleRules.allowPhrases);
    if (this.matchesAny(allowed, context.config.titleRules.excludeFunctionWords)) {
      return this.reject("title_excluded");
    }
    const includePhrases: string[] = this.includePhrases(context);
    if (!this.matchesAny(title, includePhrases)) {
      return this.reject("title_no_match");
    }
    if (this.matchesAny(title, context.config.titleRules.excludeEmploymentWords)) {
      return this.reject("employment_type");
    }
    const passed: FilterDecision = { passed: true };
    return passed;
  }

  private includePhrases(context: FilterContext): string[] {
    const phrases: string[] = [];
    const keywords: string[] = context.config.titleRules.includeKeywords;
    for (let index: number = 0; index < keywords.length; index++) {
      phrases.push(keywords[index]);
    }
    const roles: string[] = context.config.roles;
    for (let index: number = 0; index < roles.length; index++) {
      const phrase: string = this.rolePhrase(roles[index]);
      if (phrase.length > 0) {
        phrases.push(phrase);
      }
    }
    return phrases;
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

  private matchesAny(title: string, phrases: string[]): boolean {
    for (let index: number = 0; index < phrases.length; index++) {
      if (this.phrases.containsPhrase(title, phrases[index])) {
        return true;
      }
    }
    return false;
  }

  private reject(reasonCode: string): FilterDecision {
    const rejected: FilterDecision = { passed: false, reasonCode: reasonCode };
    return rejected;
  }
}
