import { existsSync, readFileSync } from "fs";
import { z } from "zod";

const RedactionCountsSchema = z.object({
  name: z.number(),
  email: z.number(),
  phone: z.number(),
  url: z.number(),
  address: z.number(),
});

const ProfileSectionsSchema = z.object({
  summary: z.string(),
  skills: z.string(),
  experience: z.string(),
  education: z.string(),
  projects: z.string(),
  certifications: z.string(),
  other: z.string(),
});

export const ProfileSchema = z.object({
  version: z.literal(1),
  approved: z.boolean(),
  approvedAt: z.string().nullable(),
  sourceFileHash: z.string(),
  builtAt: z.string(),
  sections: ProfileSectionsSchema,
  redactionCounts: RedactionCountsSchema,
});

export type Profile = z.infer<typeof ProfileSchema>;

// Reads profile.json for the rest of the app. Unapproved profiles are refused.
export class ProfileLoader {
  public constructor(private readonly profilePath: string) {}

  public load(): Profile {
    const profile: Profile = this.parse();
    if (!profile.approved) {
      throw new Error("Profile is not approved. Review data/profile.redacted.txt, then run pnpm profile:approve.");
    }
    return profile;
  }

  // Schema check only. The approve command has to open a profile that is not approved yet.
  public parse(): Profile {
    if (!existsSync(this.profilePath)) {
      throw new Error("Profile file is missing.");
    }
    const fileText: string = readFileSync(this.profilePath, "utf-8");
    return this.parseText(fileText);
  }

  private parseText(fileText: string): Profile {
    const raw: unknown = this.readJson(fileText);
    const parsed: z.ZodSafeParseResult<Profile> = ProfileSchema.safeParse(raw);
    if (!parsed.success) {
      throw new Error("Profile file does not match the expected schema.");
    }
    return parsed.data;
  }

  private readJson(fileText: string): unknown {
    try {
      const raw: unknown = JSON.parse(fileText) as unknown;
      return raw;
    } catch {
      throw new Error("Profile file is not valid JSON.");
    }
  }
}
