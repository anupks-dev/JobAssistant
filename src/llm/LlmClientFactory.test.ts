import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AppConfig } from "../config/AppConfig";
import { ErrorSanitizer } from "../db/ErrorSanitizer";
import { PiiRedactor } from "../profile/PiiRedactor";
import { GuardedLlmClient } from "./GuardedLlmClient";
import { LlmClient } from "./LlmClient";
import { createLlmClient } from "./LlmClientFactory";
import { NvidiaLlmClient } from "./NvidiaLlmClient";
import { PiiGuard } from "./PiiGuard";
import { ResilientLlmClient } from "./ResilientLlmClient";
import { InMemoryApiUsageRepository, MutableClock, RecordingSleeper } from "./testing/LlmTestSupport";

const FAKE_KEY: string = "fake-test-key";

function buildClient(): LlmClient {
  const clock: MutableClock = new MutableClock(new Date("2026-01-01T00:00:00Z"));
  const config: AppConfig = { llm: { requestsPerMinute: 30, timeoutSeconds: 5 } } as unknown as AppConfig;
  return createLlmClient({
    config: config,
    apiUsage: new InMemoryApiUsageRepository(),
    piiGuard: new PiiGuard(new PiiRedactor({ fullName: "", alternateNames: [], emails: [], phones: [], addresses: [], otherValues: [] })),
    clock: clock,
    sleeper: new RecordingSleeper(clock),
    errorSanitizer: new ErrorSanitizer(),
  });
}

describe("createLlmClient", () => {
  const savedEnvironment: Record<string, string | undefined> = {};

  beforeEach(() => {
    savedEnvironment.NVIDIA_API_KEY = process.env.NVIDIA_API_KEY;
    savedEnvironment.NVIDIA_MODEL = process.env.NVIDIA_MODEL;
    process.env.NVIDIA_API_KEY = FAKE_KEY;
    process.env.NVIDIA_MODEL = "fake/model";
  });

  afterEach(() => {
    const names: string[] = Object.keys(savedEnvironment);
    for (let index: number = 0; index < names.length; index++) {
      const saved: string | undefined = savedEnvironment[names[index]];
      if (saved === undefined) {
        delete process.env[names[index]];
      } else {
        process.env[names[index]] = saved;
      }
    }
  });

  it("returns Resilient(Guarded(Nvidia)) and never exposes an unguarded client", () => {
    const client: LlmClient = buildClient();
    expect(client).toBeInstanceOf(ResilientLlmClient);
    const guarded: LlmClient = (client as ResilientLlmClient).getInner();
    expect(guarded).toBeInstanceOf(GuardedLlmClient);
    const innermost: LlmClient = (guarded as GuardedLlmClient).getInner();
    expect(innermost).toBeInstanceOf(NvidiaLlmClient);
    expect(client).not.toBeInstanceOf(NvidiaLlmClient);
  });

  it("fails clearly when the key or model is missing", () => {
    delete process.env.NVIDIA_API_KEY;
    expect(() => buildClient()).toThrow("NVIDIA_API_KEY is not set.");
    process.env.NVIDIA_API_KEY = FAKE_KEY;
    delete process.env.NVIDIA_MODEL;
    expect(() => buildClient()).toThrow("NVIDIA_MODEL is not set.");
  });
});
