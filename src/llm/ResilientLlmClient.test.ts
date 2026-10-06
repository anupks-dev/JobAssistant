import { describe, expect, it } from "vitest";
import { LlmRequest, LlmResult } from "./LlmClient";
import { LlmRateLimiter } from "./LlmRateLimiter";
import { ResilientLlmClient } from "./ResilientLlmClient";
import {
  FakeLlmClient,
  InMemoryApiUsageRepository,
  MutableClock,
  RecordingSleeper,
  retryableStatus,
} from "./testing/LlmTestSupport";

const REQUEST: LlmRequest = { taskName: "test", systemPrompt: "s", userPrompt: "u", temperature: 0.2, maxTokens: 10 };

class Harness {
  public readonly clock: MutableClock = new MutableClock(new Date("2026-03-05T10:00:00Z"));
  public readonly sleeper: RecordingSleeper = new RecordingSleeper(this.clock);
  public readonly inner: FakeLlmClient = new FakeLlmClient(this.clock);
  public readonly usage: InMemoryApiUsageRepository = new InMemoryApiUsageRepository();
  public readonly client: ResilientLlmClient;

  public constructor(fallbackAvailable: boolean) {
    const limiter: LlmRateLimiter = new LlmRateLimiter(30, this.clock, this.sleeper);
    this.client = new ResilientLlmClient(this.inner, limiter, this.usage, this.clock, this.sleeper, fallbackAvailable);
  }
}

describe("ResilientLlmClient", () => {
  it("retries on 429 and honors Retry-After", async () => {
    const harness: Harness = new Harness(false);
    harness.inner.queueError(retryableStatus(429, 7000));
    const result: LlmResult = await harness.client.complete(REQUEST);
    expect(result.text).toBe("{}");
    expect(harness.inner.calls.length).toBe(2);
    expect(harness.sleeper.sleeps).toContain(7000);
  });

  it("retries on 5xx with exponential backoff and gives up after three attempts", async () => {
    const harness: Harness = new Harness(false);
    harness.inner.queueError(retryableStatus(503, null));
    harness.inner.queueError(retryableStatus(500, null));
    harness.inner.queueError(retryableStatus(502, null));
    await expect(harness.client.complete(REQUEST)).rejects.toThrow();
    expect(harness.inner.calls.length).toBe(3);
    expect(harness.sleeper.sleeps).toContain(1000);
    expect(harness.sleeper.sleeps).toContain(2000);
    expect(harness.usage.getDayCount("nvidia", "2026-03-05")).toBe(0);
  });

  it("does not retry non-retryable errors", async () => {
    const harness: Harness = new Harness(false);
    harness.inner.queueError(new Error("bad request"));
    await expect(harness.client.complete(REQUEST)).rejects.toThrow("bad request");
    expect(harness.inner.calls.length).toBe(1);
  });

  it("uses the fallback model after the primary fails twice", async () => {
    const harness: Harness = new Harness(true);
    harness.inner.queueError(retryableStatus(500, null));
    harness.inner.queueError(retryableStatus(500, null));
    const result: LlmResult = await harness.client.complete(REQUEST);
    expect(harness.inner.calls.length).toBe(3);
    expect(harness.inner.calls[0].request.useFallbackModel).toBe(false);
    expect(harness.inner.calls[1].request.useFallbackModel).toBe(false);
    expect(harness.inner.calls[2].request.useFallbackModel).toBe(true);
    expect(result.usedFallback).toBe(true);
  });

  it("never switches to the fallback when none is configured", async () => {
    const harness: Harness = new Harness(false);
    harness.inner.queueError(retryableStatus(500, null));
    harness.inner.queueError(retryableStatus(500, null));
    await harness.client.complete(REQUEST);
    expect(harness.inner.calls[2].request.useFallbackModel).toBe(false);
  });

  it("spaces calls with the rate limiter using the fake clock", async () => {
    const harness: Harness = new Harness(false);
    await harness.client.complete(REQUEST);
    await harness.client.complete(REQUEST);
    await harness.client.complete(REQUEST);
    expect(harness.inner.calls[1].atMs - harness.inner.calls[0].atMs).toBeGreaterThanOrEqual(2000);
    expect(harness.inner.calls[2].atMs - harness.inner.calls[1].atMs).toBeGreaterThanOrEqual(2000);
  });

  it("counts one usage per successful call", async () => {
    const harness: Harness = new Harness(false);
    await harness.client.complete(REQUEST);
    await harness.client.complete(REQUEST);
    expect(harness.usage.getDayCount("nvidia", "2026-03-05")).toBe(2);
  });
});
