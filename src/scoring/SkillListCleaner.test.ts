import { describe, expect, it } from "vitest";
import { realVocabulary } from "../outputs/OutputsTestSupport";
import { ScoredDetails } from "./ScoreDetails";
import { SkillListCleaner } from "./SkillListCleaner";

const cleaner: SkillListCleaner = new SkillListCleaner(realVocabulary());
// Fake profile text.
const PROFILE: string = "Senior engineer. Java, PostgreSQL, AWS. Wrote Technical Specification documentation. Led code reviews.";

function details(matched: string[], missing: string[]): ScoredDetails {
  const result: ScoredDetails = {
    version: 1,
    unscored: false,
    subScores: { skillsFit: 70, seniorityFit: 70, location: 100, salary: 50, company: 40 },
    matchedSkills: matched,
    missingSkills: missing,
    redFlags: [],
    roleType: "backend",
    snippetOnly: false,
    promptVersion: "2",
    modelUsed: "fake/model",
    notes: [],
  };
  return result;
}

describe("SkillListCleaner", () => {
  it("removes Postgres from missing when the profile says PostgreSQL", () => {
    const cleaned: ScoredDetails = cleaner.apply(details([], ["Postgres", "Kubernetes"]), PROFILE);
    expect(cleaned.missingSkills).toEqual(["Kubernetes"]);
  });

  it("removes a matched technology that the profile lacks, aliases included", () => {
    const cleaned: ScoredDetails = cleaner.apply(details(["Java", "GCP", "Postgres"], []), PROFILE);
    expect(cleaned.matchedSkills).toEqual(["Java", "Postgres"]);
  });

  it("never touches terms that are not in the vocabulary", () => {
    const soft: string[] = ["Agile-Scrum", "Code Review", "Design Patterns", "System Design", "Technical Spec Docs"];
    const cleaned: ScoredDetails = cleaner.apply(details(soft, soft), PROFILE);
    expect(cleaned.matchedSkills).toEqual(soft);
    expect(cleaned.missingSkills).toEqual(soft);
  });

  it("reports whether anything changed and leaves the input alone", () => {
    const original: ScoredDetails = details(["GCP"], ["Postgres"]);
    expect(cleaner.clean(original, PROFILE).changed).toBe(true);
    expect(cleaner.clean(details(["Java"], ["Kubernetes"]), PROFILE).changed).toBe(false);
    expect(original.matchedSkills).toEqual(["GCP"]);
  });
});
