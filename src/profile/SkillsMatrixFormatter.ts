import { SkillsMatrix } from "./SkillsMatrix";

// Turns the approved matrix into prompt text. Shared by scoring, cover letters and resume tweaks.
export class SkillsMatrixFormatter {
  public format(matrix: SkillsMatrix): string {
    const lines: string[] = [];
    lines.push("Years of experience: " + String(matrix.yearsExperience));
    lines.push("Level: " + matrix.currentLevel);
    lines.push("Target roles: " + this.joinOrNone(matrix.targetRoles));
    lines.push("Must have: " + this.joinOrNone(matrix.mustHave));
    lines.push("Nice to have: " + this.joinOrNone(matrix.niceToHave));
    lines.push("Avoid: " + this.joinOrNone(matrix.avoid));
    lines.push("Strengths: " + this.joinOrNone(matrix.strengths));
    return lines.join("\n");
  }

  private joinOrNone(entries: string[]): string {
    if (entries.length === 0) {
      return "(none)";
    }
    return entries.join(", ");
  }
}
