import { z } from "zod";
import { ROLE_TYPES } from "./LlmScoreOutput";

export const INJECTION_NOTE: string = "injection_suspected";
export const SNIPPET_NOTE: string = "snippet_only";
// After this many failed scoring attempts a job is marked unscoredFinal and no longer retried.
export const MAX_SCORING_ATTEMPTS: number = 3;

const SubScoresSchema = z.object({
  skillsFit: z.number(),
  seniorityFit: z.number(),
  location: z.number(),
  salary: z.number(),
  company: z.number(),
});

const ScoredDetailsSchema = z.object({
  version: z.literal(1),
  unscored: z.literal(false),
  subScores: SubScoresSchema,
  matchedSkills: z.array(z.string()),
  missingSkills: z.array(z.string()),
  redFlags: z.array(z.string()),
  roleType: z.enum(ROLE_TYPES),
  snippetOnly: z.boolean(),
  promptVersion: z.string(),
  modelUsed: z.string(),
  notes: z.array(z.string()),
});

const UnscoredDetailsSchema = z.object({
  version: z.literal(1),
  unscored: z.literal(true),
  failure: z.enum(["api", "parse", "validation", "internal"]),
  // Rows written before the retry cap existed have neither field, so they read as zero attempts, not final.
  failedAttempts: z.number().int().min(0).default(0),
  unscoredFinal: z.boolean().default(false),
  promptVersion: z.string(),
  notes: z.array(z.string()),
});

const ScoreDetailsSchema = z.discriminatedUnion("unscored", [ScoredDetailsSchema, UnscoredDetailsSchema]);

export type SubScores = z.infer<typeof SubScoresSchema>;
export type ScoredDetails = z.infer<typeof ScoredDetailsSchema>;
export type UnscoredDetails = z.infer<typeof UnscoredDetailsSchema>;
export type ScoreDetails = z.infer<typeof ScoreDetailsSchema>;

// Details hold sub-scores, skill names and codes only. Never prompts, job text or model errors.
export class ScoreDetailsCodec {
  public serialize(details: ScoreDetails): string {
    return JSON.stringify(details);
  }

  public parse(text: string | null): ScoreDetails | null {
    if (text === null) {
      return null;
    }
    let raw: unknown;
    try {
      raw = JSON.parse(text) as unknown;
    } catch {
      return null;
    }
    const parsed: z.ZodSafeParseResult<ScoreDetails> = ScoreDetailsSchema.safeParse(raw);
    if (!parsed.success) {
      return null;
    }
    return parsed.data;
  }
}
