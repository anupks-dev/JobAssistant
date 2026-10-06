const UNIT_VALUES: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17,
  eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70,
  eighty: 80, ninety: 90,
};

const MULTIPLIER_VALUES: Record<string, number> = { hundred: 100, thousand: 1000, million: 1000000 };

// "one" alone is an everyday word ("one of the requirements", "no one"), so it counts only before one of these.
const UNIT_WORDS: readonly string[] = [
  "year", "years", "month", "months", "week", "weeks", "day", "days", "person", "people", "member", "members",
  "engineer", "engineers", "user", "users", "team", "teams", "percent",
];

interface WordToken {
  word: string;
  start: number;
  end: number;
}

interface NumberGroup {
  value: number;
  words: string[];
  lastEnd: number;
}

// Finds numbers written as words ("eight", "twenty-five", "two hundred") and returns them as digit strings.
export class NumberWordExtractor {
  // Numbers that the text claims: every number word from "two" up, and "one" only directly before a unit.
  public findClaims(text: string): string[] {
    const claims: string[] = [];
    const tokens: WordToken[] = this.tokenize(text);
    const groups: NumberGroup[] = this.groupNumberWords(text, tokens);
    for (let index: number = 0; index < groups.length; index++) {
      if (this.isOnlyOne(groups[index]) && !this.isFollowedByUnit(tokens, groups[index])) {
        continue;
      }
      claims.push(String(groups[index].value));
    }
    return claims;
  }

  // Every number written as a word, "one" included wherever it stands. Used for the profile side.
  public findAll(text: string): string[] {
    const found: string[] = [];
    const groups: NumberGroup[] = this.groupNumberWords(text, this.tokenize(text));
    for (let index: number = 0; index < groups.length; index++) {
      found.push(String(groups[index].value));
    }
    return found;
  }

  private tokenize(text: string): WordToken[] {
    const tokens: WordToken[] = [];
    const pattern: RegExp = /[A-Za-z]+/g;
    let found: RegExpExecArray | null = pattern.exec(text);
    while (found !== null) {
      tokens.push({ word: found[0].toLowerCase(), start: found.index, end: found.index + found[0].length });
      found = pattern.exec(text);
    }
    return tokens;
  }

  // Number words separated only by spaces or hyphens form one number: "twenty-five", "two hundred".
  private groupNumberWords(text: string, tokens: WordToken[]): NumberGroup[] {
    const groups: NumberGroup[] = [];
    let words: string[] = [];
    let lastEnd: number = -1;
    for (let index: number = 0; index < tokens.length; index++) {
      const token: WordToken = tokens[index];
      const isNumberWord: boolean = this.isNumberWord(token.word);
      const joinsPrevious: boolean = words.length > 0 && /^[\s-]+$/.test(text.slice(lastEnd, token.start));
      if (!isNumberWord || !joinsPrevious) {
        this.flush(groups, words, lastEnd);
        words = [];
      }
      if (isNumberWord) {
        words.push(token.word);
        lastEnd = token.end;
      }
    }
    this.flush(groups, words, lastEnd);
    return groups;
  }

  private flush(groups: NumberGroup[], words: string[], lastEnd: number): void {
    if (words.length === 0) {
      return;
    }
    groups.push({ value: this.valueOf(words), words: words, lastEnd: lastEnd });
  }

  private valueOf(words: string[]): number {
    let total: number = 0;
    let current: number = 0;
    for (let index: number = 0; index < words.length; index++) {
      const word: string = words[index];
      if (UNIT_VALUES[word] !== undefined) {
        current = current + UNIT_VALUES[word];
      } else if (word === "hundred") {
        current = (current === 0 ? 1 : current) * MULTIPLIER_VALUES[word];
      } else {
        total = total + (current === 0 ? 1 : current) * MULTIPLIER_VALUES[word];
        current = 0;
      }
    }
    return total + current;
  }

  private isNumberWord(word: string): boolean {
    return UNIT_VALUES[word] !== undefined || MULTIPLIER_VALUES[word] !== undefined;
  }

  private isOnlyOne(group: NumberGroup): boolean {
    return group.words.length === 1 && group.words[0] === "one";
  }

  private isFollowedByUnit(tokens: WordToken[], group: NumberGroup): boolean {
    for (let index: number = 0; index < tokens.length; index++) {
      if (tokens[index].start >= group.lastEnd) {
        return UNIT_WORDS.indexOf(tokens[index].word) >= 0;
      }
    }
    return false;
  }
}
