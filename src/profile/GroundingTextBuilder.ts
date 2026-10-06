import { ProfileContext } from "./ProfileContextProvider";
import { ProfileTextFormatter } from "./ProfileTextFormatter";

// The text that scoring checks skill names against: the approved profile plus the matrix strengths.
// The matrix's must-have, nice-to-have and avoid lists describe what the candidate looks for in a job, not what
// they have, so they are left out.
export class GroundingTextBuilder {
  public build(context: ProfileContext): string {
    const parts: string[] = [new ProfileTextFormatter().format(context.sections)];
    parts.push(context.matrix.strengths.join(", "));
    return parts.join("\n");
  }
}
