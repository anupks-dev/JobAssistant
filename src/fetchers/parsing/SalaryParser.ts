export interface ParsedSalary {
  min: number | null;
  max: number | null;
  currency: string | null;
  known: boolean;
}

// Annual figures are what the ranker will compare. Hour, day and month rates are scaled when the unit is explicit.
export class SalaryParser {
  public parse(text: string): ParsedSalary {
    const unknown: ParsedSalary = { min: null, max: null, currency: null, known: false };
    const trimmed: string = text.trim();
    if (trimmed.length === 0) {
      return unknown;
    }
    const period: string = this.readPeriod(trimmed);
    if (period === "mixed" || this.currencyCount(trimmed) > 1) {
      return unknown;
    }
    const amounts: number[] = this.readAmounts(trimmed);
    if (amounts.length === 0 || amounts.length > 2) {
      return unknown;
    }
    const currency: string | null = this.readCurrency(trimmed);
    const multiplier: number = this.annualMultiplier(period);
    let minimum: number = Math.round(amounts[0] * multiplier);
    let maximum: number = minimum;
    if (amounts.length === 2) {
      maximum = Math.round(amounts[1] * multiplier);
    }
    if (maximum < minimum) {
      const swap: number = minimum;
      minimum = maximum;
      maximum = swap;
    }
    const parsed: ParsedSalary = {
      min: minimum,
      max: maximum,
      currency: currency,
      known: true,
    };
    return parsed;
  }

  private currencyCount(text: string): number {
    const lower: string = text.toLowerCase();
    let found: number = 0;
    if (text.indexOf("€") >= 0 || lower.indexOf("eur") >= 0) {
      found = found + 1;
    }
    if (text.indexOf("£") >= 0 || lower.indexOf("gbp") >= 0) {
      found = found + 1;
    }
    if (text.indexOf("$") >= 0 || lower.indexOf("usd") >= 0) {
      found = found + 1;
    }
    return found;
  }

  private readCurrency(text: string): string | null {
    const lower: string = text.toLowerCase();
    const hasEuro: boolean = text.indexOf("€") >= 0 || lower.indexOf("eur") >= 0;
    const hasPound: boolean = text.indexOf("£") >= 0 || lower.indexOf("gbp") >= 0;
    const hasDollar: boolean = text.indexOf("$") >= 0 || lower.indexOf("usd") >= 0;
    if (this.currencyCount(text) !== 1) {
      return null;
    }
    if (hasEuro) {
      return "EUR";
    }
    if (hasPound) {
      return "GBP";
    }
    if (hasDollar) {
      return "USD";
    }
    return null;
  }

  private readPeriod(text: string): string {
    const lower: string = text.toLowerCase();
    let found: number = 0;
    let period: string = "none";
    if (/\b(hour|hourly|hr)\b/.test(lower)) {
      found = found + 1;
      period = "hour";
    }
    if (/\b(day|daily)\b/.test(lower)) {
      found = found + 1;
      period = "day";
    }
    if (/\b(month|monthly)\b/.test(lower)) {
      found = found + 1;
      period = "month";
    }
    if (/\b(year|yearly|annual|annum)\b/.test(lower)) {
      found = found + 1;
      period = "year";
    }
    if (found > 1) {
      return "mixed";
    }
    return period;
  }

  private annualMultiplier(period: string): number {
    if (period === "hour") {
      return 40 * 52;
    }
    if (period === "day") {
      return 5 * 52;
    }
    if (period === "month") {
      return 12;
    }
    return 1;
  }

  private readAmounts(text: string): number[] {
    const pattern: RegExp = /[$€£]?\s*\d+(?:[.,]\d+)*(?:\s*[kK])?/g;
    const amounts: number[] = [];
    let match: RegExpExecArray | null = pattern.exec(text);
    while (match !== null) {
      const amount: number | null = this.parseAmount(match[0]);
      if (amount !== null) {
        amounts.push(amount);
      }
      match = pattern.exec(text);
    }
    return amounts;
  }

  private parseAmount(raw: string): number | null {
    let token: string = raw.trim().toLowerCase();
    token = token.replace(/[$€£]/g, "");
    token = token.replace(/\s+/g, "");
    let thousands: boolean = false;
    if (token.endsWith("k")) {
      thousands = true;
      token = token.slice(0, token.length - 1);
    }
    if (token.length === 0) {
      return null;
    }
    if (/^\d{1,3}(,\d{3})+$/.test(token)) {
      token = token.replace(/,/g, "");
    } else if (token.indexOf(",") >= 0) {
      token = token.replace(",", ".");
    }
    const amount: number = Number(token);
    if (!Number.isFinite(amount)) {
      return null;
    }
    if (thousands) {
      return amount * 1000;
    }
    return amount;
  }
}
