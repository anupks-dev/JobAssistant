import { ApiUsageRepository } from "../../db/repositories/ApiUsageRepository";
import { Clock } from "../../fetchers/Clock";
import { Sleeper } from "../LlmRateLimiter";
import { LlmClient, LlmRequest, LlmResult } from "../LlmClient";
import { LlmRetryableError } from "../LlmError";

export class MutableClock implements Clock {
  private current: Date;

  public constructor(start: Date) {
    this.current = start;
  }

  public now(): Date {
    return new Date(this.current.getTime());
  }

  public advance(milliseconds: number): void {
    this.current = new Date(this.current.getTime() + milliseconds);
  }

  public set(date: Date): void {
    this.current = new Date(date.getTime());
  }
}

export class RecordingSleeper implements Sleeper {
  public readonly sleeps: number[] = [];

  public constructor(private readonly clock: MutableClock) {}

  public async sleep(milliseconds: number): Promise<void> {
    this.sleeps.push(milliseconds);
    this.clock.advance(milliseconds);
  }
}

export class InMemoryApiUsageRepository implements ApiUsageRepository {
  private readonly counts: Map<string, number> = new Map<string, number>();

  public increment(source: string, dayIso: string): void {
    const key: string = source + ":" + dayIso;
    const current: number = this.counts.get(key) ?? 0;
    this.counts.set(key, current + 1);
  }

  public getDayCount(source: string, dayIso: string): number {
    const key: string = source + ":" + dayIso;
    return this.counts.get(key) ?? 0;
  }

  public getMonthCount(_source: string, _monthPrefix: string): number {
    return 0;
  }
}

export interface FakeLlmCall {
  request: LlmRequest;
  atMs: number;
}

export class FakeLlmClient implements LlmClient {
  public readonly calls: FakeLlmCall[] = [];
  private readonly responses: LlmResult[] = [];
  private readonly errors: Error[] = [];

  public constructor(private readonly clock: Clock) {}

  public queueResult(result: LlmResult): void {
    this.responses.push(result);
  }

  public queueError(error: Error): void {
    this.errors.push(error);
  }

  public async complete(request: LlmRequest): Promise<LlmResult> {
    this.calls.push({
      request: request,
      atMs: this.clock.now().getTime(),
    });
    if (this.errors.length > 0) {
      const error: Error = this.errors.shift() as Error;
      throw error;
    }
    if (this.responses.length > 0) {
      const result: LlmResult = this.responses.shift() as LlmResult;
      return result;
    }
    const fallback: LlmResult = {
      text: "{}",
      modelUsed: "fake/model",
      latencyMs: 1,
      usedFallback: request.useFallbackModel === true,
      hadReasoningContent: false,
    };
    return fallback;
  }
}

export function retryableStatus(statusCode: number, retryAfterMs: number | null): LlmRetryableError {
  return new LlmRetryableError("retryable", statusCode, retryAfterMs);
}
