import { PiiGuard } from "../llm/PiiGuard";
import { GroundingChecker } from "./GroundingChecker";
import { LetterParagraphs } from "./LetterParagraphs";
import { NAME_PLACEHOLDER, SALUTATION } from "./LetterMarkers";
import { ProfileGrounding } from "./ProfileGrounding";

export { NAME_PLACEHOLDER, SALUTATION };

export type CoverLetterProblem =
  | "empty"
  | "too_long"
  | "salutation"
  | "name_placeholder_count"
  | "sign_off"
  | "other_placeholder"
  | "url"
  | "email"
  | "phone"
  | "markdown"
  | "pii"
  | "ungrounded_number"
  | "ungrounded_technology"
  | "ungrounded_domain"
  | "internal_label";

export const MAX_COVER_LETTER_WORDS: number = 200;

const PROBLEM_DESCRIPTIONS: Record<CoverLetterProblem, string> = {
  empty: "The letter was empty.",
  too_long: "The letter was too long. Shorten it to fewer than 200 words in total.",
  salutation: "The letter must start with the line: Dear Hiring Team,",
  name_placeholder_count: "The text {{NAME}} must appear exactly once.",
  sign_off: "The letter must end with {{NAME}} and nothing after it.",
  other_placeholder: "Remove every placeholder or square bracket other than {{NAME}}.",
  url: "Remove links.",
  email: "Remove email addresses.",
  phone: "Remove phone numbers.",
  markdown: "Use plain text only, with no markdown, bullet points or code fences.",
  pii: "Remove personal data.",
  ungrounded_number: "Use only numbers that appear in the candidate profile. Remove every other number, "
    + "and avoid number words (such as eight or three) that are not in the profile.",
  ungrounded_technology: "From the second paragraph on, name only technologies that appear in the candidate profile. "
    + "Never name a technology the candidate lacks.",
  ungrounded_domain: "Do not name an industry or domain (such as financial, banking or government) that the candidate profile does not state.",
  internal_label: "Do not use internal labels such as Must-Have, Nice-to-Have, skills matrix, profile or prompt.",
};

// What the validator needs to know about the job besides the profile.
export interface LetterJobContext {
  // Skills the job asks for that the candidate lacks; none of them may be named after the first paragraph.
  missingSkills: string[];
  // Left out of the domain check, so a company called "Contoso Bank" can be named.
  companyName: string;
}

export const NO_JOB_CONTEXT: LetterJobContext = { missingSkills: [], companyName: "" };

// Checks a letter before it is stored. Returns problem codes only, never the letter text.
// Blank lines between paragraphs are allowed; markdown, bullets and bracket placeholders are not.
export class CoverLetterValidator {
  private readonly grounding: ProfileGrounding = new ProfileGrounding();
  private readonly paragraphs: LetterParagraphs = new LetterParagraphs();

  public constructor(
    private readonly piiGuard: PiiGuard,
    private readonly checker: GroundingChecker,
    private readonly maxWords: number = MAX_COVER_LETTER_WORDS,
  ) {}

  // profileText is the full profile the letter must stay within; every number in the letter has to appear in it.
  public validate(letter: string, profileText: string, job: LetterJobContext = NO_JOB_CONTEXT): CoverLetterProblem[] {
    const problems: CoverLetterProblem[] = [];
    const trimmed: string = letter.trim();
    if (trimmed.length === 0) {
      problems.push("empty");
      return problems;
    }
    if (this.countWords(trimmed) > this.maxWords) {
      problems.push("too_long");
    }
    if (!trimmed.startsWith(SALUTATION)) {
      problems.push("salutation");
    }
    this.checkName(trimmed, problems);
    this.checkPlaceholders(trimmed, problems);
    this.checkContactDetails(trimmed, problems);
    if (this.hasMarkdown(trimmed)) {
      problems.push("markdown");
    }
    if (this.leaksPii(trimmed)) {
      problems.push("pii");
    }
    this.checkGrounding(trimmed, profileText, job, problems);
    return problems;
  }

  // Numbers (digits and words), domains and labels apply to the whole letter. Technologies apply from the second
  // paragraph on, because the first one may repeat what the job posting asks for.
  private checkGrounding(letter: string, profileText: string, job: LetterJobContext, problems: CoverLetterProblem[]): void {
    if (this.grounding.findUngroundedNumbers(letter, profileText).length > 0
      || this.checker.hasUngroundedNumberWord(letter, profileText)) {
      problems.push("ungrounded_number");
    }
    if (this.hasUngroundedTechnologyAfterFirstParagraph(letter, profileText, job.missingSkills)) {
      problems.push("ungrounded_technology");
    }
    if (this.checker.hasUngroundedDomain(letter, profileText, [job.companyName])) {
      problems.push("ungrounded_domain");
    }
    if (this.checker.hasInternalLabel(letter)) {
      problems.push("internal_label");
    }
  }

  private hasUngroundedTechnologyAfterFirstParagraph(letter: string, profileText: string, missingSkills: string[]): boolean {
    const body: string[] = this.paragraphs.split(letter);
    for (let index: number = 1; index < body.length; index++) {
      if (this.checker.hasUngroundedTechnology(body[index], profileText, missingSkills)) {
        return true;
      }
    }
    return false;
  }

  public countWords(text: string): number {
    const words: string[] = text.trim().split(/\s+/);
    if (words.length === 1 && words[0].length === 0) {
      return 0;
    }
    return words.length;
  }

  public describe(problems: CoverLetterProblem[]): string {
    const sentences: string[] = [];
    for (let index: number = 0; index < problems.length; index++) {
      sentences.push(PROBLEM_DESCRIPTIONS[problems[index]]);
    }
    return sentences.join(" ");
  }

  private checkName(text: string, problems: CoverLetterProblem[]): void {
    const occurrences: number = text.split(NAME_PLACEHOLDER).length - 1;
    if (occurrences !== 1) {
      problems.push("name_placeholder_count");
    }
    if (!text.endsWith(NAME_PLACEHOLDER)) {
      problems.push("sign_off");
    }
  }

  private checkPlaceholders(text: string, problems: CoverLetterProblem[]): void {
    const withoutName: string = text.split(NAME_PLACEHOLDER).join("");
    if (/[{}]|\[[^\]]*\]/.test(withoutName)) {
      problems.push("other_placeholder");
    }
  }

  private checkContactDetails(text: string, problems: CoverLetterProblem[]): void {
    if (/https?:\/\/|www\.|\b[a-z0-9-]+\.(com|org|io)\b/i.test(text)) {
      problems.push("url");
    }
    if (/[^\s@]+@[^\s@]+\.[^\s@]+/.test(text)) {
      problems.push("email");
    }
    if (this.hasPhoneNumber(text)) {
      problems.push("phone");
    }
  }

  // Any run of digits and phone punctuation holding nine or more digits counts as a phone number.
  private hasPhoneNumber(text: string): boolean {
    const candidates: RegExpMatchArray | null = text.match(/\+?\d[\d\s().-]{7,}\d/g);
    if (candidates === null) {
      return false;
    }
    for (let index: number = 0; index < candidates.length; index++) {
      const digits: string = candidates[index].replace(/\D/g, "");
      if (digits.length >= 9) {
        return true;
      }
    }
    return false;
  }

  private hasMarkdown(text: string): boolean {
    return /```|\*\*|__|^\s{0,3}#{1,6}\s|^\s*[-*•]\s/m.test(text);
  }

  private leaksPii(text: string): boolean {
    try {
      this.piiGuard.assertClean(text);
      return false;
    } catch {
      return true;
    }
  }
}
