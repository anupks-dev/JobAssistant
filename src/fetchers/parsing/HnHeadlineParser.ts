export interface HnHeadline {
  company: string;
  title: string;
  location: string;
  headline: string;
}

const ROLE_WORDS: string[] = [
  "engineer",
  "developer",
  "programmer",
  "architect",
  "manager",
  "lead",
  "designer",
  "scientist",
  "analyst",
  "director",
  "recruiter",
  "founder",
  "principal",
  "staff",
  "devops",
  "sre",
  "consultant",
  "specialist",
];

const CITIES: string[] = [
  "bangalore",
  "bengaluru",
  "london",
  "paris",
  "berlin",
  "tokyo",
  "new york",
  "dublin",
  "singapore",
  "dubai",
  "amsterdam",
  "toronto",
  "sydney",
  "seattle",
  "san francisco",
  "austin",
  "boston",
  "chicago",
  "munich",
  "stockholm",
  "lisbon",
  "barcelona",
  "madrid",
  "zurich",
  "hyderabad",
  "pune",
  "delhi",
  "mumbai",
];

const TITLE_LIMIT: number = 120;

export class HnHeadlineParser {
  public constructor(private readonly extraCities: string[]) {}

  public parse(commentText: string): HnHeadline {
    const firstLine: string = this.firstLine(commentText);
    const withoutTags: string = this.cutAtTag(firstLine);
    const headline: string = this.decode(withoutTags).trim();
    const segments: string[] = this.segments(headline);
    const company: string = this.company(headline);
    const title: string = this.title(headline, segments);
    const location: string = this.location(headline, segments);
    const parsed: HnHeadline = {
      company: company,
      title: title,
      location: location,
      headline: headline,
    };
    return parsed;
  }

  private firstLine(commentText: string): string {
    const lines: string[] = commentText.split("\n");
    if (lines.length === 0) {
      return "";
    }
    return lines[0];
  }

  private cutAtTag(line: string): string {
    const tagAt: number = line.indexOf("<");
    if (tagAt < 0) {
      return line;
    }
    return line.slice(0, tagAt);
  }

  private decode(value: string): string {
    let decoded: string = value.replace(/&#(\d+);/g, (_match: string, digits: string): string => {
      return String.fromCodePoint(Number(digits));
    });
    decoded = decoded.replace(/&#x([0-9a-f]+);/gi, (_match: string, hex: string): string => {
      return String.fromCodePoint(Number.parseInt(hex, 16));
    });
    decoded = decoded.replace(/&quot;/gi, "\"");
    decoded = decoded.replace(/&#39;|&apos;/gi, "'");
    decoded = decoded.replace(/&amp;/gi, "&");
    decoded = decoded.replace(/&lt;/gi, "<");
    decoded = decoded.replace(/&gt;/gi, ">");
    return decoded;
  }

  private segments(headline: string): string[] {
    const parts: string[] = headline.split("|");
    const segments: string[] = [];
    for (let index: number = 0; index < parts.length; index++) {
      const segment: string = parts[index].trim();
      if (segment.length > 0) {
        segments.push(segment);
      }
    }
    return segments;
  }

  private company(headline: string): string {
    const parts: string[] = headline.split("|");
    if (parts.length === 0) {
      return "Unknown";
    }
    const first: string = parts[0].trim();
    if (first.length === 0) {
      return "Unknown";
    }
    return first;
  }

  private title(headline: string, segments: string[]): string {
    for (let index: number = 0; index < segments.length; index++) {
      if (this.hasRole(segments[index])) {
        return segments[index];
      }
    }
    return this.truncate(headline);
  }

  private location(headline: string, segments: string[]): string {
    for (let index: number = 0; index < segments.length; index++) {
      if (this.isLocation(segments[index])) {
        return segments[index];
      }
    }
    if (headline.length === 0) {
      return "Unknown";
    }
    return headline;
  }

  private hasRole(segment: string): boolean {
    const lower: string = segment.toLowerCase();
    for (let index: number = 0; index < ROLE_WORDS.length; index++) {
      if (lower.indexOf(ROLE_WORDS[index]) >= 0) {
        return true;
      }
    }
    return false;
  }

  private isLocation(segment: string): boolean {
    const lower: string = segment.toLowerCase();
    if (lower.indexOf("remote") >= 0 || lower.indexOf("onsite") >= 0 || lower.indexOf("on-site") >= 0) {
      return true;
    }
    if (lower.indexOf("hybrid") >= 0) {
      return true;
    }
    return this.containsCity(lower);
  }

  private containsCity(lower: string): boolean {
    if (this.listHasCity(lower, CITIES)) {
      return true;
    }
    const extras: string[] = [];
    for (let index: number = 0; index < this.extraCities.length; index++) {
      extras.push(this.extraCities[index].toLowerCase());
    }
    return this.listHasCity(lower, extras);
  }

  private listHasCity(lower: string, cities: string[]): boolean {
    for (let index: number = 0; index < cities.length; index++) {
      if (cities[index].length > 0 && lower.indexOf(cities[index]) >= 0) {
        return true;
      }
    }
    return false;
  }

  private truncate(headline: string): string {
    if (headline.length <= TITLE_LIMIT) {
      return headline;
    }
    return headline.slice(0, TITLE_LIMIT);
  }
}
