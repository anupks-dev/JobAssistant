import { AppConfig } from "../config/AppConfig";
import { JobRepository, StoredJob } from "../db/repositories/JobRepository";
import { SentSection } from "../db/repositories/SentJobRepository";
import { CompanyScorer } from "./CompanyScorer";

export interface RankedJob {
  job: StoredJob;
  rank: number;
  section: SentSection;
}

const MILLIS_PER_DAY: number = 24 * 60 * 60 * 1000;

// Builds the daily list. It never marks anything as sent: the Telegram stage does that after a successful send.
export class RankingService {
  public constructor(
    private readonly jobs: JobRepository,
    private readonly config: AppConfig,
    private readonly companyScorer: CompanyScorer,
  ) {}

  public buildDailyList(now: Date): RankedJob[] {
    const since: Date = new Date(now.getTime() - this.config.filters.postedWithinDays * MILLIS_PER_DAY);
    const pool: StoredJob[] = this.jobs.findRankingPool(since.toISOString(), this.config.scoring.minScore);
    const sorted: StoredJob[] = this.sortPool(pool);
    const topCount: number = this.config.output.topCount;
    const limit: number = topCount + this.config.output.extraCount;
    const ranked: RankedJob[] = [];
    for (let index: number = 0; index < sorted.length && index < limit; index++) {
      const section: SentSection = index < topCount ? "top" : "extra";
      ranked.push({ job: sorted[index], rank: index + 1, section: section });
    }
    return ranked;
  }

  private sortPool(pool: StoredJob[]): StoredJob[] {
    const sorted: StoredJob[] = [];
    for (let index: number = 0; index < pool.length; index++) {
      sorted.push(pool[index]);
    }
    sorted.sort((left: StoredJob, right: StoredJob): number => this.compare(left, right));
    return sorted;
  }

  // Score first, then preferred company, then newer posting. The id keeps the order stable on a full tie.
  private compare(left: StoredJob, right: StoredJob): number {
    const leftScore: number = left.score ?? 0;
    const rightScore: number = right.score ?? 0;
    if (leftScore !== rightScore) {
      return rightScore - leftScore;
    }
    const leftPreferred: boolean = this.companyScorer.isPreferred(left.company);
    const rightPreferred: boolean = this.companyScorer.isPreferred(right.company);
    if (leftPreferred !== rightPreferred) {
      return leftPreferred ? -1 : 1;
    }
    const leftPosted: number = this.postedTime(left);
    const rightPosted: number = this.postedTime(right);
    if (leftPosted !== rightPosted) {
      return rightPosted - leftPosted;
    }
    return left.id - right.id;
  }

  private postedTime(job: StoredJob): number {
    if (job.postedAt === null) {
      return job.fetchedAt.getTime();
    }
    return job.postedAt.getTime();
  }
}
