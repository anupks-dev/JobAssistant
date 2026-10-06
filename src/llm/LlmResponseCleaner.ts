const THINKING_BLOCK_PATTERN: RegExp = /<think>[\s\S]*?<\/redacted_thinking>/gi;

export interface LlmCleanResult {
  text: string;
  hadReasoningContent: boolean;
}

// Strips model reasoning artifacts before JSON extraction or display.
export class LlmResponseCleaner {
  public clean(rawText: string, reasoningContent: string | null | undefined): LlmCleanResult {
    let hadReasoning: boolean = false;
    if (reasoningContent !== null && reasoningContent !== undefined && reasoningContent.trim().length > 0) {
      hadReasoning = true;
    }
    let text: string = rawText;
    if (THINKING_BLOCK_PATTERN.test(text)) {
      hadReasoning = true;
      text = text.replace(THINKING_BLOCK_PATTERN, "");
    }
    const collapsed: string = text.replace(/\s+/g, " ").trim();
    const result: LlmCleanResult = {
      text: collapsed,
      hadReasoningContent: hadReasoning,
    };
    return result;
  }
}
