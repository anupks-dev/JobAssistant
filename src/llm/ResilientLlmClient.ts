import { ApiUsageRepository } from "../db/repositories/ApiUsageRepository";
import { Clock } from "../fetchers/Clock";
import { LlmClient, LlmRequest, LlmResult } from "./LlmClient";
import { LlmRetryableError } from "./LlmError";
import { LlmRateLimiter, Sleeper } from "./LlmRateLimiter";

const MAX_ATTEMPTS: number = 3;
const API_USAGE_SOURCE: string = "nvidia";

export class ResilientLlmClient implements LlmClient {
  public constructor(
    private readonly inner: LlmClient,
    private readonly rateLimiter: LlmRateLimiter,
    private readonly apiUsage: ApiUsageRepository,
    private readonly clock: Clock,
    private readonly sleeper: Sleeper,
    private readonly fallbackModelAvailable: boolean,
  ) {}

  public async complete(request: LlmRequest): Promise<LlmResult> {
    await this.rateLimiter.acquire();
    let primaryFailures: number = 0;
    let useFallback: boolean = request.useFallbackModel === true;
    let lastError: Error | null = null;
    for (let attempt: number = 0; attempt < MAX_ATTEMPTS; attempt++) {
      if (!useFallback && this.fallbackModelAvailable && primaryFailures >= 2) {
        useFallback = true;
      }
      const attemptRequest: LlmRequest = {
        taskName: request.taskName,
        systemPrompt: request.systemPrompt,
        userPrompt: request.userPrompt,
        temperature: request.temperature,
        maxTokens: request.maxTokens,
        useFallbackModel: useFallback,
      };
      try {
        const result: LlmResult = await this.inner.complete(attemptRequest);
        this.recordUsage();
        return result;
      } catch (error: unknown) {
        if (!(error instanceof LlmRetryableError)) {
          throw error;
        }
        lastError = error;
        if (!useFallback) {
          primaryFailures = primaryFailures + 1;
        }
        if (attempt >= MAX_ATTEMPTS - 1) {
          break;
        }
        const waitMs: number = this.retryWaitMs(error, attempt);
        await this.sleeper.sleep(waitMs);
      }
    }
    if (lastError !== null) {
      throw lastError;
    }
    throw new Error("LLM request failed.");
  }

  public getInner(): LlmClient {
    return this.inner;
  }

  private recordUsage(): void {
    const dayIso: string = this.dayIso(this.clock.now());
    this.apiUsage.increment(API_USAGE_SOURCE, dayIso);
  }

  private dayIso(date: Date): string {
    const year: number = date.getUTCFullYear();
    const month: number = date.getUTCMonth() + 1;
    const day: number = date.getUTCDate();
    let monthText: string = String(month);
    let dayText: string = String(day);
    if (month < 10) {
      monthText = "0" + monthText;
    }
    if (day < 10) {
      dayText = "0" + dayText;
    }
    return String(year) + "-" + monthText + "-" + dayText;
  }

  private retryWaitMs(error: LlmRetryableError, attempt: number): number {
    const backoffMs: number = this.backoffMs(attempt);
    if (error.retryAfterMs !== null && error.retryAfterMs > backoffMs) {
      return error.retryAfterMs;
    }
    return backoffMs;
  }

  private backoffMs(attempt: number): number {
    let delay: number = 1000;
    for (let index: number = 0; index < attempt; index++) {
      delay = delay * 2;
    }
    return delay;
  }
}
