import { RegionEligibility, StoredJob } from "../db/repositories/JobRepository";
import { FilterContext } from "./FilterContext";
import { FilterDecision, FilterStep, JobFilter } from "./JobFilter";

export interface PipelineResult {
  passed: boolean;
  reasonCode: string | null;
  regionEligibility: RegionEligibility | null;
  isBangaloreGcc: boolean;
  salaryUsdMin: number | null;
  salaryUsdMax: number | null;
  notes: string | null;
  steps: FilterStep[];
}

export class JobFilterPipeline {
  public constructor(private readonly filters: JobFilter[]) {}

  public evaluate(job: StoredJob, context: FilterContext): PipelineResult {
    return this.run(job, context, true);
  }

  public explain(job: StoredJob, context: FilterContext): PipelineResult {
    return this.run(job, context, false);
  }

  public passesEarly(job: StoredJob, context: FilterContext): boolean {
    for (let index: number = 0; index < this.filters.length; index++) {
      const filter: JobFilter = this.filters[index];
      if (filter.getName() === "DuplicateFilter") {
        continue;
      }
      const decision: FilterDecision = filter.evaluate(job, context);
      if (!decision.passed) {
        return false;
      }
    }
    return true;
  }

  private run(job: StoredJob, context: FilterContext, stopOnFailure: boolean): PipelineResult {
    const steps: FilterStep[] = [];
    let passed: boolean = true;
    let reasonCode: string | null = null;
    let regionEligibility: RegionEligibility | null = null;
    let isBangaloreGcc: boolean = false;
    let salaryUsdMin: number | null = null;
    let salaryUsdMax: number | null = null;
    const noteParts: string[] = [];
    for (let index: number = 0; index < this.filters.length; index++) {
      const filter: JobFilter = this.filters[index];
      if (stopOnFailure && !passed) {
        break;
      }
      const decision: FilterDecision = filter.evaluate(job, context);
      const step: FilterStep = {
        name: filter.getName(),
        passed: decision.passed,
        reasonCode: decision.reasonCode ?? null,
      };
      steps.push(step);
      this.collect(decision, noteParts);
      if (decision.regionEligibility !== undefined && decision.regionEligibility !== null) {
        regionEligibility = decision.regionEligibility;
      }
      if (decision.isBangaloreGcc === true) {
        isBangaloreGcc = true;
      }
      if (decision.salaryUsdMin !== undefined) {
        salaryUsdMin = decision.salaryUsdMin;
      }
      if (decision.salaryUsdMax !== undefined) {
        salaryUsdMax = decision.salaryUsdMax;
      }
      if (!decision.passed && passed) {
        passed = false;
        reasonCode = decision.reasonCode ?? filter.getName();
      }
    }
    const result: PipelineResult = {
      passed: passed,
      reasonCode: reasonCode,
      regionEligibility: regionEligibility,
      isBangaloreGcc: isBangaloreGcc,
      salaryUsdMin: salaryUsdMin,
      salaryUsdMax: salaryUsdMax,
      notes: this.joinNotes(noteParts),
      steps: steps,
    };
    return result;
  }

  private collect(decision: FilterDecision, noteParts: string[]): void {
    if (decision.notes === undefined || decision.notes.length === 0) {
      return;
    }
    noteParts.push(decision.notes);
  }

  private joinNotes(noteParts: string[]): string | null {
    if (noteParts.length === 0) {
      return null;
    }
    let joined: string = "";
    for (let index: number = 0; index < noteParts.length; index++) {
      if (index > 0) {
        joined = joined + "; ";
      }
      joined = joined + noteParts[index];
    }
    return joined;
  }
}
