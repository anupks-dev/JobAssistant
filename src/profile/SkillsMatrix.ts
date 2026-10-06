import { z } from "zod";

const EntryListSchema = z.array(z.string().trim().min(1));

// The fields the model is asked to fill. Everything else in the matrix is set by our code.
export const SkillsMatrixContentSchema = z.object({
  yearsExperience: z.number().min(0),
  currentLevel: z.string().trim().min(1),
  targetRoles: EntryListSchema,
  mustHave: EntryListSchema,
  niceToHave: EntryListSchema,
  avoid: EntryListSchema,
  strengths: EntryListSchema,
});

export const SkillsMatrixSchema = SkillsMatrixContentSchema.extend({
  version: z.literal(1),
  approved: z.boolean(),
  approvedAt: z.string().nullable(),
  profileHash: z.string(),
});

export type SkillsMatrixContent = z.infer<typeof SkillsMatrixContentSchema>;
export type SkillsMatrix = z.infer<typeof SkillsMatrixSchema>;
