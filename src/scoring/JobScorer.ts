import { JobRepository, StoredJob } from "../db/repositories/JobRepository";
import { PromptLoader } from "../llm/PromptLoader";
import { StructuredCompletion, StructuredCompletionResult } from "../llm/StructuredCompletion";
import { GroundingTextBuilder } from "../profile/GroundingTextBuilder";
import { ProfileContext, ProfileContextProvider } from "../profile/ProfileContextProvider";
import { CompanyScorer } from "./CompanyScorer";
import { FinalScoreCalculator } from "./FinalScoreCalculator";
import { LlmScoreOutput, LlmScoreOutputSchema } from "./LlmScoreOutput";
import { LocationScorer } from "./LocationScorer";
import { SalaryScorer } from "./SalaryScorer";
import { SkillListCleaner } from "./SkillListCleaner";
import {
  INJECTION_NOTE,
  MAX_SCORING_ATTEMPTS,
  SNIPPET_NOTE,
  ScoreDetails,
  ScoreDetailsCodec,
  ScoredDetails,
  SubScores,
  UnscoredDetails,
} from "./ScoreDetails";
import { SCORE_PROMPT_NAME, SCORE_SYSTEM_PROMPT, ScoringPrompt, ScoringPromptBuilder } from "./ScoringPromptBuilder";

export interface JobScorerSettings {
  temperature: number;
  maxTokens: number;
  fallbackModelAvailable: boolean;
  batchLimit: number;
}

export interface JobScoreOutcome {
  scored: boolean;
  score: number | null;
  reason: string | null;
  details: ScoreDetails;
}

export interface ScoringSummary {
  attempted: number;
  scored: number;
  unscored: number;
  injectionSuspected: number;
  // Jobs currently marked unscored_final, including ones that became final in this run.
  unscoredFinal: number;
}

export interface ScoringRunOptions {
  // Also try jobs marked unscored_final, one attempt each.
  retryFailed: boolean;
}

// Scores one shortlisted job at a time. The model judges language fit; code computes everything else.
export class JobScorer {
  public constructor(
    private readonly jobs: JobRepository,
    private readonly contextProvider: ProfileContextProvider,
    private readonly promptBuilder: ScoringPromptBuilder,
    private readonly promptLoader: PromptLoader,
    private readonly completion: StructuredCompletion,
    private readonly locationScorer: LocationScorer,
    private readonly salaryScorer: SalaryScorer,
    private readonly companyScorer: CompanyScorer,
    private readonly calculator: FinalScoreCalculator,
    private readonly codec: ScoreDetailsCodec,
    private readonly cleaner: SkillListCleaner,
    private readonly settings: JobScorerSettings,
  ) {}

  // An unapproved profile fails here, before any job is touched. After that, one bad job never stops the rest.
  public async scoreShortlist(options: ScoringRunOptions = { retryFailed: false }): Promise<ScoringSummary> {
    const context: ProfileContext = this.contextProvider.get();
    const pending: StoredJob[] = this.jobs.findShortlistedUnscored(this.settings.batchLimit, options.retryFailed);
    const summary: ScoringSummary = { attempted: 0, scored: 0, unscored: 0, injectionSuspected: 0, unscoredFinal: 0 };
    for (let index: number = 0; index < pending.length; index++) {
      const outcome: JobScoreOutcome = await this.scoreAndSave(pending[index], context);
      summary.attempted = summary.attempted + 1;
      if (outcome.scored) {
        summary.scored = summary.scored + 1;
      } else {
        summary.unscored = summary.unscored + 1;
      }
      if (outcome.details.notes.indexOf(INJECTION_NOTE) >= 0) {
        summary.injectionSuspected = summary.injectionSuspected + 1;
      }
    }
    summary.unscoredFinal = this.jobs.countUnscoredFinal();
    return summary;
  }

  // Rescores unsent jobs that were scored with an older prompt version. Sent jobs are never touched and
  // job_outputs is not involved at all. A failed rescore keeps the old score. Returns how many were rescored.
  public async rescoreOutdated(): Promise<number> {
    const context: ProfileContext = this.contextProvider.get();
    const currentVersion: string = this.promptLoader.getVersion(SCORE_PROMPT_NAME);
    const candidates: StoredJob[] = this.jobs.findScoredUnsent(this.settings.batchLimit);
    let rescored: number = 0;
    for (let index: number = 0; index < candidates.length; index++) {
      if (!this.isOutdated(candidates[index], currentVersion)) {
        continue;
      }
      const outcome: JobScoreOutcome = await this.scoreSafely(candidates[index], context);
      if (outcome.scored) {
        this.save(candidates[index], outcome);
        rescored = rescored + 1;
      }
    }
    return rescored;
  }

