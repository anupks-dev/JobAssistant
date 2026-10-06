import { JobOutput, JobOutputRepository } from "../db/repositories/JobOutputRepository";
import { StoredJob } from "../db/repositories/JobRepository";
import { Clock } from "../fetchers/Clock";
import { ProfileContext } from "../profile/ProfileContextProvider";
import { ProfileTextFormatter } from "../profile/ProfileTextFormatter";
import { RankedJob } from "../scoring/RankingService";
import { CoverLetterGenerator, CoverLetterResult } from "./CoverLetterGenerator";
import { CoverLetterValidator, LetterJobContext } from "./CoverLetterValidator";
import { JobMissingSkills } from "./JobMissingSkills";
import { ResumeTweaksCodec, ResumeTweaksOutput } from "./ResumeTweaksOutput";
import { ResumeTweaksGenerator, ResumeTweaksResult } from "./ResumeTweaksGenerator";

export type OutputFailureCode = "letter_api" | "letter_validation" | "tweaks_api" | "tweaks_parse" | "tweaks_validation" | "internal";

export interface OutputSummary {
  considered: number;
  alreadyCached: number;
  generated: number;
  incomplete: number;
  // Sent jobs are never touched, so they are counted here instead.
  skippedSent: number;
  // Top jobs that have a valid letter / valid tweaks after this run, whether new or cached.
  lettersDone: number;
  tweaksDone: number;
  // One code per failed part. Codes only: never model text, job text or profile text.
  failureCodes: OutputFailureCode[];
  // Validation problem codes of the parts that failed (for example ungrounded_technology). Codes only.
  problemCodes: string[];
}

// missing: fill only absent or invalid parts. outdated: also redo parts made with an older prompt version.
// force: redo every part.
export type RegenerationMode = "missing" | "outdated" | "force";

interface StoredVersions {
  coverLetter?: string;
  resumeTweaks?: string;
}

interface PartResult {
  value: string | null;
  failure: OutputFailureCode | null;
  problems: string[];
}

// Generates a letter and tweaks for each top-section job. A part that is already valid is kept unless the mode asks for a redo.
export class TopJobOutputGenerator {
  public constructor(
    private readonly outputs: JobOutputRepository,
    private readonly letters: CoverLetterGenerator,
    private readonly tweaks: ResumeTweaksGenerator,
    private readonly validator: CoverLetterValidator,
    private readonly codec: ResumeTweaksCodec,
    private readonly clock: Clock,
  ) {}

  public async generateForTop(ranked: RankedJob[], context: ProfileContext, mode: RegenerationMode = "missing"): Promise<OutputSummary> {
    const summary: OutputSummary = this.emptySummary();
    for (let index: number = 0; index < ranked.length; index++) {
      if (ranked[index].section !== "top") {
        continue;
      }
      if (ranked[index].job.status === "sent") {
        summary.skippedSent = summary.skippedSent + 1;
        continue;
      }
      summary.considered = summary.considered + 1;
      await this.fillOne(ranked[index].job, context, summary, mode);
    }
    return summary;
  }

  // Forces a new letter and new tweaks for one job in any section. Scores are never touched.
  public async regenerateForJob(job: StoredJob, context: ProfileContext): Promise<OutputSummary> {
    const summary: OutputSummary = this.emptySummary();
    if (job.status === "sent") {
      summary.skippedSent = 1;
      return summary;
    }
    summary.considered = 1;
    await this.fillOne(job, context, summary, "force");
    return summary;
  }

  private emptySummary(): OutputSummary {
    const summary: OutputSummary = {
      considered: 0,
      alreadyCached: 0,
      generated: 0,
      incomplete: 0,
      skippedSent: 0,
      lettersDone: 0,
      tweaksDone: 0,
      failureCodes: [],
      problemCodes: [],
    };
    return summary;
  }

