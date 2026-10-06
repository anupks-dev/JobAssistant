import { StoredJob } from "../db/repositories/JobRepository";

export class SalaryScores {
  public static readonly atOrAboveFloor: number = 100;
  public static readonly unknownOrEstimated: number = 50;
  // Should not happen after the salary filter; kept low so it can never beat a posted salary above the floor.
  public static readonly belowFloor: number = 20;
}

export class SalaryScorer {
  public constructor(private readonly minSalaryUsd: number) {}

  public score(job: StoredJob): number {
    if (!job.salaryKnown || job.salaryIsEstimated) {
      return SalaryScores.unknownOrEstimated;
    }
    const currency: string = (job.currency ?? "").trim().toUpperCase();
    // The INR floor is deferred, so an INR figure cannot be compared yet.
    if (currency.length === 0 || currency === "INR") {
      return SalaryScores.unknownOrEstimated;
    }
    const ceiling: number | null = this.ceiling(job);
    if (ceiling === null) {
      return SalaryScores.unknownOrEstimated;
    }
    if (ceiling >= this.minSalaryUsd) {
      return SalaryScores.atOrAboveFloor;
    }
    return SalaryScores.belowFloor;
  }

  private ceiling(job: StoredJob): number | null {
    if (job.salaryUsdMax !== null) {
      return job.salaryUsdMax;
    }
    return job.salaryUsdMin;
  }
}
