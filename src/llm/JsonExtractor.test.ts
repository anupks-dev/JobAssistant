import { describe, expect, it } from "vitest";
import { JsonExtractor } from "./JsonExtractor";

describe("JsonExtractor", () => {
  it("extracts JSON from code fences and surrounding prose", () => {
    const extractor: JsonExtractor = new JsonExtractor();
    const text: string = "Here is the answer:\n```json\n{\"score\": 88}\n```\nThanks.";
    const result: ReturnType<JsonExtractor["extract"]> = extractor.extract(text);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual({ score: 88 });
    }
  });

  it("handles nested braces inside strings", () => {
    const extractor: JsonExtractor = new JsonExtractor();
    const text: string = "{\"note\": \"use { and } carefully\", \"value\": 1}";
    const result: ReturnType<JsonExtractor["extract"]> = extractor.extract(text);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual({ note: "use { and } carefully", value: 1 });
    }
  });

  it("returns a typed failure for invalid JSON", () => {
    const extractor: JsonExtractor = new JsonExtractor();
    const result: ReturnType<JsonExtractor["extract"]> = extractor.extract("{not json}");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("Invalid JSON");
    }
  });
});
