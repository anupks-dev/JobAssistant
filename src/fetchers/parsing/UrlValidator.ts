import { SourceCatalog, UrlCheckMode } from "../SourceCatalog";

export type UrlRejection = "invalid_url" | "host";

export class UrlValidator {
  public constructor(private readonly catalog: SourceCatalog) {}

  public isAllowed(url: string, sourceId: string): boolean {
    return this.rejection(url, sourceId) === null;
  }

  public rejection(url: string, sourceId: string): UrlRejection | null {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return "invalid_url";
    }
    if (parsed.protocol !== "https:") {
      return "invalid_url";
    }
    const mode: UrlCheckMode | null = this.catalog.urlMode(sourceId);
    if (mode === null) {
      return "host";
    }
    if (mode === "any-https") {
      return this.rejectOpenHttps(parsed);
    }
    const host: string = parsed.hostname.toLowerCase();
    if (!this.catalog.isHostAllowed(sourceId, host)) {
      return "host";
    }
    return null;
  }

  // ATS job links can live on any host the board chose. Credentials and IP hosts stay rejected.
  private rejectOpenHttps(parsed: URL): UrlRejection | null {
    if (parsed.username.length > 0 || parsed.password.length > 0) {
      return "invalid_url";
    }
    if (this.isIpLiteral(parsed.hostname)) {
      return "invalid_url";
    }
    return null;
  }

  private isIpLiteral(hostname: string): boolean {
    const host: string = hostname.toLowerCase();
    if (host.indexOf(":") >= 0) {
      return true;
    }
    return /^(?:\d{1,3}\.){3}\d{1,3}$/.test(host);
  }
}
