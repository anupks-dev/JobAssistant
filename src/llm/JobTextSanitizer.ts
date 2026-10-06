import { HtmlToText } from "../fetchers/parsing/HtmlToText";
import { PiiRedactor } from "../profile/PiiRedactor";

export interface SanitizedJobText {
  text: string;
  injectionSuspected: boolean;
}

const INJECTION_PHRASES: string[] = [
  "ignore previous instructions",
  "system prompt",
  "you are now",
];

// Prepares job descriptions for LLM prompts without leaking personal data.
export class JobTextSanitizer {
  public constructor(
    private readonly redactor: PiiRedactor,
    private readonly htmlToText: HtmlToText,
    private readonly maxJobChars: number,
  ) {}

  public sanitize(rawText: string): SanitizedJobText {
    const plainText: string = this.htmlToText.toPlainText(rawText);
    const redacted: string = this.redactor.redact(plainText).redactedText;
    const collapsed: string = redacted.replace(/\s+/g, " ").trim();
    const truncated: string = this.truncate(collapsed);
    const injectionSuspected: boolean = this.detectInjection(truncated);
    const result: SanitizedJobText = {
      text: truncated,
      injectionSuspected: injectionSuspected,
    };
    return result;
  }

  private truncate(text: string): string {
    if (text.length <= this.maxJobChars) {
      return text;
    }
    return text.slice(0, this.maxJobChars);
  }

  private detectInjection(text: string): boolean {
    const lower: string = text.toLowerCase();
    for (let index: number = 0; index < INJECTION_PHRASES.length; index++) {
      if (lower.indexOf(INJECTION_PHRASES[index]) >= 0) {
        return true;
      }
    }
    return false;
  }
}
