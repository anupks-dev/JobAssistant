import { Company } from "../../db/repositories/CompanyRepository";
import { StoredJob } from "../../db/repositories/JobRepository";
import { FilterContext } from "../FilterContext";
import { FilterDecision, JobFilter } from "../JobFilter";
import { PhraseMatcher } from "../PhraseMatcher";

export class BlockedCompanyFilter implements JobFilter {
  public constructor(private readonly phrases: PhraseMatcher) {}

  public getName(): string {
    return "BlockedCompanyFilter";
  }

  public evaluate(job: StoredJob, context: FilterContext): FilterDecision {
    if (this.isListed(job.company, context.blockedCompanyNames) || this.isFlagged(job.company, context.companies)) {
      const rejected: FilterDecision = { passed: false, reasonCode: "blocked_company" };
      return rejected;
    }
    const passed: FilterDecision = { passed: true };
    return passed;
  }

  private isListed(companyName: string, blockedNames: string[]): boolean {
    const normalized: string = this.phrases.normalizeCompany(companyName);
    for (let index: number = 0; index < blockedNames.length; index++) {
      if (this.phrases.normalizeCompany(blockedNames[index]) === normalized) {
        return true;
      }
    }
    return false;
  }

  private isFlagged(companyName: string, companies: Company[]): boolean {
    const normalized: string = this.phrases.normalizeCompany(companyName);
    for (let index: number = 0; index < companies.length; index++) {
      const company: Company = companies[index];
      if (!company.isBlocked) {
        continue;
      }
      if (this.phrases.normalizeCompany(company.name) === normalized) {
        return true;
      }
    }
    return false;
  }
}
