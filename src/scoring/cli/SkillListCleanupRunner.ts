import { JobRepository, StoredJob } from "../../db/repositories/JobRepository";
import { GroundingTextBuilder } from "../../profile/GroundingTextBuilder";
import { ProfileContextProvider } from "../../profile/ProfileContextProvider";
import { ScoreDetails, ScoreDetailsCodec, ScoredDetails } from "../ScoreDetails";
import { CleanedSkillLists, SkillListCleaner } from "../SkillListCleaner";

// The largest number of stored scores one cleanup pass reads.
const CLEANUP_BATCH_LIMIT: number = 100000;

// Applies the skill list cleanup to scores already stored for unsent jobs. No LLM call; score and reason stay as they are.
export class SkillListCleanupRunner {
  public constructor(
    private readonly jobs: JobRepository,
    private readonly codec: ScoreDetailsCodec,
    private readonly cleaner: SkillListCleaner,
    private readonly contextProvider: ProfileContextProvider,
  ) {}

  // Returns how many jobs changed.
  public run(): number {
    const profileText: string = new GroundingTextBuilder().build(this.contextProvider.get());
    const candidates: StoredJob[] = this.jobs.findScoredUnsent(CLEANUP_BATCH_LIMIT);
    let changed: number = 0;
    for (let index: number = 0; index < candidates.length; index++) {
      if (this.cleanOne(candidates[index], profileText)) {
        changed = changed + 1;
      }
    }
    return changed;
  }

  private cleanOne(job: StoredJob, profileText: string): boolean {
    const details: ScoreDetails | null = this.codec.parse(job.scoreDetails);
    if (details === null || details.unscored || job.score === null || job.scoreReason === null) {
      return false;
    }
    const scored: ScoredDetails = details;
    const cleaned: CleanedSkillLists = this.cleaner.clean(scored, profileText);
    if (!cleaned.changed) {
      return false;
    }
    const updated: ScoredDetails = { ...scored, matchedSkills: cleaned.matchedSkills, missingSkills: cleaned.missingSkills };
    this.jobs.saveScore(job.id, job.score, job.scoreReason, this.codec.serialize(updated));
    return true;
  }
}
