// Retryable API failures carry a status and optional Retry-After delay in milliseconds.
export class LlmRetryableError extends Error {
  public constructor(
    message: string,
    public readonly statusCode: number | null,
    public readonly retryAfterMs: number | null,
  ) {
    super(message);
    this.name = "LlmRetryableError";
  }
}
