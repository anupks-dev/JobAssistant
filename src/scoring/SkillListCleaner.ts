import { TechnologyVocabulary } from "../outputs/TechnologyVocabulary";
import { ScoredDetails } from "./ScoreDetails";

export interface CleanedSkillLists {
  matchedSkills: string[];
  missingSkills: string[];
  changed: boolean;
}

// Fixes the model's skill lists with facts from the profile. Only vocabulary terms are judged: a skill the
// vocabulary does not know (Code Review, System Design, ...) is never removed, because plain text matching
// cannot tell "Technical Spec Docs" from "Technical Specification documentation".
export class SkillListCleaner {
  public constructor(private readonly vocabulary: TechnologyVocabulary) {}

  public clean(details: ScoredDetails, profileText: string): CleanedSkillLists {
    const missing: string[] = [];
    for (let index: number = 0; index < details.missingSkills.length; index++) {
      const skill: string = details.missingSkills[index];
      // A technology the profile has is not missing.
      if (!(this.vocabulary.isKnown(skill) && this.vocabulary.mentions(profileText, skill))) {
        missing.push(skill);
      }
    }
    const matched: string[] = [];
    for (let index: number = 0; index < details.matchedSkills.length; index++) {
      const skill: string = details.matchedSkills[index];
      // A technology the profile lacks cannot be a match.
      if (!(this.vocabulary.isKnown(skill) && !this.vocabulary.mentions(profileText, skill))) {
        matched.push(skill);
      }
    }
    const changed: boolean = missing.length !== details.missingSkills.length || matched.length !== details.matchedSkills.length;
    const cleaned: CleanedSkillLists = { matchedSkills: matched, missingSkills: missing, changed: changed };
    return cleaned;
  }

  public apply(details: ScoredDetails, profileText: string): ScoredDetails {
    const cleaned: CleanedSkillLists = this.clean(details, profileText);
    const result: ScoredDetails = { ...details, matchedSkills: cleaned.matchedSkills, missingSkills: cleaned.missingSkills };
    return result;
  }
}
