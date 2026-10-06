import { describe, expect, it } from "vitest";
import { LlmResponseCleaner } from "./LlmResponseCleaner";

const THINK_OPEN: string = "<" + "think" + ">";
const THINK_CLOSE: string = "</" + "think" + ">";

describe("LlmResponseCleaner", () => {
  it("strips reasoning_content and redacted thinking blocks", () => {
    const cleaner: LlmResponseCleaner = new LlmResponseCleaner();
    const raw: string = "Answer here. " + THINK_OPEN + "secret steps" + THINK_CLOSE + " Done.";
    const cleaned: ReturnType<LlmResponseCleaner["clean"]> = cleaner.clean(raw, "hidden reasoning");
    expect(cleaned.text).toBe("Answer here. Done.");
    expect(cleaned.hadReasoningContent).toBe(true);
  });
});
