import { StoredJob } from "../db/repositories/JobRepository";
import { ScoreDetails, ScoreDetailsCodec } from "../scoring/ScoreDetails";

// Reads the skills the scoring step marked as missing for a job. An unscored job has none.
export class JobMissingSkills {
  private readonly codec: ScoreDetailsCodec = new ScoreDetailsCodec();

  public of(job: StoredJob): string[] {
    const details: ScoreDetails | null = this.codec.parse(job.scoreDetails);
    if (details === null || details.unscored) {
      return [];
    }
    return details.missingSkills;
  }
}
