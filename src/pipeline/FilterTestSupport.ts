import { AppConfig } from "../config/AppConfig";
import { ConfigLoader } from "../config/ConfigLoader";
import { Company } from "../db/repositories/CompanyRepository";
import { StoredJob } from "../db/repositories/JobRepository";
import { SentJobRecord, SentJobRepository, SentSection } from "../db/repositories/SentJobRepository";
import { Clock } from "../fetchers/Clock";
import { FilterContext } from "./FilterContext";
import { join } from "path";

export class FixedClock implements Clock {
  public constructor(private readonly instant: Date) {}

  public now(): Date {
    return this.instant;
  }
}

export class FakeSentJobs implements SentJobRepository {
  public constructor(private readonly keys: string[]) {}

  public recordSent(
    jobId: number,
    dedupeKey: string,
    runId: number,
    rank: number,
    score: number,
    section: SentSection,
  ): void {
    if (jobId < 0 || dedupeKey.length < 0 || runId < 0 || rank < 0 || score < 0 || section.length === 0) {
      throw new Error("Invalid sent record.");
    }
  }

  public hasBeenSent(dedupeKey: string): boolean {
    for (let index: number = 0; index < this.keys.length; index++) {
      if (this.keys[index] === dedupeKey) {
        return true;
      }
    }
    return false;
  }

  public listSentSince(sinceIso: string): SentJobRecord[] {
    if (sinceIso.length < 0) {
      return [];
    }
    return [];
  }
}

export function loadConfig(): AppConfig {
  const loader: ConfigLoader = new ConfigLoader(join(process.cwd(), "config", "config.yaml"));
  return loader.load();
}

export function makeJob(overrides: Partial<StoredJob>): StoredJob {
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
    url: "https://remoteok.com/remote-jobs/1",
    postedAt: posted,
    description: "Build services.",
    descriptionIsSnippet: false,
    fetchedAt: posted,
    dedupeKey: "example labs|tech lead|remote worldwide",
    status: "new",
    rejectionReason: null,
    score: null,
    scoreReason: null,
    regionEligibility: null,
    isBangaloreGcc: false,
    salaryUsdMin: null,
    salaryUsdMax: null,
    filterNotes: null,
  };
  const merged: StoredJob = { ...job, ...overrides };
  return merged;
}

export function makeContext(
  config: AppConfig,
  clock: Clock,
  companies: Company[],
  sentKeys: string[],
  competingJobs: StoredJob[],
  retainedKeys: string[],
): FilterContext {
  const context: FilterContext = new FilterContext(
    config,
    config.companies.blocked,
    config.companies.preferred,
    config.gcc.seedCompanies,
    new FakeSentJobs(sentKeys),
    clock,
    companies,
    retainedKeys,
    competingJobs,
  );
  return context;
}
