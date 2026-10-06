import { NumberWordExtractor } from "./NumberWordExtractor";

const NUMBER_PATTERN: RegExp = /\d+(?:,\d{3})*(?:\.\d+)?(?:\s?[kKmM]\b)?/g;

// Checks model output against the profile text, so claims cannot appear from nowhere.
export class ProfileGrounding {
  private readonly numberWords: NumberWordExtractor = new NumberWordExtractor();

  // Case-insensitive and whitespace-normalized, so line breaks in the profile do not hide a match.
  public containsExcerpt(profileText: string, excerpt: string): boolean {
    const normalizedExcerpt: string = this.normalizeText(excerpt);
    if (normalizedExcerpt.length === 0) {
      return false;
    }
    return this.normalizeText(profileText).includes(normalizedExcerpt);
  }

  // Returns the numbers of the text that the profile does not contain, in normalized form.
  public findUngroundedNumbers(text: string, profileText: string): string[] {
    const known: Set<string> = new Set<string>(this.extractNumbers(profileText));
    const missing: string[] = [];
    const found: string[] = this.extractNumbers(text);
    for (let index: number = 0; index < found.length; index++) {
      if (!known.has(found[index])) {
        missing.push(found[index]);
      }
    }
    return missing;
  }

  // Numbers claimed as words ("eight", "three months") that the profile states neither as digits nor as words.
  public findUngroundedNumberWords(text: string, profileText: string): string[] {
    const known: Set<string> = new Set<string>(this.extractNumbers(profileText));
    const profileWords: string[] = this.numberWords.findAll(profileText);
    for (let index: number = 0; index < profileWords.length; index++) {
      known.add(profileWords[index]);
    }
    const missing: string[] = [];
    const claimed: string[] = this.numberWords.findClaims(text);
    for (let index: number = 0; index < claimed.length; index++) {
      if (!known.has(claimed[index])) {
        missing.push(claimed[index]);
      }
    }
    return missing;
  }

  // "50K", "50k" and "50,000" all become "50000". A percent sign or a trailing "years" is not part of the number.
  public extractNumbers(text: string): string[] {
    const numbers: string[] = [];
    const matches: RegExpMatchArray | null = text.match(NUMBER_PATTERN);
    if (matches === null) {
      return numbers;
    }
    for (let index: number = 0; index < matches.length; index++) {
      numbers.push(this.normalizeNumber(matches[index]));
    }
    return numbers;
  }

  private normalizeNumber(token: string): string {
    const lower: string = token.toLowerCase().replace(/\s/g, "");
    let multiplier: number = 1;
    let digits: string = lower;
    if (lower.endsWith("k")) {
      multiplier = 1000;
      digits = lower.slice(0, -1);
    } else if (lower.endsWith("m")) {
      multiplier = 1000000;
      digits = lower.slice(0, -1);
    }
    const value: number = Number(digits.replace(/,/g, "")) * multiplier;
    return String(Math.round(value * 1000) / 1000);
  }

  private normalizeText(text: string): string {
    return text.toLowerCase().replace(/\s+/g, " ").trim();
  }
}
