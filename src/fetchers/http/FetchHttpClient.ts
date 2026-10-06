import { HttpClient, HttpResponseResult } from "./HttpClient";
import { SourceCatalog } from "../SourceCatalog";

export interface FetchHttpClientOptions {
  timeoutMs: number;
  maxResponseBytes: number;
  maxRetries: number;
}

export interface Sleeper {
  sleep(milliseconds: number): Promise<void>;
}

export class DelaySleeper implements Sleeper {
  public async sleep(milliseconds: number): Promise<void> {
    await new Promise<void>((resolve: () => void): void => {
      setTimeout(resolve, milliseconds);
    });
  }
}

interface AttemptResult {
  response: HttpResponseResult | null;
  retryable: boolean;
  waitMs: number;
}

const USER_AGENT: string = "JobAgent/0.1 (personal use)";

// Outbound HTTP is restricted to allowlisted HTTPS hosts. Error text never includes the request URL.
export class FetchHttpClient implements HttpClient {
  private readonly lastRequestAt: Map<string, number> = new Map<string, number>();

  public constructor(
    private readonly catalog: SourceCatalog,
    private readonly fetchImpl: (url: string, init: RequestInit) => Promise<Response>,
    private readonly sleeper: Sleeper,
    private readonly options: FetchHttpClientOptions,
  ) {}

  public async get(url: string, sourceId: string, requestDelayMs: number): Promise<HttpResponseResult> {
    let attempt: number = 0;
    while (attempt <= this.options.maxRetries) {
      try {
        const outcome: AttemptResult = await this.attempt(url, sourceId, requestDelayMs, attempt);
        if (outcome.retryable && attempt < this.options.maxRetries) {
          await this.sleeper.sleep(outcome.waitMs);
          attempt = attempt + 1;
          continue;
        }
        if (outcome.response === null) {
          throw new Error("Source request failed.");
        }
        return outcome.response;
      } catch (error: unknown) {
        if (this.isRetryableNetworkError(error) && attempt < this.options.maxRetries) {
          await this.sleeper.sleep(this.backoffMs(attempt));
          attempt = attempt + 1;
          continue;
        }
        throw this.publicError(error);
      }
    }
    throw new Error("Source request failed.");
  }

  private async attempt(url: string, sourceId: string, requestDelayMs: number, attempt: number): Promise<AttemptResult> {
    let currentUrl: string = url;
    let redirects: number = 0;
    while (redirects <= 3) {
      this.assertAllowed(currentUrl, sourceId);
      await this.waitForHost(currentUrl, requestDelayMs);
      const response: Response = await this.fetchImpl(currentUrl, this.requestInit());
      if (this.isRedirect(response.status)) {
        await this.discard(response);
        redirects = redirects + 1;
        if (redirects > 3) {
          throw new Error("Too many redirects.");
        }
        currentUrl = this.nextUrl(currentUrl, response.headers.get("location"));
        continue;
      }
      if (this.isRetryableStatus(response.status)) {
        const waitMs: number = this.retryWaitMs(response.headers.get("retry-after"), attempt);
        await this.discard(response);
        const retry: AttemptResult = { response: null, retryable: true, waitMs: waitMs };
        return retry;
      }
      this.assertContentType(response.headers.get("content-type"));
      const bodyText: string = await this.readBody(response);
      if (response.status < 200 || response.status >= 300) {
        throw new Error("Source request was rejected.");
      }
      const success: AttemptResult = {
        response: {
          status: response.status,
          bodyText: bodyText,
          headers: this.copyHeaders(response),
        },
        retryable: false,
        waitMs: 0,
      };
      return success;
    }
    throw new Error("Too many redirects.");
  }

  private requestInit(): RequestInit {
    const headers: Record<string, string> = {
      accept: "application/json, application/xml, text/xml, application/rss+xml",
      "user-agent": USER_AGENT,
    };
    const init: RequestInit = {
      method: "GET",
      redirect: "manual",
      headers: headers,
      signal: AbortSignal.timeout(this.options.timeoutMs),
    };
    return init;
  }

