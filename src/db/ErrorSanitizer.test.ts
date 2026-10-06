import { describe, expect, it } from "vitest";
import { ErrorSanitizer } from "./ErrorSanitizer";

describe("ErrorSanitizer", () => {
  it("removes API keys and tokens from messages", () => {
    const sanitizer: ErrorSanitizer = new ErrorSanitizer();
    const raw: string = "GET https://user:fake-pass@api.example.com/v1?api_key=fake-key-123&page=2 "
      + "failed: Bearer fake-token-999 token=fake-token-999 sk-fakekey123456";
    const cleaned: string = sanitizer.sanitize(raw);
    expect(cleaned).not.toContain("fake-key-123");
    expect(cleaned).not.toContain("fake-token-999");
    expect(cleaned).not.toContain("fake-pass");
    expect(cleaned).not.toContain("sk-fakekey123456");
    expect(cleaned).toContain("page=2");
    expect(cleaned).toContain("[redacted]");
  });

  it("strips Adzuna app_id and app_key values", () => {
    const sanitizer: ErrorSanitizer = new ErrorSanitizer();
    const raw: string = "request failed https://api.adzuna.com/v1/api/jobs/in/search/1?app_id=fixture-app-id&app_key=fixture-app-key&page=1";
    const cleaned: string = sanitizer.sanitize(raw);
    expect(cleaned).not.toContain("fixture-app-id");
    expect(cleaned).not.toContain("fixture-app-key");
    expect(cleaned).toContain("app_id=[redacted]");
    expect(cleaned).toContain("app_key=[redacted]");
  });

  it("strips Authorization header values and nvapi tokens", () => {
    const sanitizer: ErrorSanitizer = new ErrorSanitizer();
    const raw: string = "401 Authorization: fake-header-value from key nvapi-FAKEtoken_123-abc retry";
    const cleaned: string = sanitizer.sanitize(raw);
    expect(cleaned).not.toContain("fake-header-value");
    expect(cleaned).not.toContain("nvapi-FAKEtoken_123-abc");
    expect(cleaned).toContain("retry");
  });
});
