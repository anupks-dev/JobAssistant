import { AppConfig } from "../config/AppConfig";
import { Company, CompanyRepository } from "../db/repositories/CompanyRepository";
import { FilterSaveResult, JobRepository, JobStatus, StoredJob } from "../db/repositories/JobRepository";
import { SentJobRepository } from "../db/repositories/SentJobRepository";
import { Clock } from "../fetchers/Clock";
import { FilterContext } from "./FilterContext";
import { FilterStep } from "./JobFilter";
import { JobFilterPipeline, PipelineResult } from "./JobFilterPipeline";
import { PreScorer } from "./PreScorer";

export interface ReasonCount {
  reason: string;
  count: number;
}

export interface SourceReasonCount {
  source: string;
  reason: string;
  count: number;
}

export interface FilterRunSummary {
  evaluated: number;
  shortlisted: number;
  capped: number;
  rejectedByReason: ReasonCount[];
  bySource: SourceReasonCount[];
}

export interface JobExplanation {
  status: JobStatus;
  storedReason: string | null;
  storedNotes: string | null;
  steps: FilterStep[];
}

interface RankedPass {
  job: StoredJob;
  result: PipelineResult;
  score: number;
}

const BATCH_LIMIT: number = 5000;

export class FilterPipelineRunner {
  public constructor(
    private readonly jobs: JobRepository,
    private readonly sentJobs: SentJobRepository,
    private readonly companies: CompanyRepository,
    private readonly config: AppConfig,
    private readonly clock: Clock,
    private readonly pipeline: JobFilterPipeline,
    private readonly preScorer: PreScorer,
  ) {}

  public run(reevaluate: boolean): FilterRunSummary {
    if (reevaluate) {
      this.jobs.resetForReevaluation();
    }
    const loaded: StoredJob[] = this.jobs.findByStatus("new", BATCH_LIMIT);
    const context: FilterContext = this.prepareContext(loaded);
    const rejected: RankedPass[] = [];
    const passed: RankedPass[] = [];
    for (let index: number = 0; index < loaded.length; index++) {
      const job: StoredJob = loaded[index];
      const result: PipelineResult = this.pipeline.evaluate(job, context);
      const ranked: RankedPass = { job: job, result: result, score: 0 };
      if (result.passed) {
        ranked.score = this.preScorer.score({
          job: job,
          regionOpen: result.regionEligibility === "open",
          isBangaloreGcc: result.isBangaloreGcc,
          salaryUsdMax: result.salaryUsdMax,
        }, context);
        passed.push(ranked);
      } else {
        rejected.push(ranked);
      }
    }
    const capped: RankedPass[] = this.applyCap(passed);
    this.saveAll(passed, false);
    this.saveAll(capped, true);
    this.saveAll(rejected, false);
    return this.summarize(loaded.length, passed, capped, rejected);
  }

  public explain(jobId: number): JobExplanation | null {
    const job: StoredJob | null = this.jobs.findById(jobId);
    if (job === null) {
      return null;
    }
    const loaded: StoredJob[] = this.jobs.findByStatus("new", BATCH_LIMIT);
    if (!this.containsJob(loaded, job.id)) {
      loaded.push(job);
    }
    const context: FilterContext = this.prepareContext(loaded);
    const result: PipelineResult = this.pipeline.explain(job, context);
    const explanation: JobExplanation = {
      status: job.status,
      storedReason: job.rejectionReason,
      storedNotes: job.filterNotes,
      steps: result.steps,
    };
    return explanation;
  }

  private prepareContext(jobs: StoredJob[]): FilterContext {
    const context: FilterContext = this.baseContext();
    const eligible: StoredJob[] = [];
    for (let index: number = 0; index < jobs.length; index++) {
      const job: StoredJob = jobs[index];
      if (this.pipeline.passesEarly(job, context)) {
        eligible.push(job);
      }
    }
    context.competingJobs = eligible;
    return context;
  }

  private baseContext(): FilterContext {
    const companyRows: Company[] = this.companies.findAll();
    const context: FilterContext = new FilterContext(
      this.config,
      this.config.companies.blocked,
      this.config.companies.preferred,
      this.config.gcc.seedCompanies,
      this.sentJobs,
      this.clock,
      companyRows,
      this.retainedKeys(),
      [],
    );
    return context;
  }