  private assertAllowed(url: string, sourceId: string): void {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new Error("Request URL was malformed.");
    }
    if (parsed.protocol !== "https:") {
      throw new Error("Only HTTPS requests are allowed.");
    }
    if (!this.catalog.isHostAllowed(sourceId, parsed.hostname)) {
      throw new Error("Host is not allowlisted.");
    }
  }

  private async waitForHost(url: string, requestDelayMs: number): Promise<void> {
    const host: string = new URL(url).hostname;
    const now: number = Date.now();
    const last: number = this.lastRequestAt.get(host) ?? 0;
    const elapsed: number = now - last;
    if (requestDelayMs > 0 && elapsed < requestDelayMs) {
      await this.sleeper.sleep(requestDelayMs - elapsed);
    }
    this.lastRequestAt.set(host, Date.now());
  }

  private nextUrl(currentUrl: string, location: string | null): string {
    if (location === null || location.trim().length === 0) {
      throw new Error("Redirect was missing a location.");
    }
    try {
      return new URL(location, currentUrl).toString();
    } catch {
      throw new Error("Redirect target was malformed.");
    }
  }

  private isRedirect(status: number): boolean {
    return status === 301 || status === 302 || status === 303 || status === 307 || status === 308;
  }

  private isRetryableStatus(status: number): boolean {
    return status === 429 || status >= 500;
  }

  private retryWaitMs(retryAfter: string | null, attempt: number): number {
    const fallback: number = this.backoffMs(attempt);
    if (retryAfter === null) {
      return fallback;
    }
    const seconds: number = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds >= 0) {
      const fromHeader: number = seconds * 1000;
      if (fromHeader > fallback) {
        return fromHeader;
      }
      return fallback;
    }
    const parsed: number = Date.parse(retryAfter);
    if (Number.isNaN(parsed)) {
      return fallback;
    }
    const delay: number = parsed - Date.now();
    if (delay > fallback) {
      return delay;
    }
    return fallback;
  }

  private backoffMs(attempt: number): number {
    let delay: number = 1000;
    for (let index: number = 0; index < attempt; index++) {
      delay = delay * 2;
    }
    return delay;
  }

  private assertContentType(header: string | null): void {
    if (header === null) {
      throw new Error("Response content type is not supported.");
    }
    const lower: string = header.toLowerCase();
    if (lower.indexOf("json") >= 0 || lower.indexOf("xml") >= 0 || lower.indexOf("rss") >= 0) {
      return;
    }
    throw new Error("Response content type is not supported.");
  }

  private async readBody(response: Response): Promise<string> {
    const declared: string | null = response.headers.get("content-length");
    if (declared !== null) {
      const size: number = Number(declared);
      if (Number.isFinite(size) && size > this.options.maxResponseBytes) {
        await this.discard(response);
        throw new Error("Response exceeded the size limit.");
      }
    }
    if (response.body === null) {
      return "";
    }
    const reader: ReadableStreamDefaultReader<Uint8Array> = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let total: number = 0;
    while (true) {
      const next: ReadableStreamReadResult<Uint8Array> = await reader.read();
      if (next.done) {
        break;
      }
      const chunk: Uint8Array = next.value;
      total = total + chunk.byteLength;
      if (total > this.options.maxResponseBytes) {
        await reader.cancel();
        throw new Error("Response exceeded the size limit.");
      }
      chunks.push(chunk);
    }
    const combined: Buffer = Buffer.concat(chunks);
    return combined.toString("utf8");
  }

  private copyHeaders(response: Response): Record<string, string> {
    const headers: Record<string, string> = {};
    response.headers.forEach((value: string, name: string): void => {
      headers[name] = value;
    });
    return headers;
  }

  private async discard(response: Response): Promise<void> {
    if (response.body === null) {
      return;
    }
    await response.body.cancel();
  }

  private isRetryableNetworkError(error: unknown): boolean {
    if (!(error instanceof Error)) {
      return false;
    }
    return error.name === "AbortError" || error.name === "TimeoutError" || error.name === "TypeError";
  }

  private publicError(error: unknown): Error {
    if (error instanceof Error && error.message.indexOf("http://") < 0 && error.message.indexOf("https://") < 0) {
      return error;
    }
    return new Error("Source request failed.");
  }
}
