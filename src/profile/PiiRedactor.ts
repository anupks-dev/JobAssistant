import { PiiValues } from "./PiiValueStore";

export interface RedactionCounts {
  name: number;
  email: number;
  phone: number;
  url: number;
  address: number;
}

export interface RedactionResult {
  redactedText: string;
  counts: RedactionCounts;
}

type PiiCountKey = keyof RedactionCounts;

interface TextSpan {
  start: number;
  end: number;
  placeholder: string;
  type: PiiCountKey;
}

// Replaces personal data with placeholders. Counts are safe to log; raw values are not.
export class PiiRedactor {
  public constructor(private readonly piiValues: PiiValues) {}

  public redact(text: string): RedactionResult {
    const counts: RedactionCounts = this.emptyCounts();
    const spans: TextSpan[] = [];
    this.collectSpans(text, spans);
    const selected: TextSpan[] = this.selectSpans(spans);
    let redacted: string = this.applySpans(text, selected, counts);
    redacted = this.redactAddressLines(redacted, counts);
    redacted = this.dropPlaceholderOnlyLines(redacted);
    const result: RedactionResult = {
      redactedText: redacted,
      counts: counts,
    };
    return result;
  }

  private collectSpans(text: string, spans: TextSpan[]): void {
    this.addEmailSpans(text, spans);
    this.addUrlSpans(text, spans);
    this.addPhoneSpans(text, spans);
    this.addAddressSpans(text, spans);
    this.addNameSpans(text, spans);
    this.addOtherValueSpans(text, spans);
  }

  private addEmailSpans(text: string, spans: TextSpan[]): void {
    const emails: string[] = this.piiValues.emails;
    for (let index: number = 0; index < emails.length; index++) {
      this.addFlexibleLiteral(text, emails[index], "[EMAIL]", "email", spans);
    }
    this.addMatches(text, /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "[EMAIL]", "email", spans);
  }

  private addUrlSpans(text: string, spans: TextSpan[]): void {
    this.addUrlPattern(text, /\bhttps?:\/\/[^\s<>\])"'`]+/gi, spans);
    this.addUrlPattern(text, /\bwww\.[^\s<>\])"'`]+/gi, spans);
    this.addUrlPattern(text, /\blinkedin\.com\/in\/[A-Za-z0-9._%-]+\/?/gi, spans);
    this.addUrlPattern(text, /\bgithub\.com\/[A-Za-z0-9._-]+\/?/gi, spans);
  }

  private addPhoneSpans(text: string, spans: TextSpan[]): void {
    const phones: string[] = this.piiValues.phones;
    for (let index: number = 0; index < phones.length; index++) {
      this.addStoredPhone(text, phones[index], spans);
    }
    // Digit runs also appear in dates, versions and metrics, so each hit is checked.
    this.addPhonePattern(text, /\+\d{1,3}(?:[\s().-]*\d){10,14}/g, spans);
    this.addPhonePattern(text, /\(\d{3}\)\s*\d{3}[-.\s]\d{4}/g, spans);
    this.addPhonePattern(text, /\b\d{3}[-.\s]\d{3}[-.\s]\d{4}\b/g, spans);
    this.addPhonePattern(text, /\b0\d{4,5}[-.\s]\d{5}\b/g, spans);
    this.addPhonePattern(text, /\b[6-9]\d{4}[-.\s]\d{5}\b/g, spans);
    this.addPhonePattern(text, /\b0[6-9]\d{9}\b/g, spans);
    this.addPhonePattern(text, /\b[6-9]\d{9}\b/g, spans);
  }

  private addAddressSpans(text: string, spans: TextSpan[]): void {
    const addresses: string[] = this.piiValues.addresses;
    for (let index: number = 0; index < addresses.length; index++) {
      this.addFlexibleLiteral(text, addresses[index], "[ADDRESS]", "address", spans);
    }
  }

  private addNameSpans(text: string, spans: TextSpan[]): void {
    this.addFlexibleLiteral(text, this.piiValues.fullName, "[NAME]", "name", spans);
    const alternateNames: string[] = this.piiValues.alternateNames;
    for (let index: number = 0; index < alternateNames.length; index++) {
      this.addFlexibleLiteral(text, alternateNames[index], "[NAME]", "name", spans);
      this.addNamePartSpans(text, alternateNames[index], spans);
    }
    this.addNamePartSpans(text, this.piiValues.fullName, spans);
  }