  private retainedKeys(): string[] {
    const keys: string[] = [];
    this.collectKeys(this.jobs.findByStatus("shortlisted", BATCH_LIMIT), keys);
    this.collectKeys(this.jobs.findByStatus("scored", BATCH_LIMIT), keys);
    return keys;
  }

  private collectKeys(jobs: StoredJob[], keys: string[]): void {
    for (let index: number = 0; index < jobs.length; index++) {
      keys.push(jobs[index].dedupeKey);
    }
  }

  private applyCap(passed: RankedPass[]): RankedPass[] {
    const limit: number = this.config.filters.maxShortlist;
    if (passed.length <= limit) {
      return [];
    }
    const ranked: RankedPass[] = [];
    for (let index: number = 0; index < passed.length; index++) {
      ranked.push(passed[index]);
    }
    ranked.sort((left: RankedPass, right: RankedPass): number => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }
      return left.job.id - right.job.id;
    });
    const capped: RankedPass[] = [];
    for (let index: number = limit; index < ranked.length; index++) {
      capped.push(ranked[index]);
    }
    const kept: RankedPass[] = [];
    for (let index: number = 0; index < limit; index++) {
      kept.push(ranked[index]);
    }
    passed.length = 0;
    for (let index: number = 0; index < kept.length; index++) {
      passed.push(kept[index]);
    }
    return capped;
  }

  private saveAll(rows: RankedPass[], capped: boolean): void {
    for (let index: number = 0; index < rows.length; index++) {
      const row: RankedPass = rows[index];
      const save: FilterSaveResult = {
        status: capped || !row.result.passed ? "rejected" : "shortlisted",
        reason: capped ? "capped" : row.result.reasonCode,
        regionEligibility: row.result.regionEligibility,
        isBangaloreGcc: row.result.isBangaloreGcc,
        salaryUsdMin: row.result.salaryUsdMin,
        salaryUsdMax: row.result.salaryUsdMax,
        notes: row.result.notes,
      };
      this.jobs.saveFilterResult(row.job.id, save);
    }
  }

  private summarize(evaluated: number, shortlisted: RankedPass[], capped: RankedPass[], rejected: RankedPass[]): FilterRunSummary {
    const reasons: ReasonCount[] = [];
    this.addReason(reasons, "capped", capped.length);
    for (let index: number = 0; index < rejected.length; index++) {
      const reason: string = rejected[index].result.reasonCode ?? "rejected";
      this.addReason(reasons, reason, 1);
    }
    const bySource: SourceReasonCount[] = [];
    this.addSourceRows(bySource, shortlisted, "shortlisted");
    this.addSourceRows(bySource, capped, "capped");
    for (let index: number = 0; index < rejected.length; index++) {
      const reason: string = rejected[index].result.reasonCode ?? "rejected";
      this.addSource(bySource, rejected[index].job.source, reason);
    }
    bySource.sort((left: SourceReasonCount, right: SourceReasonCount): number => {
      if (left.source !== right.source) {
        return left.source < right.source ? -1 : 1;
      }
      if (left.reason !== right.reason) {
        return left.reason < right.reason ? -1 : 1;
      }
      return 0;
    });
    const summary: FilterRunSummary = {
      evaluated: evaluated,
      shortlisted: shortlisted.length,
      capped: capped.length,
      rejectedByReason: reasons,
      bySource: bySource,
    };
    return summary;
  }

  private addSourceRows(rows: SourceReasonCount[], ranked: RankedPass[], reason: string): void {
    for (let index: number = 0; index < ranked.length; index++) {
      this.addSource(rows, ranked[index].job.source, reason);
    }
  }

  private addSource(rows: SourceReasonCount[], source: string, reason: string): void {
    for (let index: number = 0; index < rows.length; index++) {
      if (rows[index].source === source && rows[index].reason === reason) {
        rows[index].count = rows[index].count + 1;
        return;
      }
    }
    rows.push({ source: source, reason: reason, count: 1 });
  }

  private addReason(reasons: ReasonCount[], reason: string, amount: number): void {
    if (amount === 0) {
      return;
    }
    for (let index: number = 0; index < reasons.length; index++) {
      if (reasons[index].reason === reason) {
        reasons[index].count = reasons[index].count + amount;
        return;
      }
    }
    reasons.push({ reason: reason, count: amount });
  }

  private containsJob(jobs: StoredJob[], jobId: number): boolean {
    for (let index: number = 0; index < jobs.length; index++) {
      if (jobs[index].id === jobId) {
        return true;
      }
    }
    return false;
  }
}
