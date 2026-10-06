import { AppConfig } from "../config/AppConfig";
import { StoredJob } from "../db/repositories/JobRepository";
import { GccDetector } from "../pipeline/GccDetector";
import { PhraseMatcher } from "../pipeline/PhraseMatcher";
import { CompanyScorer } from "./CompanyScorer";
import { ScoreWeights } from "./FinalScoreCalculator";

export const FAKE_WEIGHTS: ScoreWeights = { skills: 40, seniority: 20, location: 15, salary: 15, company: 10 };

// Fake company names only.
export function fakeCompanyScorer(): CompanyScorer {
  const phrases: PhraseMatcher = new PhraseMatcher();
  return new CompanyScorer(phrases, new GccDetector(phrases), {
    preferredNames: ["Northwind Labs"],
    gccSeedNames: ["Contoso Bank"],
    gccKeywords: ["global capability center"],
    knownCompanies: [],
  });
}

export function withRanking(config: AppConfig, minScore: number, topCount: number, extraCount: number): AppConfig {
  const adjusted: AppConfig = {
    ...config,
    scoring: { ...config.scoring, minScore: minScore },
    output: { topCount: topCount, extraCount: extraCount },
  };
  return adjusted;
}

export function fakeScoredJob(overrides: Partial<StoredJob>): StoredJob {
  const posted: Date = new Date("2026-10-04T12:00:00.000Z");
  const job: StoredJob = {
    id: 1,
    source: "remoteok",
    externalId: "1",
    title: "Tech Lead",
    company: "Example Labs",
    location: "Remote - Worldwide",
    remoteType: "remote",
    salaryMin: null,
    salaryMax: null,
    currency: null,
    salaryKnown: false,
    salaryIsEstimated: false,
    url: "https://example.com/1",
    postedAt: posted,
    description: "Build services.",
    descriptionIsSnippet: false,
    fetchedAt: posted,
    dedupeKey: "k1",
    status: "shortlisted",
    rejectionReason: null,
    score: null,
    scoreReason: null,
    regionEligibility: "open",
    isBangaloreGcc: false,
    salaryUsdMin: null,
    salaryUsdMax: null,
    filterNotes: null,
    scoreDetails: null,
  };
  const merged: StoredJob = { ...job, ...overrides };
  return merged;
}