  private addOtherValueSpans(text: string, spans: TextSpan[]): void {
    const otherValues: string[] = this.piiValues.otherValues;
    for (let index: number = 0; index < otherValues.length; index++) {
      const value: string = otherValues[index];
      const placeholder: string = this.placeholderForOtherValue(value);
      const type: PiiCountKey = this.countKeyForPlaceholder(placeholder);
      this.addFlexibleLiteral(text, value, placeholder, type, spans);
    }
  }

  // The report has no separate bucket, so an unclassified exact value is counted as a name.
  private placeholderForOtherValue(value: string): string {
    if (/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.test(value)) {
      return "[EMAIL]";
    }
    if (/https?:\/\/|www\.|linkedin\.com\/in\/|github\.com\//i.test(value)) {
      return "[URL]";
    }
    const digits: string = value.replace(/\D/g, "");
    if (digits.length >= 10 && digits.length <= 15) {
      return "[PHONE]";
    }
    if (this.isAddressLine(value)) {
      return "[ADDRESS]";
    }
    return "[NAME]";
  }

  private countKeyForPlaceholder(placeholder: string): PiiCountKey {
    if (placeholder === "[EMAIL]") {
      return "email";
    }
    if (placeholder === "[PHONE]") {
      return "phone";
    }
    if (placeholder === "[URL]") {
      return "url";
    }
    if (placeholder === "[ADDRESS]") {
      return "address";
    }
    return "name";
  }

  private addNamePartSpans(text: string, fullName: string, spans: TextSpan[]): void {
    const collapsed: string = fullName.trim().replace(/\s+/g, " ");
    if (collapsed.length === 0) {
      return;
    }
    const parts: string[] = collapsed.split(" ");
    for (let index: number = 0; index < parts.length; index++) {
      const part: string = parts[index];
      // Short tokens such as initials match too much ordinary text.
      if (part.length < 3) {
        continue;
      }
      const pattern: RegExp = new RegExp("\\b" + this.escapeRegex(part) + "\\b", "gi");
      this.addMatches(text, pattern, "[NAME]", "name", spans);
    }
  }

  private addStoredPhone(text: string, storedPhone: string, spans: TextSpan[]): void {
    const normalized: string = this.normalizePhoneDigits(storedPhone);
    if (normalized.length < 8) {
      this.addFlexibleLiteral(text, storedPhone, "[PHONE]", "phone", spans);
      return;
    }
    let source: string = "(?:\\+\\d{1,3}[\\s().-]*)?(?:0[\\s().-]*)?";
    for (let index: number = 0; index < normalized.length; index++) {
      if (index > 0) {
        source += "[\\s().-]*";
      }
      source += normalized.charAt(index);
    }
    this.addPhonePattern(text, new RegExp(source, "g"), spans);
  }

  private addPhonePattern(text: string, pattern: RegExp, spans: TextSpan[]): void {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null = pattern.exec(text);
    while (match !== null) {
      const start: number = match.index;
      const end: number = start + match[0].length;
      if (this.isPhoneMatch(text, start, end, match[0])) {
        spans.push({ start: start, end: end, placeholder: "[PHONE]", type: "phone" });
      }
      if (pattern.lastIndex === match.index) {
        pattern.lastIndex = match.index + 1;
      }
      match = pattern.exec(text);
    }
  }

  private isPhoneMatch(text: string, start: number, end: number, raw: string): boolean {
    const digits: string = raw.replace(/\D/g, "");
    if (digits.length < 10 || digits.length > 15) {
      return false;
    }
    if (!this.isBoundedNumber(text, start, end)) {
      return false;
    }
    if (this.hasMetricSuffix(text, end) || this.hasAmountPrefix(text, start)) {
      return false;
    }
    if (this.looksLikeDate(raw) || this.looksLikeVersion(raw)) {
      return false;
    }
    return true;
  }

  private isBoundedNumber(text: string, start: number, end: number): boolean {
    if (start > 0 && this.isDigit(text.charAt(start - 1))) {
      return false;
    }
    if (end < text.length && this.isDigit(text.charAt(end))) {
      return false;
    }
    return true;
  }

  private hasMetricSuffix(text: string, endIndex: number): boolean {
    const tail: string = text.slice(endIndex);
    return /^\s*(users|user|requests|req|ms|seconds|secs|minutes|hours|gb|mb|kb|tb|rows|records|customers|employees|downloads|lines|commits|qps|rps|tps)\b/i.test(tail);
  }

  private hasAmountPrefix(text: string, startIndex: number): boolean {
    const headStart: number = Math.max(0, startIndex - 8);
    const head: string = text.slice(headStart, startIndex);
    return /(?:\$|₹|€|£|usd|inr|rs\.?)\s*$/i.test(head);
  }

