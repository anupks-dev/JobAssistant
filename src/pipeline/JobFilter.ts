import { RegionEligibility, StoredJob } from "../db/repositories/JobRepository";
import { FilterContext } from "./FilterContext";

export interface FilterDecision {
  passed: boolean;
  reasonCode?: string;
  notes?: string;
  regionEligibility?: RegionEligibility | null;
  isBangaloreGcc?: boolean;
  salaryUsdMin?: number | null;
  salaryUsdMax?: number | null;
}

export interface FilterStep {
  name: string;
  passed: boolean;
  reasonCode: string | null;
}

export interface JobFilter {
  getName(): string;
  evaluate(job: StoredJob, context: FilterContext): FilterDecision;
}
