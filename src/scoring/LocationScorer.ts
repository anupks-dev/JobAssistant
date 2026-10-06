import { StoredJob } from "../db/repositories/JobRepository";

export class LocationScores {
  public static readonly openOrBangaloreRemote: number = 100;
  public static readonly bangaloreGccOnsite: number = 90;
  public static readonly unknownEligibility: number = 60;
}

// The filter already decided eligibility; this only turns that decision into a number.
export class LocationScorer {
  public score(job: StoredJob): number {
    if (job.regionEligibility === "open") {
      return LocationScores.openOrBangaloreRemote;
    }
    if (job.isBangaloreGcc) {
      return LocationScores.bangaloreGccOnsite;
    }
    return LocationScores.unknownEligibility;
  }
}
