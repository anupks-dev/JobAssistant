import { readFileSync } from "fs";

interface VocabularyAlias {
  text: string;
  canonical: string;
  caseSensitive: boolean;
  pattern: RegExp;
}

interface TermMatch {
  canonical: string;
  start: number;
  end: number;
}

const CASE_SENSITIVE_PREFIX: string = "=";
// Names this short are also ordinary letters or words, so they only match with the exact spelling.
const MAX_ALWAYS_CASE_SENSITIVE_LENGTH: number = 2;

// A list of technology names with aliases. Matching is whole-word: a name must not touch a letter or digit on
// either side, and a trailing + or # also blocks it, so "C" never matches inside "C++", "Go" never inside "Google"
// and "SQL" never inside "PostgreSQL".
export class TechnologyVocabulary {
  private readonly aliases: VocabularyAlias[] = [];
  private readonly canonicalByAlias: Map<string, string> = new Map<string, string>();
  private readonly aliasesByCanonical: Map<string, VocabularyAlias[]> = new Map<string, VocabularyAlias[]>();

  public constructor(lines: string[]) {
    for (let index: number = 0; index < lines.length; index++) {
      this.addLine(lines[index]);
    }
  }

  public static fromFile(path: string): TechnologyVocabulary {
    const text: string = readFileSync(path, "utf-8");
    return new TechnologyVocabulary(text.split(/\r?\n/));
  }

  public size(): number {
    return this.aliasesByCanonical.size;
  }

  // The canonical name of a known technology or alias, or null when the vocabulary does not know it.
  public canonicalName(name: string): string | null {
    return this.canonicalByAlias.get(this.normalizeName(name)) ?? null;
  }

  public isKnown(name: string): boolean {
    return this.canonicalName(name) !== null;
  }

  // Two names are the same technology if they share a canonical name. Unknown names are equal only to themselves.
  public isSameTechnology(first: string, second: string): boolean {
    const firstCanonical: string | null = this.canonicalName(first);
    const secondCanonical: string | null = this.canonicalName(second);
    if (firstCanonical === null || secondCanonical === null) {
      return this.normalizeName(first) === this.normalizeName(second);
    }
    return firstCanonical === secondCanonical;
  }

  // Canonical names of every vocabulary term in the text, once each, in order of first appearance. The longest name wins where names overlap,
  // so "AWS SQS" counts as Amazon SQS and not additionally as AWS.
  public findTerms(text: string): string[] {
    const matches: TermMatch[] = this.collectMatches(text);
    matches.sort((first: TermMatch, second: TermMatch): number => (second.end - second.start) - (first.end - first.start));
    const accepted: TermMatch[] = [];
    for (let index: number = 0; index < matches.length; index++) {
      if (!this.overlapsAny(matches[index], accepted)) {
        accepted.push(matches[index]);
      }
    }
    accepted.sort((first: TermMatch, second: TermMatch): number => first.start - second.start);
    const found: string[] = [];
    for (let index: number = 0; index < accepted.length; index++) {
      if (found.indexOf(accepted[index].canonical) < 0) {
        found.push(accepted[index].canonical);
      }
    }
    return found;
  }

  // True if the text names this technology under any of its aliases. A name the vocabulary does not know
  // is searched as plain whole-word text.
  public mentions(text: string, name: string): boolean {
    const canonical: string | null = this.canonicalName(name);
    if (canonical === null) {
      return this.buildPattern(name.trim(), false).test(text);
    }
    const candidates: VocabularyAlias[] = this.aliasesByCanonical.get(canonical) ?? [];
    for (let index: number = 0; index < candidates.length; index++) {
      if (this.testFresh(candidates[index].pattern, text)) {
        return true;
      }
    }
    return false;
  }

  private addLine(rawLine: string): void {
    const line: string = rawLine.trim();
    if (line.length === 0 || line.startsWith("#")) {
      return;
    }
    const parts: string[] = line.split("|");
    let canonical: string = "";
    for (let index: number = 0; index < parts.length; index++) {
      const part: string = parts[index].trim();
      const caseSensitive: boolean = part.startsWith(CASE_SENSITIVE_PREFIX)
        || part.replace(CASE_SENSITIVE_PREFIX, "").length <= MAX_ALWAYS_CASE_SENSITIVE_LENGTH;
      const text: string = part.startsWith(CASE_SENSITIVE_PREFIX) ? part.slice(CASE_SENSITIVE_PREFIX.length).trim() : part;
      if (text.length === 0) {
        continue;
      }
      if (canonical.length === 0) {
        canonical = text;
      }
      this.addAlias(text, canonical, caseSensitive);
    }
  }

  private addAlias(text: string, canonical: string, caseSensitive: boolean): void {
    const alias: VocabularyAlias = {
      text: text,
      canonical: canonical,
      caseSensitive: caseSensitive,
      pattern: this.buildPattern(text, caseSensitive),
    };
    this.aliases.push(alias);
    this.canonicalByAlias.set(this.normalizeName(text), canonical);
    const group: VocabularyAlias[] = this.aliasesByCanonical.get(canonical) ?? [];
    group.push(alias);
    this.aliasesByCanonical.set(canonical, group);
  }

  private collectMatches(text: string): TermMatch[] {
    const matches: TermMatch[] = [];
    for (let index: number = 0; index < this.aliases.length; index++) {
      const alias: VocabularyAlias = this.aliases[index];
      const pattern: RegExp = new RegExp(alias.pattern.source, alias.pattern.flags);
      let found: RegExpExecArray | null = pattern.exec(text);
      while (found !== null) {
        matches.push({ canonical: alias.canonical, start: found.index, end: found.index + found[0].length });
        found = pattern.exec(text);
      }
    }
    return matches;
  }

  private overlapsAny(candidate: TermMatch, accepted: TermMatch[]): boolean {
    for (let index: number = 0; index < accepted.length; index++) {
      if (candidate.start < accepted[index].end && accepted[index].start < candidate.end) {
        return true;
      }
    }
    return false;
  }

  private testFresh(pattern: RegExp, text: string): boolean {
    return new RegExp(pattern.source, pattern.flags).test(text);
  }

  // Spaces and hyphens inside a name are interchangeable. The name must not touch a letter or digit, and a name
  // ending in a letter or digit must not be followed by + or # either.
  private buildPattern(name: string, caseSensitive: boolean): RegExp {
    const words: string[] = name.split(/[\s-]+/);
    const escaped: string[] = [];
    for (let index: number = 0; index < words.length; index++) {
      escaped.push(words[index].replace(/[.*+?^${}()|[\]\\/]/g, "\\$&"));
    }
    const endsPlain: boolean = /[A-Za-z0-9]$/.test(name);
    const source: string = "(?<![A-Za-z0-9])" + escaped.join("[\\s-]+") + "(?![A-Za-z0-9])" + (endsPlain ? "(?![+#])" : "");
    return new RegExp(source, caseSensitive ? "g" : "gi");
  }

  private normalizeName(name: string): string {
    return name.trim().toLowerCase().replace(/[\s-]+/g, " ");
  }
}
