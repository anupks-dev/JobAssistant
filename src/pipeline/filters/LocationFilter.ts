import { StoredJob } from "../../db/repositories/JobRepository";
import { FilterContext } from "../FilterContext";
import { GccDetector } from "../GccDetector";
import { FilterDecision, JobFilter } from "../JobFilter";
import { LocationNormalizer } from "../LocationNormalizer";
import { PhraseMatcher } from "../PhraseMatcher";
import { RegionAssessment, RegionEligibilityClassifier } from "../RegionEligibilityClassifier";

const REMOTE_HINTS: string[] = [
  "remote",
  "work from home",
  "wfh",
  "work from anywhere",
  "fully remote",
  "remote-first",
];

const REMOTE_WORDS: string[] = ["remote", "remotely", "wfh", "work from home", "distributed"];

const DESCRIPTION_LIMIT: number = 1500;

export class LocationFilter implements JobFilter {
  public constructor(
    private readonly normalizer: LocationNormalizer,
    private readonly regions: RegionEligibilityClassifier,
    private readonly gccDetector: GccDetector,
    private readonly phrases: PhraseMatcher,
  ) {}

  public getName(): string {
    return "LocationFilter";
  }

  public evaluate(job: StoredJob, context: FilterContext): FilterDecision {
    const location: string = this.normalizer.normalize(job.location);
    if (this.containsOnsiteCity(location, context.config.locations.onsiteCities)) {
      return this.bangaloreDecision(job, context);
    }
    return this.placeDecision(job, context);
  }

  private bangaloreDecision(job: StoredJob, context: FilterContext): FilterDecision {
    if (this.hasRemoteHint(job)) {
      const remoteIndia: FilterDecision = {
        passed: true,
        notes: "bangalore_remote",
        regionEligibility: "open",
        isBangaloreGcc: false,
      };
      return remoteIndia;
    }
    const gcc: boolean = this.gccDetector.isGcc(
      job.company,
      job.description,
      context.gccSeedCompanies,
      context.config.gcc.keywords,
      context.companies,
    );
    if (context.config.locations.onsiteGccOnly && !gcc) {
      const rejected: FilterDecision = { passed: false, reasonCode: "not_gcc", isBangaloreGcc: false };
      return rejected;
    }
    const passed: FilterDecision = { passed: true, regionEligibility: "unknown", isBangaloreGcc: true };
    return passed;
  }

  private placeDecision(job: StoredJob, context: FilterContext): FilterDecision {
    const assessment: RegionAssessment = this.regions.classify(
      job.location,
      job.description,
      context.config.regionRules.openTerms,
      context.config.regionRules.restrictedTerms,
      context.config.regionRules.genericWords,
    );
    if (assessment.eligibility === "restricted") {
      const reasonCode: string = this.restrictionReason(job, assessment);
      const rejected: FilterDecision = {
        passed: false,
        reasonCode: reasonCode,
        notes: assessment.matchedTerm ?? undefined,
        regionEligibility: "restricted",
        isBangaloreGcc: false,
      };
      return rejected;
    }
    const passed: FilterDecision = {
      passed: true,
      regionEligibility: assessment.eligibility,
      isBangaloreGcc: false,
    };
    return passed;
  }

  private restrictionReason(job: StoredJob, assessment: RegionAssessment): string {
    if (assessment.onsiteWithoutPlace) {
      return "onsite_other_location";
    }
    if (assessment.namedPlace && !this.containsAny(job.location, REMOTE_WORDS) && !this.containsAny(job.title, REMOTE_WORDS)) {
      return "onsite_other_location";
    }
    return "region_restricted";
  }

  private hasRemoteHint(job: StoredJob): boolean {
    const excerpt: string = job.description.slice(0, DESCRIPTION_LIMIT);
    if (this.containsAny(job.title, REMOTE_HINTS)) {
      return true;
    }
    if (this.containsAny(job.location, REMOTE_HINTS)) {
      return true;
    }
    return this.containsAny(excerpt, REMOTE_HINTS);
  }

  private containsAny(text: string, phrases: string[]): boolean {
    for (let index: number = 0; index < phrases.length; index++) {
      if (this.phrases.containsPhrase(text, phrases[index])) {
        return true;
      }
    }
    return false;
  }

  private containsOnsiteCity(location: string, cities: string[]): boolean {
    for (let index: number = 0; index < cities.length; index++) {
      const city: string = this.normalizer.normalize(cities[index]);
      if (city.length > 0 && this.phrases.containsPhrase(location, city)) {
        return true;
      }
    }
    return false;
  }
}
