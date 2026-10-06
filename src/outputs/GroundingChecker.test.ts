import { describe, expect, it } from "vitest";
import { GroundingChecker, GroundingProblem } from "./GroundingChecker";
import { fakeGroundingChecker } from "./OutputsTestSupport";

const checker: GroundingChecker = fakeGroundingChecker();
// Fake profile text: has AWS, Java and PostgreSQL, but no Google Cloud Platform.
const PROFILE: string = "Senior engineer. Java, Spring Boot, PostgreSQL, AWS (Lambda, S3). Led a team of four on an e-commerce checkout.";

describe("GroundingChecker technologies", () => {
  it("accepts technologies of the profile, also under another alias", () => {
    expect(checker.hasUngroundedTechnology("Strong Java and Postgres experience on Amazon Web Services.", PROFILE, [])).toBe(false);
  });

  it("flags a technology that the profile lacks", () => {
    expect(checker.hasUngroundedTechnology("Move Java, Google Cloud Platform, PostgreSQL to the top.", PROFILE, [])).toBe(true);
    expect(checker.hasUngroundedTechnology("Lead with Java, GCP, Postgres expertise.", PROFILE, [])).toBe(true);
  });

  it("flags a skill from the missing list", () => {
    expect(checker.hasUngroundedTechnology("Stress your delivery experience.", PROFILE, ["Design"])).toBe(false);
    expect(checker.hasUngroundedTechnology("Mention Terraform here.", PROFILE, ["Terraform"])).toBe(true);
  });

  it("matches non-vocabulary missing skills as plain text, and ignores ones that the profile has", () => {
    expect(checker.hasUngroundedTechnology("Show your Event Sourcing work.", PROFILE, ["Event Sourcing"])).toBe(true);
    expect(checker.hasUngroundedTechnology("Show your checkout work.", PROFILE, ["e-commerce"])).toBe(false);
    expect(checker.hasUngroundedTechnology("Show your e-commerce work.", PROFILE, ["e-commerce"])).toBe(false);
  });
});

describe("GroundingChecker domains", () => {
  it("flags a domain that the profile does not state", () => {
    expect(checker.hasUngroundedDomain("A mission-critical government platform.", PROFILE, [])).toBe(true);
    expect(checker.hasUngroundedDomain("It aligns with financial processes.", PROFILE, [])).toBe(true);
  });

  it("accepts a domain that the profile states", () => {
    expect(checker.hasUngroundedDomain("Experience in e-commerce checkout.", PROFILE, [])).toBe(false);
  });

  it("does not count the company name", () => {
    expect(checker.hasUngroundedDomain("I am applying to Contoso Bank.", PROFILE, ["Contoso Bank"])).toBe(false);
    expect(checker.hasUngroundedDomain("I am applying to Contoso Bank.", PROFILE, [])).toBe(true);
  });
});

describe("GroundingChecker internal labels", () => {
  it("rejects the internal labels", () => {
    expect(checker.hasInternalLabel("Aligns directly with job posting Must-Have list")).toBe(true);
    expect(checker.hasInternalLabel("Matches the nice-to-have items")).toBe(true);
    expect(checker.hasInternalLabel("Listed in the Skills Matrix")).toBe(true);
    expect(checker.hasInternalLabel("See basedOn")).toBe(true);
    expect(checker.hasInternalLabel("As the prompt says")).toBe(true);
    expect(checker.hasInternalLabel("Stated in the profile")).toBe(true);
    expect(checker.hasInternalLabel("Your Candidate  Profile shows")).toBe(true);
  });

  it("allows the bare word profile and ordinary phrases", () => {
    expect(checker.hasInternalLabel("A strong professional profile in backend work.")).toBe(false);
    expect(checker.hasInternalLabel("The posting says you must have Java.")).toBe(false);
  });
});

describe("GroundingChecker.checkText", () => {
  it("lists every problem found", () => {
    const problems: GroundingProblem[] = checker.checkText(
      "Move GCP to the top; eight years in government work, per the profile.",
      PROFILE,
      [],
      "Example Labs",
    );
    expect(problems).toEqual(["ungrounded_technology", "ungrounded_number", "ungrounded_domain", "internal_label"]);
  });
});
