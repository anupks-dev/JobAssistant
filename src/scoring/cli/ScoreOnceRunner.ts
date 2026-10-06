import pino, { Logger } from "pino";
import { Clock } from "../../fetchers/Clock";
import { OutputSummary, RegenerationMode, TopJobOutputGenerator } from "../../outputs/TopJobOutputGenerator";
import { ProfileContext, ProfileContextProvider } from "../../profile/ProfileContextProvider";
import { JobScorer, ScoringSummary } from "../JobScorer";
import { RankedJob, RankingService } from "../RankingService";
import { RankedListPrinter } from "./RankedListPrinter";
import { ScoreOnceOptions } from "./ScoreOnceOptions";

export interface LineSink {
  print(line: string): void;
}

// The whole score:once flow: optional rescore, score the shortlist, rank, write outputs for the top
// section, then print. Only counts and codes are printed or logged, never prompts or model text.
export class ScoreOnceRunner {
  private readonly logger: Logger = pino({ level: "info" });

  public constructor(
    private readonly scorer: JobScorer,
    private readonly ranking: RankingService,
    private readonly outputs: TopJobOutputGenerator,
    private readonly contextProvider: ProfileContextProvider,
    private readonly clock: Clock,
    private readonly sink: LineSink,
  ) {}

  public async run(options: ScoreOnceOptions): Promise<void> {
    if (options.rescoreOutdated) {
      const rescored: number = await this.scorer.rescoreOutdated();
      this.sink.print("Rescored " + String(rescored) + " jobs that used an older prompt version.");
    }
    const summary: ScoringSummary = await this.scorer.scoreShortlist({ retryFailed: options.retryFailed });
    this.sink.print("Scored " + String(summary.scored) + " of " + String(summary.attempted)
      + " jobs. Unscored: " + String(summary.unscored)
      + ". Unscored final: " + String(summary.unscoredFinal)
      + ". Injection suspected: " + String(summary.injectionSuspected) + ".");
    const ranked: RankedJob[] = this.ranking.buildDailyList(this.clock.now());
    const context: ProfileContext = this.contextProvider.get();
    const mode: RegenerationMode = options.regenerateOutputsOutdated ? "outdated" : "missing";
    const outputSummary: OutputSummary = await this.outputs.generateForTop(ranked, context, mode);
    const lines: string[] = new RankedListPrinter().lines(ranked, options.urls);
    for (let index: number = 0; index < lines.length; index++) {
      this.sink.print(lines[index]);
    }
    this.printOutputs(outputSummary);
    this.logger.info({
      attempted: summary.attempted,
      scored: summary.scored,
      unscored: summary.unscored,
      unscoredFinal: summary.unscoredFinal,
      injectionSuspected: summary.injectionSuspected,
      ranked: ranked.length,
      outputsGenerated: outputSummary.generated,
      outputsCached: outputSummary.alreadyCached,
      outputsFailed: outputSummary.failureCodes.length,
      validationProblems: this.countByCode(outputSummary.problemCodes),
    }, "Scoring finished");
  }

  // Always printed, even for zero top jobs, so a missing line can never mean "skipped silently".
  private printOutputs(summary: OutputSummary): void {
    this.sink.print("Outputs: letters " + String(summary.lettersDone) + " of " + String(summary.considered)
      + ", tweaks " + String(summary.tweaksDone) + " of " + String(summary.considered)
      + ", failed " + String(summary.failureCodes.length));
    if (summary.failureCodes.length > 0) {
      this.sink.print("Failure codes: " + this.describeFailureCodes(summary.failureCodes));
    }
    if (summary.problemCodes.length > 0) {
      this.sink.print("Validation problems: " + this.describeFailureCodes(summary.problemCodes));
    }
  }

  private countByCode(codes: string[]): Record<string, number> {
    const counts: Record<string, number> = {};
    for (let index: number = 0; index < codes.length; index++) {
      counts[codes[index]] = (counts[codes[index]] ?? 0) + 1;
    }
    return counts;
  }

  private describeFailureCodes(codes: string[]): string {
    const counts: Map<string, number> = new Map<string, number>();
    for (let index: number = 0; index < codes.length; index++) {
      counts.set(codes[index], (counts.get(codes[index]) ?? 0) + 1);
    }
    const parts: string[] = [];
    const names: string[] = Array.from(counts.keys()).sort();
    for (let index: number = 0; index < names.length; index++) {
      parts.push(names[index] + " x" + String(counts.get(names[index])));
    }
    return parts.join(", ");
  }
}
