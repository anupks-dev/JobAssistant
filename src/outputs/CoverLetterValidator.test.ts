import { describe, expect, it } from "vitest";
import { CoverLetterProblem, CoverLetterValidator, LetterJobContext } from "./CoverLetterValidator";
import { LetterParagraphs } from "./LetterParagraphs";
import { fakeGroundingChecker, fakePiiGuard, letterWithWords } from "./OutputsTestSupport";

const validator: CoverLetterValidator = new CoverLetterValidator(fakePiiGuard(), fakeGroundingChecker());

const PROFILE: string = "Backend engineer, 2016 to 2024. Led 11 years of delivery. Handled 50,000 concurrent users and cut cost by 80%. Peak load 2.5K requests.";

function check(letter: string): CoverLetterProblem[] {
  return validator.validate(letter, PROFILE);
}

function withLine(extraLine: string): string {
  return "Dear Hiring Team,\nI build services. " + extraLine + "\nSincerely,\n{{NAME}}";
}

describe("CoverLetterValidator", () => {
  it("accepts 199 words", () => {
    const letter: string = letterWithWords(199);
    expect(validator.countWords(letter)).toBe(199);
    expect(check(letter)).toEqual([]);
  });

  it("rejects 201 words", () => {
    const letter: string = letterWithWords(201);
    expect(validator.countWords(letter)).toBe(201);
    expect(check(letter)).toContain<CoverLetterProblem>("too_long");
  });

  it("rejects a missing placeholder", () => {
    const problems: CoverLetterProblem[] = check("Dear Hiring Team,\nI build services.\nSincerely,\nAlex");
    expect(problems).toContain<CoverLetterProblem>("name_placeholder_count");
    expect(problems).toContain<CoverLetterProblem>("sign_off");
  });

  it("rejects a duplicate placeholder", () => {
    const problems: CoverLetterProblem[] = check("Dear Hiring Team,\n{{NAME}} builds services.\nSincerely,\n{{NAME}}");
    expect(problems).toContain<CoverLetterProblem>("name_placeholder_count");
  });

  it("rejects text after the sign-off placeholder", () => {
    expect(check("Dear Hiring Team,\nHello.\n{{NAME}}\nP.S. thanks")).toContain<CoverLetterProblem>("sign_off");
  });

  it("rejects other placeholders", () => {
    expect(check(withLine("Hello {{COMPANY}}."))).toContain<CoverLetterProblem>("other_placeholder");
    expect(check(withLine("Hello [Company]."))).toContain<CoverLetterProblem>("other_placeholder");
  });

  it("rejects links, emails and phone numbers", () => {
    expect(check(withLine("See https://example.com/me."))).toContain<CoverLetterProblem>("url");
    expect(check(withLine("Write to jane@example.com."))).toContain<CoverLetterProblem>("email");
    expect(check(withLine("Call +1 415 555 0100."))).toContain<CoverLetterProblem>("phone");
  });

  it("does not mistake years or ASP.NET for contact details", () => {
    expect(check(withLine("From 2016-2024 I used ASP.NET and Node.js."))).toEqual([]);
  });

  it("rejects a wrong salutation and markdown", () => {
    expect(check("Hello team,\nHi.\n{{NAME}}")).toContain<CoverLetterProblem>("salutation");
    expect(check(withLine("**Bold** claim."))).toContain<CoverLetterProblem>("markdown");
  });

  it("rejects the stored real name", () => {
    expect(check(withLine("I am Jane Q Fakeperson."))).toContain<CoverLetterProblem>("pii");
  });

  it("rejects an empty letter", () => {
    expect(check("   ")).toEqual<CoverLetterProblem[]>(["empty"]);
  });

  it("keeps paragraph breaks valid", () => {
    const letter: string = "Dear Hiring Team,\n\nI build services.\n\nI led delivery.\n\nSincerely,\n{{NAME}}";
    expect(check(letter)).toEqual([]);
  });

  it("accepts numbers that appear in the profile", () => {
    expect(check(withLine("I have 11 years of experience and cut cost by over 80 percent."))).toEqual([]);
  });

  it("rejects a number that is not in the profile", () => {
    expect(check(withLine("I led 25 engineers."))).toContain<CoverLetterProblem>("ungrounded_number");
  });

  it("treats K and comma forms as equal", () => {
    expect(check(withLine("I served 50K concurrent users."))).toEqual([]);
    expect(check(withLine("I served 50,000 concurrent users."))).toEqual([]);
    expect(check(withLine("I handled 2,500 requests."))).toEqual([]);
    expect(check(withLine("I served 60K concurrent users."))).toContain<CoverLetterProblem>("ungrounded_number");
  });
});

