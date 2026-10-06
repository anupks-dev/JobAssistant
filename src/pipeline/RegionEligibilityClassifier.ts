import { RegionEligibility } from "../db/repositories/JobRepository";
import { PhraseMatcher } from "./PhraseMatcher";

export interface RegionAssessment {
  eligibility: RegionEligibility;
  matchedTerm: string | null;
  namedPlace: boolean;
  onsiteWithoutPlace: boolean;
}

interface RestrictionHit {
  index: number;
  length: number;
  label: string;
}

const DESCRIPTION_LIMIT: number = 1500;
const NEARBY_WINDOW: number = 80;
const NOTE_LIMIT: number = 40;
const SEPARATORS: string = "|/()-,;";

const ONSITE_WORDS: string[] = [
  "onsite",
  "on-site",
  "on site",
  "in office",
  "in-office",
  "in person",
  "in-person",
  "hybrid",
];

const REMOTE_WORDS: string[] = ["remote", "remotely", "wfh", "work from home", "distributed"];

// Built-in phrases. Config terms are never turned into regular expressions.
const DESCRIPTION_PATTERNS: { label: string; pattern: RegExp }[] = [
  { label: "must be located in", pattern: /must be located in/i },
  { label: "must reside in", pattern: /must reside in/i },
  { label: "must live in", pattern: /must live in/i },
  { label: "authorized to work in", pattern: /authorized to work in the (?:US|USA|UK|EU|Canada)/i },
  { label: "residents only", pattern: /\b(?:US|USA|UK|EU|Canada)\s+(?:only|residents only|based only)\b/i },
  { label: "only candidates", pattern: /only candidates (?:located|based) in/i },
  { label: "time zone", pattern: /\b(?:EST|PST|CST|CET|GMT)\b[^a-zA-Z]{0,40}(?:overlap|hours)\b/i },
  { label: "time zone", pattern: /\b(?:overlap|hours)\b[^a-zA-Z]{0,40}\b(?:EST|PST|CST|CET)\b/i },
];

export class RegionEligibilityClassifier {
  public constructor(private readonly phrases: PhraseMatcher) {}

  public classify(
    location: string,
    description: string,
    openTerms: string[],
    restrictedTerms: string[],
    genericWords: string[],
  ): RegionAssessment {
    if (this.hasOpenTerm(location, openTerms)) {
      const open: RegionAssessment = { eligibility: "open", matchedTerm: null, namedPlace: false, onsiteWithoutPlace: false };
      return open;
    }
    if (this.isOnsiteWithoutRemote(location)) {
      const onsite: RegionAssessment = {
        eligibility: "restricted",
        matchedTerm: null,
        namedPlace: false,
        onsiteWithoutPlace: true,
      };
      return onsite;
    }
    const leftover: string = this.leftoverPlace(location, genericWords);
    if (this.letterCount(leftover) >= 2) {
      const named: RegionAssessment = {
        eligibility: "restricted",
        matchedTerm: leftover.slice(0, NOTE_LIMIT),
        namedPlace: true,
        onsiteWithoutPlace: false,
      };
      return named;
    }
    const locationTerm: string | null = this.restrictedLocationTerm(location, restrictedTerms);
    if (locationTerm !== null) {
      const restricted: RegionAssessment = {
        eligibility: "restricted",
        matchedTerm: locationTerm,
        namedPlace: false,
        onsiteWithoutPlace: false,
      };
      return restricted;
    }
    const descriptionHit: RestrictionHit | null = this.descriptionRestriction(description, openTerms);
    if (descriptionHit !== null) {
      const fromDescription: RegionAssessment = {
        eligibility: "restricted",
        matchedTerm: this.regionLabel(descriptionHit, description, restrictedTerms),
        namedPlace: false,
        onsiteWithoutPlace: false,
      };
      return fromDescription;
    }
    const unknown: RegionAssessment = { eligibility: "unknown", matchedTerm: null, namedPlace: false, onsiteWithoutPlace: false };
    return unknown;
  }

  private leftoverPlace(location: string, genericWords: string[]): string {
    const normalized: string = this.phrases.normalize(location);
    const stripped: string = this.stripSeparators(normalized);
    return this.phrases.removePhrases(stripped, genericWords);
  }

  private stripSeparators(value: string): string {
    let result: string = "";
    for (let index: number = 0; index < value.length; index++) {
      const character: string = value.charAt(index);
      if (SEPARATORS.indexOf(character) >= 0) {
        result = result + " ";
      } else {
        result = result + character;
      }
    }
    return result;
  }

  private letterCount(value: string): number {
    let count: number = 0;
    for (let index: number = 0; index < value.length; index++) {
      const code: number = value.charCodeAt(index);
      if (code >= 97 && code <= 122) {
        count = count + 1;
      }
    }
    return count;
  }

  private isOnsiteWithoutRemote(location: string): boolean {
    if (this.containsAny(location, REMOTE_WORDS)) {
      return false;
    }
    return this.containsAny(location, ONSITE_WORDS);
  }

  private containsAny(text: string, phrases: string[]): boolean {
    for (let index: number = 0; index < phrases.length; index++) {
      if (this.phrases.containsPhrase(text, phrases[index])) {
        return true;
      }
    }
    return false;
  }

  private hasOpenTerm(location: string, openTerms: string[]): boolean {
    for (let index: number = 0; index < openTerms.length; index++) {
      if (this.phrases.containsPhrase(location, openTerms[index])) {
        return true;
      }
    }
    return false;
  }

  private restrictedLocationTerm(location: string, restrictedTerms: string[]): string | null {
    for (let index: number = 0; index < restrictedTerms.length; index++) {
      const term: string = restrictedTerms[index];
      if (this.phrases.isAbbreviation(term)) {
        if (this.phrases.containsAbbreviation(location, term)) {
          return term;
        }
        continue;
      }
      if (this.phrases.containsPhrase(location, term)) {
        return term;
      }
    }
    return null;
  }

  private descriptionRestriction(description: string, openTerms: string[]): RestrictionHit | null {
    const excerpt: string = description.slice(0, DESCRIPTION_LIMIT);
    for (let index: number = 0; index < DESCRIPTION_PATTERNS.length; index++) {
      const pattern: { label: string; pattern: RegExp } = DESCRIPTION_PATTERNS[index];
      const found: RegExpMatchArray | null = excerpt.match(pattern.pattern);
      if (found === null || found.index === undefined) {
        continue;
      }
      const hit: RestrictionHit = { index: found.index, length: found[0].length, label: pattern.label };
      if (!this.openTermNearby(excerpt, hit, openTerms)) {
        return hit;
      }
    }
    return null;
  }

  private openTermNearby(excerpt: string, hit: RestrictionHit, openTerms: string[]): boolean {
    const start: number = Math.max(0, hit.index - NEARBY_WINDOW);
    const end: number = Math.min(excerpt.length, hit.index + hit.length + NEARBY_WINDOW);
    const windowText: string = excerpt.slice(start, end);
    return this.hasOpenTerm(windowText, openTerms);
  }

  private regionLabel(hit: RestrictionHit, description: string, restrictedTerms: string[]): string {
    const start: number = hit.index;
    const end: number = Math.min(description.length, hit.index + hit.length + 40);
    const snippet: string = description.slice(start, end);
    const named: string | null = this.restrictedLocationTerm(snippet, restrictedTerms);
    if (named !== null) {
      return named;
    }
    return hit.label;
  }
}
