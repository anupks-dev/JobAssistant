import { describe, expect, it } from "vitest";
import { z } from "zod";
import { JsonExtractor } from "./JsonExtractor";
import { LlmResult } from "./LlmClient";
import { StructuredCompletion, StructuredCompletionOptions, StructuredCompletionResult } from "./StructuredCompletion";
import { FakeLlmClient, MutableClock } from "./testing/LlmTestSupport";

const ScoreSchema = z.object({ score: z.number() });
type Score = z.infer<typeof ScoreSchema>;

function reply(text: string, usedFallback: boolean): LlmResult {
  return { text: text, modelUsed: "fake/model", latencyMs: 1, usedFallback: usedFallback, hadReasoningContent: false };
}

function options(fallbackModelAvailable: boolean): StructuredCompletionOptions<Score> {
  return {
    taskName: "test",
    systemPrompt: "system",
    userPrompt: "JOB TEXT SECRET-MARKER",
    temperature: 0.2,
    maxTokens: 10,
    schema: ScoreSchema,
    fallbackModelAvailable: fallbackModelAvailable,
  };
}

function build(): { fake: FakeLlmClient; completion: StructuredCompletion } {
  const fake: FakeLlmClient = new FakeLlmClient(new MutableClock(new Date("2026-01-01T00:00:00Z")));
  return { fake: fake, completion: new StructuredCompletion(fake, new JsonExtractor()) };
}

describe("StructuredCompletion", () => {
  it("returns the value on the first valid reply", async () => {
    const harness: ReturnType<typeof build> = build();
    harness.fake.queueResult(reply("{\"score\": 5}", false));
    const result: StructuredCompletionResult<Score> = await harness.completion.complete(options(true));
    expect(result.ok).toBe(true);
    expect(harness.fake.calls.length).toBe(1);
  });

  it("retries once with a correction that carries validation errors only", async () => {
    const harness: ReturnType<typeof build> = build();
    harness.fake.queueResult(reply("{\"score\": \"high\"}", false));
    harness.fake.queueResult(reply("{\"score\": 7}", false));
    const result: StructuredCompletionResult<Score> = await harness.completion.complete(options(true));
    expect(result.ok).toBe(true);
    expect(harness.fake.calls.length).toBe(2);
    const correction: string = harness.fake.calls[1].request.userPrompt;
    expect(correction).toContain("score");
    expect(correction).not.toContain("high");
  });

  it("asks the fallback model once, then returns a typed failure", async () => {
    const harness: ReturnType<typeof build> = build();
    harness.fake.queueResult(reply("not json", false));
    harness.fake.queueResult(reply("still not json", false));
    harness.fake.queueResult(reply("nope", true));
    const result: StructuredCompletionResult<Score> = await harness.completion.complete(options(true));
    expect(result.ok).toBe(false);
    expect(harness.fake.calls.length).toBe(3);
    expect(harness.fake.calls[2].request.useFallbackModel).toBe(true);
  });

  it("skips the fallback when none is available", async () => {
    const harness: ReturnType<typeof build> = build();
    harness.fake.queueResult(reply("bad", false));
    harness.fake.queueResult(reply("bad", false));
    const result: StructuredCompletionResult<Score> = await harness.completion.complete(options(false));
    expect(result.ok).toBe(false);
    expect(harness.fake.calls.length).toBe(2);
    if (!result.ok) {
      expect(result.reason).toBe("parse");
    }
  });

  it("reports api failures as a typed failure", async () => {
    const harness: ReturnType<typeof build> = build();
    harness.fake.queueError(new Error("down"));
    harness.fake.queueError(new Error("down"));
    const result: StructuredCompletionResult<Score> = await harness.completion.complete(options(false));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("api");
    }
  });
});
