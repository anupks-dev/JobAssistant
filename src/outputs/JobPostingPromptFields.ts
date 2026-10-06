import { StoredJob } from "../db/repositories/JobRepository";
import { JobTextSanitizer, SanitizedJobText } from "../llm/JobTextSanitizer";
import { ProfileContext } from "../profile/ProfileContextProvider";
import { ProfileTextFormatter } from "../profile/ProfileTextFormatter";
import { SkillsMatrixFormatter } from "../profile/SkillsMatrixFormatter";
import { JobMissingSkills } from "./JobMissingSkills";

export interface OutputPromptFields {
  placeholders: Record<string, string>;
  injectionSuspected: boolean;
}

const PROFILE_CHAR_LIMIT: number = 8000;

// Builds the placeholder values shared by the cover letter and resume tweaks prompts.
// Salary is left out on purpose: neither output may mention it.
export class JobPostingPromptFields {
  public constructor(private readonly sanitizer: JobTextSanitizer) {}

  public build(job: StoredJob, context: ProfileContext): OutputPromptFields {
    const title: SanitizedJobText = this.sanitizer.sanitize(job.title);
    const company: SanitizedJobText = this.sanitizer.sanitize(job.company);
    const location: SanitizedJobText = this.sanitizer.sanitize(job.location);
    const description: SanitizedJobText = this.sanitizer.sanitize(job.description);
    const profileText: string = new ProfileTextFormatter().format(context.sections).slice(0, PROFILE_CHAR_LIMIT);
    const placeholders: Record<string, string> = {
      descriptionNote: this.describeSnippet(job),
      matrix: this.stripTemplateCharacters(new SkillsMatrixFormatter().format(context.matrix), true),
      profile: this.stripTemplateCharacters(profileText, true),
      title: this.stripTemplateCharacters(title.text, false),
      company: this.stripTemplateCharacters(company.text, false),
      location: this.stripTemplateCharacters(location.text, false),
      description: this.stripTemplateCharacters(description.text, false),
      missingSkills: this.describeMissingSkills(job),
    };
    const suspected: boolean = title.injectionSuspected
      || company.injectionSuspected
      || location.injectionSuspected
      || description.injectionSuspected;
    const fields: OutputPromptFields = { placeholders: placeholders, injectionSuspected: suspected };
    return fields;
  }

  // Skill names come from the scoring step, never from free text; they are still stripped like any other value.
  private describeMissingSkills(job: StoredJob): string {
    const skills: string[] = new JobMissingSkills().of(job);
    if (skills.length === 0) {
      return "(none known)";
    }
    return this.stripTemplateCharacters(skills.join(", "), false);
  }

  private describeSnippet(job: StoredJob): string {
    if (job.descriptionIsSnippet) {
      return "- The job description below is only a short excerpt. Do not assume details that are not in it.";
    }
    return "";
  }

  // Angle brackets could fake the closing delimiter and braces would look like our placeholders.
  // Profile text keeps its line breaks; job text is flattened to one line.
  private stripTemplateCharacters(text: string, keepLineBreaks: boolean): string {
    const withoutMarkers: string = text.replace(/[<>{}]/g, " ");
    if (keepLineBreaks) {
      return withoutMarkers.replace(/[ \t]+/g, " ").trim();
    }
    return withoutMarkers.replace(/\s+/g, " ").trim();
  }
}