  public async scoreJob(job: StoredJob, context: ProfileContext): Promise<JobScoreOutcome> {
    const promptVersion: string = this.promptLoader.getVersion(SCORE_PROMPT_NAME);
    const previousFailures: number = this.previousFailures(job);
    const prompt: ScoringPrompt = this.promptBuilder.build(job, context);
    const notes: string[] = [];
    if (prompt.injectionSuspected) {
      notes.push(INJECTION_NOTE);
    }
    const result: StructuredCompletionResult<LlmScoreOutput> = await this.completion.complete({
      taskName: "scoring",
      systemPrompt: SCORE_SYSTEM_PROMPT,
      userPrompt: prompt.userPrompt,
      temperature: this.settings.temperature,
      maxTokens: this.settings.maxTokens,
      schema: LlmScoreOutputSchema,
      fallbackModelAvailable: this.settings.fallbackModelAvailable,
    });
    if (!result.ok) {
      return this.unscored(result.reason, promptVersion, notes, previousFailures);
    }
    return this.combine(job, result.value, result.modelUsed, promptVersion, notes, context);
  }

  private async scoreAndSave(job: StoredJob, context: ProfileContext): Promise<JobScoreOutcome> {
    const outcome: JobScoreOutcome = await this.scoreSafely(job, context);
    this.save(job, outcome);
    return outcome;
  }

  private async scoreSafely(job: StoredJob, context: ProfileContext): Promise<JobScoreOutcome> {
    try {
      return await this.scoreJob(job, context);
    } catch {
      // Error text is dropped on purpose: it could echo prompt or job content.
      return this.unscored("internal", "unknown", [], this.previousFailures(job));
    }
  }

  private previousFailures(job: StoredJob): number {
    const previous: ScoreDetails | null = this.codec.parse(job.scoreDetails);
    if (previous === null || !previous.unscored) {
      return 0;
    }
    return previous.failedAttempts;
  }

  // Details without a readable version (or from an older prompt) count as outdated.
  private isOutdated(job: StoredJob, currentVersion: string): boolean {
    const current: number = Number(currentVersion);
    if (Number.isNaN(current)) {
      return false;
    }
    const details: ScoreDetails | null = this.codec.parse(job.scoreDetails);
    if (details === null || details.unscored) {
      return true;
    }
    const stored: number = Number(details.promptVersion);
    return Number.isNaN(stored) || stored < current;
  }

  private save(job: StoredJob, outcome: JobScoreOutcome): void {
    const detailsText: string = this.codec.serialize(outcome.details);
    if (outcome.score !== null && outcome.reason !== null) {
      this.jobs.saveScore(job.id, outcome.score, outcome.reason, detailsText);
      return;
    }
    this.jobs.saveUnscoredNote(job.id, detailsText);
  }

  private combine(
    job: StoredJob,
    output: LlmScoreOutput,
    modelUsed: string,
    promptVersion: string,
    notes: string[],
    context: ProfileContext,
  ): JobScoreOutcome {
    const subScores: SubScores = {
      skillsFit: Math.round(output.skillsFit),
      seniorityFit: Math.round(output.seniorityFit),
      location: this.locationScorer.score(job),
      salary: this.salaryScorer.score(job),
      company: this.companyScorer.score(job.company),
    };
    if (job.descriptionIsSnippet) {
      notes.push(SNIPPET_NOTE);
    }
    const details: ScoredDetails = {
      version: 1,
      unscored: false,
      subScores: subScores,
      matchedSkills: output.matchedSkills,
      missingSkills: output.missingSkills,
      redFlags: output.redFlags,
      roleType: output.roleType,
      snippetOnly: job.descriptionIsSnippet,
      promptVersion: promptVersion,
      modelUsed: modelUsed,
      notes: notes,
    };
    const outcome: JobScoreOutcome = {
      scored: true,
      score: this.calculator.calculate(subScores),
      reason: output.reason,
      details: this.cleaner.apply(details, new GroundingTextBuilder().build(context)),
    };
    return outcome;
  }

  private unscored(
    failure: UnscoredDetails["failure"],
    promptVersion: string,
    notes: string[],
    previousFailures: number,
  ): JobScoreOutcome {
    const failedAttempts: number = previousFailures + 1;
    const details: UnscoredDetails = {
      version: 1,
      unscored: true,
      failure: failure,
      failedAttempts: failedAttempts,
      unscoredFinal: failedAttempts >= MAX_SCORING_ATTEMPTS,
      promptVersion: promptVersion,
      notes: notes,
    };
    const outcome: JobScoreOutcome = { scored: false, score: null, reason: null, details: details };
    return outcome;
  }
}
