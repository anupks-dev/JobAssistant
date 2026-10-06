import { describe, expect, it } from "vitest";
import { SourceCatalog } from "../SourceCatalog";
import { FetchHttpClient, FetchHttpClientOptions, Sleeper } from "./FetchHttpClient";

class RecordingSleeper implements Sleeper {
  public readonly waits: number[] = [];

  public async sleep(milliseconds: number): Promise<void> {
    this.waits.push(milliseconds);
  }
}

class ScriptedFetch {
  public readonly urls: string[] = [];
  public lastInit: RequestInit | null = null;
  private index: number = 0;

  public constructor(private readonly responses: Response[]) {}

  public async fetch(url: string, init: RequestInit): Promise<Response> {
    this.urls.push(url);
    this.lastInit = init;
    const response: Response = this.responses[this.index];
    this.index = this.index + 1;
    return response;
  }
}

function jsonResponse(status: number, body: string, extraHeaders: Record<string, string>): Response {
  const headers: Record<string, string> = { "content-type": "application/json" };
  const names: string[] = Object.keys(extraHeaders);
  for (let index: number = 0; index < names.length; index++) {
    headers[names[index]] = extraHeaders[names[index]];
  }
  return new Response(body, { status: status, headers: headers });
}

function client(script: ScriptedFetch, sleeper: RecordingSleeper, maxResponseBytes: number): FetchHttpClient {
  const options: FetchHttpClientOptions = {
    timeoutMs: 15000,
    maxResponseBytes: maxResponseBytes,
    maxRetries: 3,
  };
  return new FetchHttpClient(new SourceCatalog(), (url: string, init: RequestInit): Promise<Response> => {
    return script.fetch(url, init);
  }, sleeper, options);
}

function userAgent(init: RequestInit | null): string {
  if (init === null || init.headers === undefined || init.headers instanceof Headers || Array.isArray(init.headers)) {
    return "";
  }
  return init.headers["user-agent"] ?? "";
}

describe("FetchHttpClient", () => {
  it("retries 429 and honors Retry-After", async () => {
    const script: ScriptedFetch = new ScriptedFetch([
      jsonResponse(429, "", { "retry-after": "2" }),
      jsonResponse(200, "{\"ok\":true}", {}),
    ]);
    const sleeper: RecordingSleeper = new RecordingSleeper();
    const http: FetchHttpClient = client(script, sleeper, 1024);
    const result = await http.get("https://remoteok.com/api", "remoteok", 0);
    expect(result.status).toBe(200);
    expect(result.bodyText).toBe("{\"ok\":true}");
    expect(sleeper.waits.length).toBe(1);
    expect(sleeper.waits[0]).toBeGreaterThanOrEqual(2000);
    expect(userAgent(script.lastInit)).toBe("JobAgent/0.1 (personal use)");
  });

  it("retries a 503 with backoff", async () => {
    const script: ScriptedFetch = new ScriptedFetch([
      jsonResponse(503, "", {}),
      jsonResponse(200, "{\"ok\":true}", {}),
    ]);
    const sleeper: RecordingSleeper = new RecordingSleeper();
    const http: FetchHttpClient = client(script, sleeper, 1024);
    const result = await http.get("https://remoteok.com/api", "remoteok", 0);
    expect(result.status).toBe(200);
    expect(sleeper.waits[0]).toBe(1000);
  });

  it("rejects a host that is not allowlisted", async () => {
    const script: ScriptedFetch = new ScriptedFetch([]);
    const sleeper: RecordingSleeper = new RecordingSleeper();
    const http: FetchHttpClient = client(script, sleeper, 1024);
    await expect(http.get("https://evil.example/jobs", "remoteok", 0)).rejects.toThrow("Host is not allowlisted.");
    expect(script.urls.length).toBe(0);
  });

  it("rejects plain HTTP", async () => {
    const script: ScriptedFetch = new ScriptedFetch([]);
    const sleeper: RecordingSleeper = new RecordingSleeper();
    const http: FetchHttpClient = client(script, sleeper, 1024);
    await expect(http.get("http://remoteok.com/api", "remoteok", 0)).rejects.toThrow("Only HTTPS requests are allowed.");
  });

  it("rejects an oversized body", async () => {
    const script: ScriptedFetch = new ScriptedFetch([
      jsonResponse(200, "0123456789", {}),
    ]);
    const sleeper: RecordingSleeper = new RecordingSleeper();
    const http: FetchHttpClient = client(script, sleeper, 8);
    await expect(http.get("https://remoteok.com/api", "remoteok", 0)).rejects.toThrow("Response exceeded the size limit.");
  });
});
