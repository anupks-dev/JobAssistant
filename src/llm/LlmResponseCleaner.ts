const OPEN_TAG: string = "<" + "think" + ">";
const CLOSE_TAG: string = "</" + "think" + ">";
// Non-global on purpose: a global regex keeps lastIndex between test() calls.
const THINKING_BLOCK_PATTERN: RegExp = new RegExp(OPEN_TAG + "[\\s\\S]*?" + CLOSE_TAG, "i");
const THINKING_BLOCK_REPLACER: RegExp = new RegExp(OPEN_TAG + "[\\s\\S]*?" + CLOSE_TAG, "gi");
// An unclosed block means the reply was cut off mid-reasoning; drop everything after the tag.
const UNCLOSED_BLOCK_PATTERN: RegExp = new RegExp(OPEN_TAG + "[\\s\\S]*$", "i");

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
      text = text.replace(THINKING_BLOCK_REPLACER, "");
    }
    if (UNCLOSED_BLOCK_PATTERN.test(text)) {
      hadReasoning = true;
      text = text.replace(UNCLOSED_BLOCK_PATTERN, "");
    }
    const collapsed: string = text.replace(/\s+/g, " ").trim();
    const result: LlmCleanResult = {
      text: collapsed,
      hadReasoningContent: hadReasoning,
    };
    return result;
  }
}
