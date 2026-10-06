import { AppConfig } from "../config/AppConfig";
import { Company } from "../db/repositories/CompanyRepository";
import { StoredJob } from "../db/repositories/JobRepository";
import { SentJobRepository } from "../db/repositories/SentJobRepository";
import { Clock } from "../fetchers/Clock";

export class FilterContext {
  public competingJobs: StoredJob[];

  public constructor(
    public readonly config: AppConfig,
    public readonly blockedCompanyNames: string[],
    public readonly preferredCompanyNames: string[],
    public readonly gccSeedCompanies: string[],
    public readonly sentJobs: SentJobRepository,
    public readonly clock: Clock,
    public readonly companies: Company[],
    public readonly retainedDedupeKeys: string[],
    competingJobs: StoredJob[],
  ) {
    this.competingJobs = competingJobs;
  }
}
