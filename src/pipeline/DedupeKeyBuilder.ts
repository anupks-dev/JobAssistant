// The same role is often posted on more than one board with different punctuation.
export class DedupeKeyBuilder {
  private constructor() {}

  public static build(company: string, title: string, location: string): string {
    const companyPart: string = DedupeKeyBuilder.normalizePart(company);
    const titlePart: string = DedupeKeyBuilder.normalizePart(title);
    const locationPart: string = DedupeKeyBuilder.normalizePart(location);
    return companyPart + "|" + titlePart + "|" + locationPart;
  }

  private static normalizePart(value: string): string {
    const lower: string = value.toLowerCase();
    const withoutPunctuation: string = lower.replace(/\p{P}+/gu, "");
    const collapsed: string = withoutPunctuation.replace(/\s+/g, " ");
    const trimmed: string = collapsed.trim();
    return trimmed;
  }
}
