import { StoredJob } from "../../db/repositories/JobRepository";
import { FilterContext } from "../FilterContext";
import { FilterDecision, JobFilter } from "../JobFilter";

const MILLIS_PER_DAY: number = 24 * 60 * 60 * 1000;

export class PostingAgeFilter implements JobFilter {
  public getName(): string {
    return "PostingAgeFilter";
  }

  public evaluate(job: StoredJob, context: FilterContext): FilterDecision {
    const posted: Date = job.postedAt === null ? job.fetchedAt : job.postedAt;
    const ageMs: number = context.clock.now().getTime() - posted.getTime();
    const limitMs: number = context.config.filters.postedWithinDays * MILLIS_PER_DAY;
    if (ageMs > limitMs) {
      const rejected: FilterDecision = { passed: false, reasonCode: "too_old" };
      return rejected;
    }
    const passed: FilterDecision = { passed: true };
    return passed;
  }
}
