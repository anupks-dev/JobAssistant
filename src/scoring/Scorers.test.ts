import { describe, expect, it } from "vitest";
import { StoredJob } from "../db/repositories/JobRepository";
import { CompanyScorer } from "./CompanyScorer";
import { FinalScoreCalculator } from "./FinalScoreCalculator";
import { LocationScorer } from "./LocationScorer";
import { SalaryScorer } from "./SalaryScorer";
import { FAKE_WEIGHTS, fakeCompanyScorer, fakeScoredJob } from "./ScoringTestSupport";

describe("LocationScorer", () => {
  const scorer: LocationScorer = new LocationScorer();

  it("gives 100 to an open region (which includes Bangalore remote)", () => {
    expect(scorer.score(fakeScoredJob({ regionEligibility: "open" }))).toBe(100);
  });

  it("gives 90 to a Bangalore GCC onsite job", () => {
    const job: StoredJob = fakeScoredJob({ regionEligibility: "unknown", isBangaloreGcc: true });
    expect(scorer.score(job)).toBe(90);
  });

  it("gives 60 when eligibility is unknown", () => {
    expect(scorer.score(fakeScoredJob({ regionEligibility: "unknown" }))).toBe(60);
    expect(scorer.score(fakeScoredJob({ regionEligibility: null }))).toBe(60);
  });
});

describe("SalaryScorer", () => {
  const scorer: SalaryScorer = new SalaryScorer(150000);

  it("gives 100 to a known salary at or above the floor", () => {
    const atFloor: StoredJob = fakeScoredJob({ salaryKnown: true, currency: "USD", salaryUsdMax: 150000 });
    expect(scorer.score(atFloor)).toBe(100);
  });

  it("gives 50 to unknown and estimated salaries", () => {
    expect(scorer.score(fakeScoredJob({ salaryKnown: false }))).toBe(50);
    const estimated: StoredJob = fakeScoredJob({ salaryKnown: true, salaryIsEstimated: true, currency: "USD", salaryUsdMax: 400000 });
    expect(scorer.score(estimated)).toBe(50);
  });

  it("gives 50 to INR salaries because the floor is deferred", () => {
    const inr: StoredJob = fakeScoredJob({ salaryKnown: true, currency: "INR", salaryUsdMax: 400000 });
    expect(scorer.score(inr)).toBe(50);
  });

  it("scores a known salary below the floor lower than an unknown one", () => {
    const below: StoredJob = fakeScoredJob({ salaryKnown: true, currency: "USD", salaryUsdMax: 90000 });
    expect(scorer.score(below)).toBe(20);
  });
});

describe("CompanyScorer", () => {
  const scorer: CompanyScorer = fakeCompanyScorer();

  it("gives 100 to a preferred company, 70 to a GCC seed company and 40 to others", () => {
    expect(scorer.score("Northwind Labs")).toBe(100);
    expect(scorer.score("Contoso Bank")).toBe(70);
    expect(scorer.score("Random Startup")).toBe(40);
  });

  it("does not let a description promote an unknown company", () => {
    expect(scorer.score("Random Startup")).toBe(40);
  });
});

describe("FinalScoreCalculator", () => {
  const calculator: FinalScoreCalculator = new FinalScoreCalculator(FAKE_WEIGHTS);

  it("returns the exact weighted sum for known inputs", () => {
    // 90*0.40 + 60*0.20 + 100*0.15 + 100*0.15 + 70*0.10 = 36 + 12 + 15 + 15 + 7
    const score: number = calculator.calculate({ skillsFit: 90, seniorityFit: 60, location: 100, salary: 100, company: 70 });
    expect(score).toBe(85);
  });

  it("rounds to a whole number", () => {
    // 80*0.40 + 60*0.20 + 100*0.15 + 50*0.15 + 40*0.10 = 70.5
    const score: number = calculator.calculate({ skillsFit: 80, seniorityFit: 60, location: 100, salary: 50, company: 40 });
    expect(score).toBe(71);
  });

  it("stays within 0 and 100", () => {
    expect(calculator.calculate({ skillsFit: 0, seniorityFit: 0, location: 0, salary: 0, company: 0 })).toBe(0);
    expect(calculator.calculate({ skillsFit: 100, seniorityFit: 100, location: 100, salary: 100, company: 100 })).toBe(100);
  });

  it("rejects weights that add up to zero", () => {
    expect(() => new FinalScoreCalculator({ skills: 0, seniority: 0, location: 0, salary: 0, company: 0 })).toThrow();
  });
});
