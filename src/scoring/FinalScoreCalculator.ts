import { SubScores } from "./ScoreDetails";

export interface ScoreWeights {
  skills: number;
  seniority: number;
  location: number;
  salary: number;
  company: number;
}

// Weighted sum of the five 0 to 100 sub-scores. Dividing by the weight total keeps the result in
// 0 to 100 even if the configured weights do not add up to exactly 100.
export class FinalScoreCalculator {
  public constructor(private readonly weights: ScoreWeights) {
    if (this.totalWeight() <= 0) {
      throw new Error("Score weights must add up to more than zero.");
    }
  }

  public calculate(subScores: SubScores): number {
    const weighted: number = subScores.skillsFit * this.weights.skills
      + subScores.seniorityFit * this.weights.seniority
      + subScores.location * this.weights.location
      + subScores.salary * this.weights.salary
      + subScores.company * this.weights.company;
    const rounded: number = Math.round(weighted / this.totalWeight());
    return Math.min(100, Math.max(0, rounded));
  }

  private totalWeight(): number {
    return this.weights.skills + this.weights.seniority + this.weights.location + this.weights.salary + this.weights.company;
  }
}
