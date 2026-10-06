import { ProfileGrounding } from "./ProfileGrounding";
import { TechnologyVocabulary } from "./TechnologyVocabulary";

export type GroundingProblem = "ungrounded_technology" | "ungrounded_number" | "ungrounded_domain" | "internal_label";

// Phrases from our own prompts and data that must never show up in text meant for the reader.
const INTERNAL_LABEL_PATTERNS: RegExp[] = [
  /\bmust-have\b/i,
  /\bnice-to-have\b/i,
  /\bskills\s+matrix\b/i,
  /\bbasedOn\b/i,
  /\bprompt\b/i,
  /\bthe\s+profile\b/i,
  /\bcandidate\s+profile\b/i,
];

// Text from the model may only claim what the profile supports: technologies, numbers written as words and domains.
// Every method answers yes or no for the caller to turn into a problem code; no text is stored.
export class GroundingChecker {
  private readonly profileGrounding: ProfileGrounding = new ProfileGrounding();

  public constructor(
    private readonly vocabulary: TechnologyVocabulary,
    private readonly domainTerms: string[],
  ) {}

  // A technology of the text that the profile lacks, or one that the job's missing skills list names.
  // A missing-skills entry that the profile does contain is ignored: the list is the model's guess and the profile wins.
  public hasUngroundedTechnology(text: string, profileText: string, missingSkills: string[]): boolean {
    const terms: string[] = this.vocabulary.findTerms(text);
    for (let index: number = 0; index < terms.length; index++) {
      if (!this.vocabulary.mentions(profileText, terms[index])) {
        return true;
      }
    }
    for (let index: number = 0; index < missingSkills.length; index++) {
      const skill: string = missingSkills[index];
      if (this.vocabulary.mentions(text, skill) && !this.vocabulary.mentions(profileText, skill)) {
        return true;
      }
    }
    return false;
  }

  public hasUngroundedNumberWord(text: string, profileText: string): boolean {
    return this.profileGrounding.findUngroundedNumberWords(text, profileText).length > 0;
  }

  // ignoredNames (the company name) are removed first: "Contoso Bank" is a name, not a claim about the candidate.
  public hasUngroundedDomain(text: string, profileText: string, ignoredNames: string[]): boolean {
    let cleaned: string = text;
    for (let index: number = 0; index < ignoredNames.length; index++) {
      if (ignoredNames[index].trim().length > 0) {
        cleaned = cleaned.split(ignoredNames[index]).join(" ");
      }
    }
    for (let index: number = 0; index < this.domainTerms.length; index++) {
      const pattern: RegExp = this.domainPattern(this.domainTerms[index]);
      if (pattern.test(cleaned) && !pattern.test(profileText)) {
        return true;
      }
    }
    return false;
  }

  public hasInternalLabel(text: string): boolean {
    for (let index: number = 0; index < INTERNAL_LABEL_PATTERNS.length; index++) {
      if (INTERNAL_LABEL_PATTERNS[index].test(text)) {
        return true;
      }
    }
    return false;
  }

  // All four checks on one short text, for resume tweaks.
  public checkText(text: string, profileText: string, missingSkills: string[], companyName: string): GroundingProblem[] {
    const problems: GroundingProblem[] = [];
    if (this.hasUngroundedTechnology(text, profileText, missingSkills)) {
      problems.push("ungrounded_technology");
    }
    if (this.hasUngroundedNumberWord(text, profileText)) {
      problems.push("ungrounded_number");
    }
    if (this.hasUngroundedDomain(text, profileText, [companyName])) {
      problems.push("ungrounded_domain");
    }
    if (this.hasInternalLabel(text)) {
      problems.push("internal_label");
    }
    return problems;
  }

  // Whole word, case-insensitive; a space or hyphen inside the term matches either ("e-commerce", "e commerce").
  private domainPattern(term: string): RegExp {
    const words: string[] = term.trim().split(/[\s-]+/);
    const escaped: string[] = [];
    for (let index: number = 0; index < words.length; index++) {
      escaped.push(words[index].replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    }
    return new RegExp("(?<![A-Za-z0-9])" + escaped.join("[\\s-]+") + "(?![A-Za-z0-9])", "i");
  }
}
