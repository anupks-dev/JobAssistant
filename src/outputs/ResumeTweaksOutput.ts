import { z } from "zod";

export const MIN_TWEAKS: number = 3;
export const MAX_TWEAKS: number = 5;
export const MAX_TWEAK_WORDS: number = 25;
export const MAX_BASED_ON_WORDS: number = 12;

function countWords(text: string): number {
  const trimmed: string = text.trim();
  if (trimmed.length === 0) {
    return 0;
  }
  return trimmed.split(/\s+/).length;
}

// Suggestions are stored and shown as plain text, so links, emails and placeholders are refused.
function isPlainText(text: string): boolean {
  return !/https?:\/\/|www\.|@|[{}]/i.test(text);
}

const BasedOnSchema = z.string().trim().min(1)
  .refine((text: string): boolean => countWords(text) <= MAX_BASED_ON_WORDS, "basedOn must be at most 12 words")
  .refine(isPlainText, "basedOn must be plain text");

const TweakFields = {
  section: z.string().trim().min(1).max(60).refine(isPlainText, "section must be plain text"),
  suggestion: z.string().trim().min(1)
    .refine((text: string): boolean => countWords(text) <= MAX_TWEAK_WORDS, "suggestion must be at most 25 words")
    .refine(isPlainText, "suggestion must be plain text"),
  reason: z.string().trim().min(1)
    .refine((text: string): boolean => countWords(text) <= MAX_TWEAK_WORDS, "reason must be at most 25 words")
    .refine(isPlainText, "reason must be plain text"),
};

// What the model must return: basedOn is required.
const ResumeTweakSchema = z.object({ ...TweakFields, basedOn: BasedOnSchema });

// What may be read back from storage: rows saved before basedOn existed have none.
const StoredResumeTweakSchema = z.object({ ...TweakFields, basedOn: BasedOnSchema.optional() });

// Unknown keys are dropped by parsing.
export const ResumeTweaksOutputSchema = z.object({
  tweaks: z.array(ResumeTweakSchema).min(MIN_TWEAKS).max(MAX_TWEAKS),
});

export const StoredResumeTweaksSchema = z.object({
  tweaks: z.array(StoredResumeTweakSchema).min(MIN_TWEAKS).max(MAX_TWEAKS),
});

export type ResumeTweaksOutput = z.infer<typeof StoredResumeTweaksSchema>;
export type ResumeTweak = ResumeTweaksOutput["tweaks"][number];

// Reads and writes the JSON text kept in job_outputs.resume_tweaks.
export class ResumeTweaksCodec {
  public serialize(output: ResumeTweaksOutput): string {
    return JSON.stringify(output);
  }

  public parse(text: string | null): ResumeTweaksOutput | null {
    if (text === null) {
      return null;
    }
    try {
      const parsed: z.ZodSafeParseResult<ResumeTweaksOutput> = StoredResumeTweaksSchema.safeParse(JSON.parse(text) as unknown);
      if (!parsed.success) {
        return null;
      }
      return parsed.data;
    } catch {
      return null;
    }
  }
}