  private looksLikeDate(raw: string): boolean {
    const trimmed: string = raw.trim();
    if (/^\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}$/.test(trimmed)) {
      return true;
    }
    if (/^\d{4}[\/-]\d{1,2}[\/-]\d{1,2}$/.test(trimmed)) {
      return true;
    }
    if (/\b(19|20)\d{2}\b/.test(trimmed) && /[\/-]/.test(trimmed)) {
      return true;
    }
    return false;
  }

  private looksLikeVersion(raw: string): boolean {
    return /^\d+(?:\.\d+){1,}$/.test(raw.trim());
  }

  private normalizePhoneDigits(value: string): string {
    let digits: string = value.replace(/\D/g, "");
    if (digits.startsWith("00")) {
      digits = digits.slice(2);
    }
    if (digits.length === 12 && digits.startsWith("91")) {
      digits = digits.slice(2);
    }
    if (digits.length === 11 && digits.startsWith("0")) {
      digits = digits.slice(1);
    }
    if (digits.length === 11 && digits.startsWith("1")) {
      digits = digits.slice(1);
    }
    return digits;
  }

  private addUrlPattern(text: string, pattern: RegExp, spans: TextSpan[]): void {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null = pattern.exec(text);
    while (match !== null) {
      const start: number = match.index;
      let end: number = start + match[0].length;
      end = this.trimTrailingPunctuation(text, start, end);
      if (end > start) {
        spans.push({ start: start, end: end, placeholder: "[URL]", type: "url" });
      }
      if (pattern.lastIndex === match.index) {
        pattern.lastIndex = match.index + 1;
      }
      match = pattern.exec(text);
    }
  }

  private trimTrailingPunctuation(text: string, start: number, end: number): number {
    let trimmedEnd: number = end;
    while (trimmedEnd > start) {
      const character: string = text.charAt(trimmedEnd - 1);
      if (".,);:\"'".indexOf(character) >= 0) {
        trimmedEnd = trimmedEnd - 1;
      } else {
        break;
      }
    }
    return trimmedEnd;
  }

  private addFlexibleLiteral(text: string, value: string, placeholder: string, type: PiiCountKey, spans: TextSpan[]): void {
    const pattern: RegExp | null = this.buildWhitespaceFlexiblePattern(value);
    if (pattern === null) {
      return;
    }
    this.addMatches(text, pattern, placeholder, type, spans);
  }

  private buildWhitespaceFlexiblePattern(value: string): RegExp | null {
    const collapsed: string = value.trim().replace(/\s+/g, " ");
    if (collapsed.length === 0) {
      return null;
    }
    const parts: string[] = collapsed.split(" ");
    let source: string = "\\b";
    for (let index: number = 0; index < parts.length; index++) {
      if (index > 0) {
        source += "\\s+";
      }
      source += this.escapeRegex(parts[index]);
    }
    source += "\\b";
    return new RegExp(source, "gi");
  }

  private addMatches(text: string, pattern: RegExp, placeholder: string, type: PiiCountKey, spans: TextSpan[]): void {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null = pattern.exec(text);
    while (match !== null) {
      if (match[0].length > 0) {
        spans.push({
          start: match.index,
          end: match.index + match[0].length,
          placeholder: placeholder,
          type: type,
        });
      }
      if (pattern.lastIndex === match.index) {
        pattern.lastIndex = match.index + 1;
      }
      match = pattern.exec(text);
    }
  }

  private selectSpans(spans: TextSpan[]): TextSpan[] {
    const sorted: TextSpan[] = spans.slice();
    sorted.sort((left: TextSpan, right: TextSpan): number => {
      if (left.start !== right.start) {
        return left.start - right.start;
      }
      return (right.end - right.start) - (left.end - left.start);
    });
    const accepted: TextSpan[] = [];
    for (let index: number = 0; index < sorted.length; index++) {
      const candidate: TextSpan = sorted[index];
      if (!this.overlapsAny(candidate, accepted)) {
        accepted.push(candidate);
      }
    }
    return accepted;
  }

  private overlapsAny(candidate: TextSpan, accepted: TextSpan[]): boolean {
    for (let index: number = 0; index < accepted.length; index++) {
      const existing: TextSpan = accepted[index];
      if (candidate.start < existing.end && existing.start < candidate.end) {
        return true;
      }
    }
    return false;
  }

  private applySpans(text: string, spans: TextSpan[], counts: RedactionCounts): string {
    const ordered: TextSpan[] = spans.slice();
    ordered.sort((left: TextSpan, right: TextSpan): number => {
      return right.start - left.start;
    });
    let updated: string = text;
    for (let index: number = 0; index < ordered.length; index++) {
      const span: TextSpan = ordered[index];
      updated = updated.slice(0, span.start) + span.placeholder + updated.slice(span.end);
      counts[span.type] = counts[span.type] + 1;
    }
    return updated;
  }

  private redactAddressLines(text: string, counts: RedactionCounts): string {
    const lines: string[] = text.split("\n");
    const outputLines: string[] = [];
    for (let index: number = 0; index < lines.length; index++) {
      const line: string = lines[index];
      if (this.isAddressLine(line) && !this.isPlaceholderOnly(line)) {
        outputLines.push("[ADDRESS]");
        counts.address = counts.address + 1;
      } else {
        outputLines.push(line);
      }
    }
    return outputLines.join("\n");
  }

  private isAddressLine(line: string): boolean {
    if (/\b(Road|Street|Nagar|Layout|Apartment)\b/i.test(line)) {
      return true;
    }
    return this.hasPinCodeNextToPlace(line);
  }

  private hasPinCodeNextToPlace(line: string): boolean {
    const places: string[] = this.placeNames();
    for (let index: number = 0; index < places.length; index++) {
      const place: string = places[index];
      const beforePin: RegExp = new RegExp("\\b\\d{6}\\b[\\s,.-]{0,3}" + this.escapeRegex(place) + "\\b", "i");
      const afterPlace: RegExp = new RegExp("\\b" + this.escapeRegex(place) + "\\b[\\s,.-]{0,3}\\d{6}\\b", "i");
      if (beforePin.test(line) || afterPlace.test(line)) {
        return true;
      }
    }
    return false;
  }

  private dropPlaceholderOnlyLines(text: string): string {
    const lines: string[] = text.split("\n");
    const kept: string[] = [];
    for (let index: number = 0; index < lines.length; index++) {
      const line: string = lines[index];
      if (!this.isPlaceholderOnly(line)) {
        kept.push(line);
      }
    }
    return kept.join("\n");
  }

  private isPlaceholderOnly(line: string): boolean {
    if (!/\[(NAME|EMAIL|PHONE|URL|ADDRESS)\]/.test(line)) {
      return false;
    }
    const withoutPlaceholders: string = line.replace(/\[(NAME|EMAIL|PHONE|URL|ADDRESS)\]/g, "");
    const withoutSeparators: string = withoutPlaceholders.replace(/[\s|,.\/:;·•\-*–—_]+/g, "");
    return withoutSeparators.length === 0;
  }

  private emptyCounts(): RedactionCounts {
    const counts: RedactionCounts = {
      name: 0,
      email: 0,
      phone: 0,
      url: 0,
      address: 0,
    };
    return counts;
  }

  private escapeRegex(value: string): string {
    let escaped: string = "";
    const specialCharacters: string = "\\^$.*+?()[]{}|";
    for (let index: number = 0; index < value.length; index++) {
      const character: string = value.charAt(index);
      if (specialCharacters.indexOf(character) >= 0) {
        escaped += "\\" + character;
      } else {
        escaped += character;
      }
    }
    return escaped;
  }

  private isDigit(character: string): boolean {
    return character >= "0" && character <= "9";
  }

  private placeNames(): string[] {
    const places: string[] = [
      "andhra pradesh",
      "arunachal pradesh",
      "assam",
      "bihar",
      "chhattisgarh",
      "goa",
      "gujarat",
      "haryana",
      "himachal pradesh",
      "jharkhand",
      "karnataka",
      "kerala",
      "madhya pradesh",
      "maharashtra",
      "manipur",
      "meghalaya",
      "mizoram",
      "nagaland",
      "odisha",
      "punjab",
      "rajasthan",
      "sikkim",
      "tamil nadu",
      "telangana",
      "tripura",
      "uttar pradesh",
      "uttarakhand",
      "west bengal",
      "andaman and nicobar",
      "jammu and kashmir",
      "delhi",
      "chandigarh",
      "puducherry",
      "ladakh",
      "mumbai",
      "bengaluru",
      "bangalore",
      "hyderabad",
      "ahmedabad",
      "chennai",
      "kolkata",
      "pune",
      "jaipur",
      "lucknow",
      "kanpur",
      "nagpur",
      "indore",
      "bhopal",
      "patna",
      "vadodara",
      "ludhiana",
      "agra",
      "nashik",
      "varanasi",
      "srinagar",
      "ranchi",
      "coimbatore",
      "jodhpur",
      "madurai",
      "raipur",
      "guwahati",
      "mysuru",
      "mysore",
      "gurugram",
      "gurgaon",
      "noida",
    ];
    return places;
  }
}
