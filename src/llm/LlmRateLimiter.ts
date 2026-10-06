import { Clock } from "../fetchers/Clock";

export interface Sleeper {
  sleep(milliseconds: number): Promise<void>;
}

// Spaces LLM calls so the account stays under the configured requests-per-minute cap.
export class LlmRateLimiter {
  private lastCallAtMs: number = 0;

  public constructor(
    private readonly requestsPerMinute: number,
    private readonly clock: Clock,
    private readonly sleeper: Sleeper,
  ) {}

  public async acquire(): Promise<void> {
    const minimumGapMs: number = Math.ceil(60000 / this.requestsPerMinute);
    const nowMs: number = this.clock.now().getTime();
    if (this.lastCallAtMs > 0) {
      const elapsedMs: number = nowMs - this.lastCallAtMs;
      if (elapsedMs < minimumGapMs) {
        await this.sleeper.sleep(minimumGapMs - elapsedMs);
      }
    }
    this.lastCallAtMs = this.clock.now().getTime();
  }
}
