import { JobOutput } from "../../db/repositories/JobOutputRepository";
import { StoredJob } from "../../db/repositories/JobRepository";
import { LetterParagraphs } from "../../outputs/LetterParagraphs";
import { ResumeTweak, ResumeTweaksCodec, ResumeTweaksOutput } from "../../outputs/ResumeTweaksOutput";
import { ScoreDetails } from "../ScoreDetails";

// Formats one job's stored score. Shows what Stage 3 saved, plus a letter or tweaks if Stage 4 has stored any, with each tweak on its own line.
export class ScoreDetailPrinter {
  public lines(job: StoredJob, sourceName: string, details: ScoreDetails | null, output: JobOutput | null): string[] {
    const lines: string[] = [];
    lines.push("Job " + String(job.id) + ": " + job.company + " | " + job.title);
    lines.push("Source: " + sourceName);
    lines.push("URL: " + job.url);
    lines.push("Status: " + job.status);
    if (job.score === null) {
      lines.push("Score: not scored yet");
    } else {
      lines.push("Score: " + String(job.score));
      lines.push("Reason: " + (job.scoreReason ?? ""));
    }
    this.addDetails(lines, details);
    this.addOutput(lines, output);
    return lines;
  }

  private addDetails(lines: string[], details: ScoreDetails | null): void {
    if (details === null) {
      lines.push("Details: none");
      return;
    }
    if (details.unscored) {
      lines.push("Unscored: " + details.failure + " (prompt v" + details.promptVersion + ")");
      lines.push("Notes: " + this.listOrNone(details.notes));
      return;
    }
    const sub: ScoreDetails & { unscored: false } = details;
    lines.push("Sub-scores: skills " + String(sub.subScores.skillsFit) + ", seniority " + String(sub.subScores.seniorityFit)
      + ", location " + String(sub.subScores.location) + ", salary " + String(sub.subScores.salary)
      + ", company " + String(sub.subScores.company));
    lines.push("Role type: " + sub.roleType);
    lines.push("Matched skills: " + this.listOrNone(sub.matchedSkills));
    lines.push("Missing skills: " + this.listOrNone(sub.missingSkills));
    lines.push("Red flags: " + this.listOrNone(sub.redFlags));
    lines.push("Notes: " + this.listOrNone(sub.notes));
    lines.push("Prompt v" + sub.promptVersion + ", model " + sub.modelUsed);
  }

  private addOutput(lines: string[], output: JobOutput | null): void {
    if (output === null) {
      lines.push("Cover letter and resume tweaks: not generated yet");
      return;
    }
    this.addCoverLetter(lines, output.coverLetter);
    this.addTweaks(lines, output.resumeTweaks);
  }

  private addCoverLetter(lines: string[], letter: string | null): void {
    if (letter === null) {
      lines.push("Cover letter: (none)");
      return;
    }
    const words: number = letter.trim().split(/\s+/).length;
    const paragraphs: number = new LetterParagraphs().count(letter);
    lines.push("Cover letter (" + String(words) + " words, " + String(paragraphs) + " paragraphs, placeholders left as is):");
    // One entry per line, so the blank lines between paragraphs stay as empty entries.
    const letterLines: string[] = letter.trim().split(/\r?\n/);
    for (let index: number = 0; index < letterLines.length; index++) {
      lines.push(letterLines[index]);
    }
  }

  private addTweaks(lines: string[], tweaksJson: string | null): void {
    const tweaks: ResumeTweaksOutput | null = new ResumeTweaksCodec().parse(tweaksJson);
    if (tweaks === null) {
      lines.push("Resume tweaks: (none)");
      return;
    }
    lines.push("Resume tweaks:");
    for (let index: number = 0; index < tweaks.tweaks.length; index++) {
      const tweak: ResumeTweak = tweaks.tweaks[index];
      lines.push(String(index + 1) + ". [" + tweak.section + "] " + tweak.suggestion);
      lines.push("   Why: " + tweak.reason);
      if (tweak.basedOn !== undefined) {
        lines.push("   Based on: " + tweak.basedOn);
      }
    }
  }

  private listOrNone(entries: string[]): string {
    if (entries.length === 0) {
      return "(none)";
    }
    return entries.join("; ");
  }
}
