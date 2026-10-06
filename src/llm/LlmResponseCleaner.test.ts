import { describe, expect, it } from "vitest";
import { LlmResponseCleaner } from "./LlmResponseCleaner";

describe("LlmResponseCleaner", () => {
  it("strips reasoning_content and redacted thinking blocks", () => {
    const cleaner: LlmResponseCleaner = new LlmResponseCleaner();
    const raw: string = "Answer here. <think>secret steps</think> Done.";
    const cleaned: ReturnType<LlmResponseCleaner["clean"]> = cleaner.clean(raw, "hidden reasoning");
    expect(cleaned.text).toBe("Answer here. Done.");
    expect(cleaned.hadReasoningContent).toBe(true);
  });
});