// Fake profile text: AWS and Java, no Google Cloud Platform, no domain words, no "eight" or "three".
const GROUNDING_PROFILE: string = "Senior engineer. Java, Spring Boot, PostgreSQL and AWS. Built services for 5 years and led a team of four.";
const JOB: LetterJobContext = { missingSkills: ["Google Cloud Platform", "Kubernetes"], companyName: "Example Labs" };

function letter(paragraphOne: string, paragraphTwo: string): string {
  return "Dear Hiring Team,\n\n" + paragraphOne + "\n\n" + paragraphTwo + "\n\nI would welcome a conversation.\n\nSincerely,\n{{NAME}}";
}

function checkGrounded(text: string): CoverLetterProblem[] {
  return validator.validate(text, GROUNDING_PROFILE, JOB);
}

describe("CoverLetterValidator technology grounding", () => {
  it("accepts a letter that stays within the profile", () => {
    expect(checkGrounded(letter("I am applying for the Java role.", "I built services in Java and Postgres on AWS."))).toEqual([]);
  });

  it("allows paragraph 1 to name a technology from the posting", () => {
    expect(checkGrounded(letter("Your posting asks for Google Cloud Platform and Java.", "I built services in Java on AWS."))).toEqual([]);
  });

  it("rejects the same technology in paragraph 2", () => {
    expect(checkGrounded(letter("I am applying for the Java role.", "I built services in Java on Google Cloud Platform."))).toContain<CoverLetterProblem>("ungrounded_technology");
    expect(checkGrounded(letter("I am applying.", "I built services in Java on GCP."))).toContain<CoverLetterProblem>("ungrounded_technology");
  });

  it("rejects a technology in the closing paragraph", () => {
    const text: string = "Dear Hiring Team,\n\nI am applying.\n\nI built Java services.\n\nI also know Kubernetes.\n\nSincerely,\n{{NAME}}";
    expect(checkGrounded(text)).toContain<CoverLetterProblem>("ungrounded_technology");
  });

  it("does not mistake the sign-off for a paragraph", () => {
    expect(new LetterParagraphs().count(letter("One.", "Two."))).toBe(3);
  });
});

describe("CoverLetterValidator number words", () => {
  it("rejects eight in Java and Spring Boot", () => {
    expect(checkGrounded(letter("I am applying.", "I have eight in Java and Spring Boot."))).toContain<CoverLetterProblem>("ungrounded_number");
  });

  it("rejects under three months", () => {
    expect(checkGrounded(letter("I am applying.", "I shipped it in under three months on AWS."))).toContain<CoverLetterProblem>("ungrounded_number");
  });

  it("accepts a number word that the profile states", () => {
    expect(checkGrounded(letter("I am applying.", "I led a team of four on AWS."))).toEqual([]);
    expect(checkGrounded(letter("I am applying.", "I built services for five years."))).toEqual([]);
  });

  it("lets one of the requirements pass", () => {
    expect(checkGrounded(letter("One of the requirements is Java.", "I built services in Java."))).toEqual([]);
  });
});

describe("CoverLetterValidator domains and labels", () => {
  it("rejects a government platform", () => {
    expect(checkGrounded(letter("I am applying.", "I built a mission-critical government platform in Java."))).toContain<CoverLetterProblem>("ungrounded_domain");
  });

  it("accepts the company name containing a domain word", () => {
    const text: string = letter("I am applying to Contoso Bank.", "I built services in Java.");
    expect(validator.validate(text, GROUNDING_PROFILE, { missingSkills: [], companyName: "Contoso Bank" })).toEqual([]);
  });

  it("rejects internal labels", () => {
    expect(checkGrounded(letter("I match the Must-Have list.", "I built services in Java."))).toContain<CoverLetterProblem>("internal_label");
  });

  it("explains number words in the retry message", () => {
    expect(validator.describe(["ungrounded_number"])).toContain("avoid number words");
  });
});
