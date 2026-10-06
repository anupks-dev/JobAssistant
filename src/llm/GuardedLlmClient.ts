import { PiiGuard } from "./PiiGuard";
import { LlmClient, LlmRequest, LlmResult } from "./LlmClient";

// Blocks outbound prompts that still contain personal data.
export class GuardedLlmClient implements LlmClient {
  public constructor(
    private readonly inner: LlmClient,
    private readonly guard: PiiGuard,
  ) {}

  public async complete(request: LlmRequest): Promise<LlmResult> {
    const outgoingText: string = request.systemPrompt + "\n" + request.userPrompt;
    this.guard.assertClean(outgoingText);
    const result: LlmResult = await this.inner.complete(request);
    return result;
  }

  public getInner(): LlmClient {
    return this.inner;
  }
}
