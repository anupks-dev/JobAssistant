import { JobRepository, StoredJob } from "../../db/repositories/JobRepository";
import { ProfileContext, ProfileContextProvider } from "../../profile/ProfileContextProvider";
import { LineSink } from "../../scoring/cli/ScoreOnceRunner";
import { OutputSummary, TopJobOutputGenerator } from "../TopJobOutputGenerator";
import { ScoreOutputsOptions } from "./ScoreOutputsOptions";

// score:outputs: forces a new letter and new tweaks for one job. Only counts and codes are printed.
export class ScoreOutputsRunner {
  public constructor(
    private readonly jobs: JobRepository,
    private readonly outputs: TopJobOutputGenerator,
    private readonly contextProvider: ProfileContextProvider,
    private readonly sink: LineSink,
  ) {}

  public async run(options: ScoreOutputsOptions): Promise<void> {
    const job: StoredJob | null = this.jobs.findById(options.jobId);
    if (job === null) {
      throw new Error("No job with id " + String(options.jobId) + ".");
    }
    const context: ProfileContext = this.contextProvider.get();
    const summary: OutputSummary = await this.outputs.regenerateForJob(job, context);
    if (summary.skippedSent > 0) {
      this.sink.print("Job " + String(job.id) + " was already sent, so its outputs were not changed.");
      return;
    }
    this.sink.print("Outputs: letters " + String(summary.lettersDone) + " of 1, tweaks " + String(summary.tweaksDone)
      + " of 1, failed " + String(summary.failureCodes.length));
    if (summary.failureCodes.length > 0) {
      this.sink.print("Failure codes: " + summary.failureCodes.join(", "));
    }
  }
}
