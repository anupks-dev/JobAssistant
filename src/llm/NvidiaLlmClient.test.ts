import OpenAI from "openai";
import { describe, expect, it } from "vitest";
import { ErrorSanitizer } from "../db/ErrorSanitizer";
import { LlmRequest, LlmResult } from "./LlmClient";
import { LlmResponseCleaner } from "./LlmResponseCleaner";
import { NvidiaLlmClient, NvidiaLlmSettings } from "./NvidiaLlmClient";
import { MutableClock } from "./testing/LlmTestSupport";

const THINK_OPEN: string = "<" + "think" + ">";
const THINK_CLOSE: string = "</" + "think" + ">";

const SETTINGS: NvidiaLlmSettings = {
  primaryModel: "fake/primary",
  fallbackModel: "fake/fallback",
  timeoutSeconds: 5,
  baseUrl: "http://localhost.test/v1",
};

const REQUEST: LlmRequest = { taskName: "test", systemPrompt: "s", userPrompt: "u", temperature: 0.2, maxTokens: 10 };

class FakeOpenAiHandle {
  public lastParams: Record<string, unknown> | null = null;

  public constructor(private readonly responseBody: Record<string, unknown>) {}

  // The SDK is replaced by a minimal object exposing only chat.completions.create.
  public asClient(): OpenAI {
    const handle: FakeOpenAiHandle = this;
    const fake: unknown = {
      chat: {
        completions: {
          create: async (params: Record<string, unknown>): Promise<Record<string, unknown>> => {
            handle.lastParams = params;
            return handle.responseBody;
          },
        },
      },
    };
    return fake as OpenAI;
  }
}

function buildClient(handle: FakeOpenAiHandle): NvidiaLlmClient {
  return new NvidiaLlmClient(
    "fake-key",
    SETTINGS,
    new MutableClock(new Date("2026-01-01T00:00:00Z")),
    new LlmResponseCleaner(),
    new ErrorSanitizer(),
    () => handle.asClient(),
  );
}

describe("NvidiaLlmClient", () => {
  it("sends enable_thinking false as an extra body field and strips reasoning", async () => {
    const handle: FakeOpenAiHandle = new FakeOpenAiHandle({
      model: "fake/primary",
      choices: [{ message: { content: THINK_OPEN + "plan" + THINK_CLOSE + "Hello there", reasoning_content: "hidden" } }],
    });
    const result: LlmResult = await buildClient(handle).complete(REQUEST);
    expect(result.text).toBe("Hello there");
    expect(result.hadReasoningContent).toBe(true);
    expect(handle.lastParams?.chat_template_kwargs).toEqual({ enable_thinking: false });
    expect(handle.lastParams?.stream).toBe(false);
    expect(handle.lastParams?.model).toBe("fake/primary");
  });

  it("uses the fallback model when requested", async () => {
    const handle: FakeOpenAiHandle = new FakeOpenAiHandle({ choices: [{ message: { content: "ok" } }] });
    const result: LlmResult = await buildClient(handle).complete({ ...REQUEST, useFallbackModel: true });
    expect(handle.lastParams?.model).toBe("fake/fallback");
    expect(result.usedFallback).toBe(true);
    expect(result.hadReasoningContent).toBe(false);
  });
});
