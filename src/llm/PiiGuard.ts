import { PiiRedactor, RedactionCounts, RedactionResult } from "../profile/PiiRedactor";

// Thrown when outbound text still contains personal data. The message names types only.
export class PiiLeakError extends Error {
  public constructor(piiTypes: string[]) {
    super("Blocked text because it still contains PII. Types: " + piiTypes.join(", "));
    this.name = "PiiLeakError";
  }
}

// Every future LLM prompt must pass through this check before it leaves the machine.
export class PiiGuard {
  public constructor(private readonly redactor: PiiRedactor) {}

  public assertClean(text: string): void {
    const result: RedactionResult = this.redactor.redact(text);
    const leakedTypes: string[] = this.collectLeakedTypes(result.counts);
    if (leakedTypes.length > 0) {
      throw new PiiLeakError(leakedTypes);
    }
  }

  private collectLeakedTypes(counts: RedactionCounts): string[] {
    const leakedTypes: string[] = [];
    if (counts.name > 0) {
      leakedTypes.push("name");
    }
    if (counts.email > 0) {
      leakedTypes.push("email");
    }
    if (counts.phone > 0) {
      leakedTypes.push("phone");
    }
    if (counts.url > 0) {
      leakedTypes.push("url");
    }
    if (counts.address > 0) {
      leakedTypes.push("address");
    }
    return leakedTypes;
  }
}
