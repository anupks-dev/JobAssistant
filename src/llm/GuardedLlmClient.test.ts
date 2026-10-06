import { describe, expect, it } from "vitest";
import { PiiRedactor } from "../profile/PiiRedactor";
import { PiiValues } from "../profile/PiiValueStore";
import { GuardedLlmClient } from "./GuardedLlmClient";
import { LlmRequest } from "./LlmClient";
import { PiiGuard, PiiLeakError } from "./PiiGuard";
import { FakeLlmClient, MutableClock } from "./testing/LlmTestSupport";

const FAKE_EMAIL: string = "jordan.hale@example.com";
const FAKE_PHONE: string = "9876543210";
const FAKE_NAME: string = "Jordan Hale";

function buildGuard(): PiiGuard {
  const values: PiiValues = {
    fullName: FAKE_NAME,
    alternateNames: [],
    emails: [FAKE_EMAIL],
    phones: [FAKE_PHONE],
    addresses: [],
    otherValues: [],
  };
  return new PiiGuard(new PiiRedactor(values));
}

function buildRequest(systemPrompt: string, userPrompt: string): LlmRequest {
  return { taskName: "test", systemPrompt: systemPrompt, userPrompt: userPrompt, temperature: 0.2, maxTokens: 10 };
}

describe("GuardedLlmClient", () => {
  it("blocks an email, a phone number and a name and makes no inner call", async () => {
    const inner: FakeLlmClient = new FakeLlmClient(new MutableClock(new Date("2026-01-01T00:00:00Z")));
    const client: GuardedLlmClient = new GuardedLlmClient(inner, buildGuard());
    const leakyPrompts: string[] = [FAKE_EMAIL, FAKE_PHONE, FAKE_NAME];
    for (let index: number = 0; index < leakyPrompts.length; index++) {
      let caught: unknown = null;
      try {
        await client.complete(buildRequest("system", "Contact " + leakyPrompts[index] + " today."));
      } catch (error: unknown) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(PiiLeakError);
      const message: string = (caught as Error).message;
      expect(message).not.toContain(leakyPrompts[index]);
    }
    expect(inner.calls.length).toBe(0);
  });

  it("checks the system prompt as well as the user prompt", async () => {
    const inner: FakeLlmClient = new FakeLlmClient(new MutableClock(new Date("2026-01-01T00:00:00Z")));
    const client: GuardedLlmClient = new GuardedLlmClient(inner, buildGuard());
    await expect(client.complete(buildRequest("Owner is " + FAKE_NAME, "hello"))).rejects.toThrow(PiiLeakError);
    expect(inner.calls.length).toBe(0);
  });

  it("forwards clean prompts to the inner client", async () => {
    const inner: FakeLlmClient = new FakeLlmClient(new MutableClock(new Date("2026-01-01T00:00:00Z")));
    const client: GuardedLlmClient = new GuardedLlmClient(inner, buildGuard());
    await client.complete(buildRequest("system", "TypeScript engineer"));
    expect(inner.calls.length).toBe(1);
  });
});
