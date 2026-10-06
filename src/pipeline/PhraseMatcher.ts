const ABBREVIATIONS: string[] = ["US", "USA", "UK", "EU", "UAE"];

// Config phrases stay plain text. Boundaries are checked in code so "us" cannot match inside "join us".
export class PhraseMatcher {
  public normalize(value: string): string {
    const lower: string = value.toLowerCase();
    const spaced: string = lower.replace(/[-_/]+/g, " ");
    const collapsed: string = spaced.replace(/\s+/g, " ");
    return collapsed.trim();
  }

  public normalizeCompany(value: string): string {
    const normalized: string = this.normalize(value);
    const letters: string = normalized.replace(/[^a-z0-9 ]+/g, "");
    return letters.replace(/\s+/g, " ").trim();
  }

  public containsPhrase(text: string, phrase: string): boolean {
    const haystack: string = this.normalize(text);
    const needle: string = this.normalize(phrase);
    if (needle.length === 0) {
      return false;
    }
    let from: number = 0;
    while (from < haystack.length) {
      const at: number = haystack.indexOf(needle, from);
      if (at < 0) {
        return false;
      }
      if (this.isBounded(haystack, at, at + needle.length)) {
        return true;
      }
      from = at + 1;
    }
    return false;
  }

  public isAbbreviation(term: string): boolean {
    for (let index: number = 0; index < ABBREVIATIONS.length; index++) {
      if (ABBREVIATIONS[index] === term) {
        return true;
      }
    }
    return false;
  }

  public containsAbbreviation(location: string, abbreviation: string): boolean {
    let from: number = 0;
    while (from < location.length) {
      const at: number = location.indexOf(abbreviation, from);
      if (at < 0) {
        return false;
      }
      if (this.isBounded(location, at, at + abbreviation.length)) {
        return true;
      }
      from = at + 1;
    }
    return false;
  }

  public removePhrases(text: string, phrases: string[]): string {
    let current: string = this.normalize(text);
    const ordered: string[] = this.longestFirst(phrases);
    for (let index: number = 0; index < ordered.length; index++) {
      current = this.removePhrase(current, ordered[index]);
    }
    return current;
  }

  public containsGccToken(text: string): boolean {
    const normalized: string = this.normalize(text);
    const needle: string = "gcc";
    let from: number = 0;
    while (from < normalized.length) {
      const at: number = normalized.indexOf(needle, from);
      if (at < 0) {
        return false;
      }
      const end: number = at + needle.length;
      if (this.isBounded(normalized, at, end) && !this.followedByGulfQualifier(normalized, end)) {
        return true;
      }
      from = at + 1;
    }
    return false;
  }

  private longestFirst(phrases: string[]): string[] {
    const ordered: string[] = [];
    for (let index: number = 0; index < phrases.length; index++) {
      ordered.push(phrases[index]);
    }
    ordered.sort((left: string, right: string): number => right.length - left.length);
    return ordered;
  }

  private removePhrase(text: string, phrase: string): string {
    const needle: string = this.normalize(phrase);
    if (needle.length === 0) {
      return text;
    }
    let result: string = "";
    let from: number = 0;
    while (from < text.length) {
      const at: number = text.indexOf(needle, from);
      if (at < 0) {
        result = result + text.slice(from);
        break;
      }
      if (this.isBounded(text, at, at + needle.length)) {
        result = result + text.slice(from, at) + " ";
        from = at + needle.length;
      } else {
        result = result + text.slice(from, at + 1);
        from = at + 1;
      }
    }
    return result.replace(/\s+/g, " ").trim();
  }

  private followedByGulfQualifier(text: string, end: number): boolean {
    const rest: string = text.slice(end);
    if (rest.indexOf(" countries") === 0) {
      return true;
    }
    if (rest.indexOf(" region") === 0) {
      return true;
    }
    return false;
  }

  private isBounded(text: string, start: number, end: number): boolean {
    const beforeOk: boolean = start === 0 || !this.isWordCharacter(text.charAt(start - 1));
    const afterOk: boolean = end >= text.length || !this.isWordCharacter(text.charAt(end));
    return beforeOk && afterOk;
  }

  private isWordCharacter(character: string): boolean {
    const code: number = character.charCodeAt(0);
    const digit: boolean = code >= 48 && code <= 57;
    const lower: boolean = code >= 97 && code <= 122;
    const upper: boolean = code >= 65 && code <= 90;
    return digit || lower || upper;
  }
}
