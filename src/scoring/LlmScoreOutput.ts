import { z } from "zod";
import { TextTrimmer } from "./TextTrimmer";

export const ROLE_TYPES: readonly ["backend", "lead", "architect", "other"] = ["backend", "lead", "architect", "other"];

export const MAX_SKILLS_PER_LIST: number = 8;
export const MAX_SKILL_NAME_LENGTH: number = 80;
export const MAX_RED_FLAGS: number = 3;
export const MAX_RED_FLAG_LENGTH: number = 120;
export const MAX_REASON_LENGTH: number = 200;

const trimmer: TextTrimmer = new TextTrimmer();

// Types stay strict (a number where a string belongs is a validation failure). Sizes are lenient:
// an overlong text is cut at a word boundary and a long list keeps its first items, because the
// model cannot count reliably and a good judgment should not be thrown away over length.
function boundedList(maxItems: number, maxLength: number): z.ZodType<string[]> {
  return z.array(z.string()).transform((items: string[]): string[] => {
    const kept: string[] = [];
    for (let index: number = 0; index < items.length && kept.length < maxItems; index++) {
      const item: string = items[index].trim();
      if (item.length > 0) {
        kept.push(trimmer.trim(item, maxLength));
      }
    }
    return kept;
  });
}

const ReasonSchema: z.ZodType<string> = z.string().trim().min(1).transform(
  (text: string): string => trimmer.trim(text, MAX_REASON_LENGTH),
);

// The only fields the model may fill. Unknown keys are dropped by parsing, so a posting that tries to
// smuggle in a "score" or "approved" field cannot change what we store.
export const LlmScoreOutputSchema = z.object({
  skillsFit: z.number().min(0).max(100),
  seniorityFit: z.number().min(0).max(100),
  matchedSkills: boundedList(MAX_SKILLS_PER_LIST, MAX_SKILL_NAME_LENGTH),
  missingSkills: boundedList(MAX_SKILLS_PER_LIST, MAX_SKILL_NAME_LENGTH),
  redFlags: boundedList(MAX_RED_FLAGS, MAX_RED_FLAG_LENGTH),
  reason: ReasonSchema,
  roleType: z.enum(ROLE_TYPES),
});

export type LlmScoreOutput = z.infer<typeof LlmScoreOutputSchema>;
export type RoleType = LlmScoreOutput["roleType"];