  private async fillOne(job: StoredJob, context: ProfileContext, summary: OutputSummary, mode: RegenerationMode): Promise<void> {
    const existing: JobOutput | null = this.outputs.findByJobId(job.id);
    const profileText: string = new ProfileTextFormatter().format(context.sections);
    const versions: StoredVersions = this.readVersions(existing);
    let letter: string | null = this.validLetter(existing, profileText, job);
    let tweaksJson: string | null = this.validTweaks(existing);
    let letterVersion: string | undefined = letter === null ? undefined : versions.coverLetter;
    let tweaksVersion: string | undefined = tweaksJson === null ? undefined : versions.resumeTweaks;
    const redoLetter: boolean = letter === null
      || mode === "force"
      || (mode === "outdated" && this.isOutdated(versions.coverLetter, this.letters.getPromptVersion()));
    const redoTweaks: boolean = tweaksJson === null
      || mode === "force"
      || (mode === "outdated" && this.isOutdated(versions.resumeTweaks, this.tweaks.getPromptVersion()));
    if (!redoLetter && !redoTweaks) {
      summary.alreadyCached = summary.alreadyCached + 1;
      summary.lettersDone = summary.lettersDone + 1;
      summary.tweaksDone = summary.tweaksDone + 1;
      return;
    }
    // A failed redo keeps the older valid value, so a bad day never deletes a good letter.
    if (redoLetter) {
      const madeLetter: PartResult = await this.makeLetter(job, context);
      if (madeLetter.value !== null) {
        letter = madeLetter.value;
        letterVersion = this.letters.getPromptVersion();
      }
      this.recordFailure(madeLetter, summary);
    }
    if (redoTweaks) {
      const madeTweaks: PartResult = await this.makeTweaks(job, context);
      if (madeTweaks.value !== null) {
        tweaksJson = madeTweaks.value;
        tweaksVersion = this.tweaks.getPromptVersion();
      }
      this.recordFailure(madeTweaks, summary);
    }
    summary.lettersDone = summary.lettersDone + (letter === null ? 0 : 1);
    summary.tweaksDone = summary.tweaksDone + (tweaksJson === null ? 0 : 1);
    const savedVersions: StoredVersions = {};
    if (letterVersion !== undefined) {
      savedVersions.coverLetter = letterVersion;
    }
    if (tweaksVersion !== undefined) {
      savedVersions.resumeTweaks = tweaksVersion;
    }
    this.outputs.save({
      jobId: job.id,
      runId: null,
      coverLetter: letter,
      resumeTweaks: tweaksJson,
      promptVersions: JSON.stringify(savedVersions),
      createdAtIso: this.clock.now().toISOString(),
    });
    if (letter !== null && tweaksJson !== null) {
      summary.generated = summary.generated + 1;
    } else {
      summary.incomplete = summary.incomplete + 1;
    }
  }

  private readVersions(existing: JobOutput | null): StoredVersions {
    if (existing === null) {
      return {};
    }
    try {
      const parsed: StoredVersions = JSON.parse(existing.promptVersions) as StoredVersions;
      return parsed === null || typeof parsed !== "object" ? {} : parsed;
    } catch {
      return {};
    }
  }

  // A missing or unreadable stored version counts as older than any current one.
  private isOutdated(storedVersion: string | undefined, currentVersion: string): boolean {
    if (storedVersion === undefined) {
      return true;
    }
    const stored: number = Number(storedVersion);
    const current: number = Number(currentVersion);
    if (Number.isNaN(stored) || Number.isNaN(current)) {
      return storedVersion !== currentVersion;
    }
    return stored < current;
  }

  // A stored letter that no longer passes validation counts as missing, so it is regenerated.
  private validLetter(existing: JobOutput | null, profileText: string, job: StoredJob): string | null {
    if (existing === null || existing.coverLetter === null) {
      return null;
    }
    if (this.validator.validate(existing.coverLetter, profileText, this.letterJobContext(job)).length > 0) {
      return null;
    }
    return existing.coverLetter;
  }

  private validTweaks(existing: JobOutput | null): string | null {
    if (existing === null) {
      return null;
    }
    if (this.codec.parse(existing.resumeTweaks) === null) {
      return null;
    }
    return existing.resumeTweaks;
  }

  private recordFailure(part: PartResult, summary: OutputSummary): void {
    if (part.failure !== null) {
      summary.failureCodes.push(part.failure);
    }
    for (let index: number = 0; index < part.problems.length; index++) {
      summary.problemCodes.push(part.problems[index]);
    }
  }

  private letterJobContext(job: StoredJob): LetterJobContext {
    return { missingSkills: new JobMissingSkills().of(job), companyName: job.company };
  }

  private async makeLetter(job: StoredJob, context: ProfileContext): Promise<PartResult> {
    try {
      const result: CoverLetterResult = await this.letters.generate(job, context);
      if (result.ok) {
        return { value: result.letter, failure: null, problems: [] };
      }
      return { value: null, failure: result.reason === "api" ? "letter_api" : "letter_validation", problems: result.problems };
    } catch {
      // Error text is dropped on purpose: it could echo prompt or job content.
      return { value: null, failure: "internal", problems: [] };
    }
  }

  private async makeTweaks(job: StoredJob, context: ProfileContext): Promise<PartResult> {
    try {
      const result: ResumeTweaksResult = await this.tweaks.generate(job, context);
      if (!result.ok) {
        const problems: string[] = result.reason === "validation" ? this.tweakProblemCodes(result.details) : [];
        return { value: null, failure: "tweaks_" + result.reason as OutputFailureCode, problems: problems };
      }
      const value: ResumeTweaksOutput = result.value;
      return { value: this.codec.serialize(value), failure: null, problems: [] };
    } catch {
      return { value: null, failure: "internal", problems: [] };
    }
  }

  // Only the known grounding codes are kept; any other details text (schema messages) is dropped.
  private tweakProblemCodes(details: string): string[] {
    const known: string[] = ["basedOn_not_in_profile", "ungrounded_technology", "ungrounded_number", "ungrounded_domain", "internal_label"];
    const codes: string[] = [];
    const parts: string[] = details.split(",");
    for (let index: number = 0; index < parts.length; index++) {
      if (known.indexOf(parts[index]) >= 0) {
        codes.push(parts[index]);
      }
    }
    return codes;
  }
}
