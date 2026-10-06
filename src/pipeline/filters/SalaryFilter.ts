import { StoredJob } from "../../db/repositories/JobRepository";
import { CurrencyConverter } from "../CurrencyConverter";
import { FilterContext } from "../FilterContext";
import { FilterDecision, JobFilter } from "../JobFilter";

export class SalaryFilter implements JobFilter {
  public constructor(private readonly converter: CurrencyConverter) {}

  public getName(): string {
    return "SalaryFilter";
  }

  public evaluate(job: StoredJob, context: FilterContext): FilterDecision {
    if (!job.salaryKnown || job.salaryIsEstimated) {
      return this.unknown();
    }
    const currency: string = (job.currency ?? "").trim().toUpperCase();
    if (currency.length === 0) {
      return this.unknown();
    }
    if (currency === "INR") {
      return this.inrDecision(job, context);
    }
    return this.foreignDecision(job, context, currency);
  }

  private inrDecision(job: StoredJob, context: FilterContext): FilterDecision {
    const floor: number | null = context.config.filters.minSalaryInr;
    const minimum: number | null = this.convert(job.salaryMin, "INR", context);
    const maximum: number | null = this.convert(job.salaryMax, "INR", context);
    if (floor !== null && this.below(job.salaryMin, job.salaryMax, floor)) {
      const rejected: FilterDecision = {
        passed: false,
        reasonCode: "salary_below_min",
        salaryUsdMin: minimum,
        salaryUsdMax: maximum,
      };
      return rejected;
    }
    const passed: FilterDecision = { passed: true, salaryUsdMin: minimum, salaryUsdMax: maximum };
    return passed;
  }

  private foreignDecision(job: StoredJob, context: FilterContext, currency: string): FilterDecision {
    const minimum: number | null = this.convert(job.salaryMin, currency, context);
    const maximum: number | null = this.convert(job.salaryMax, currency, context);
    if (minimum === null && maximum === null) {
      return this.unknown();
    }
    const ceiling: number | null = maximum !== null ? maximum : minimum;
    if (ceiling !== null && ceiling < context.config.filters.minSalaryUsd) {
      const rejected: FilterDecision = {
        passed: false,
        reasonCode: "salary_below_min",
        salaryUsdMin: minimum,
        salaryUsdMax: maximum,
      };
      return rejected;
    }
    const passed: FilterDecision = { passed: true, salaryUsdMin: minimum, salaryUsdMax: maximum };
    return passed;
  }

  private below(minimum: number | null, maximum: number | null, floor: number): boolean {
    const ceiling: number | null = maximum !== null ? maximum : minimum;
    if (ceiling === null) {
      return false;
    }
    return ceiling < floor;
  }

  private convert(amount: number | null, currency: string, context: FilterContext): number | null {
    if (amount === null) {
      return null;
    }
    return this.converter.toUsd(amount, currency, context.config.currencyRates);
  }

  private unknown(): FilterDecision {
    const passed: FilterDecision = {
      passed: true,
      notes: "salary_unknown",
      salaryUsdMin: null,
      salaryUsdMax: null,
    };
    return passed;
  }
}
