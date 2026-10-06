export type UrlCheckMode = "allowlist" | "any-https";

export interface SourceDefinition {
  id: string;
  displayName: string;
  siteUrl: string;
  allowedHosts: string[];
  urlMode: UrlCheckMode;
}

// Hosts the HTTP client and URL check are allowed to contact. Anything else is rejected.
export class SourceCatalog {
  private readonly sources: SourceDefinition[];

  public constructor() {
    const sources: SourceDefinition[] = [];
    sources.push({
      id: "remoteok",
      displayName: "Remote OK",
      siteUrl: "https://remoteok.com",
      allowedHosts: ["remoteok.com", "www.remoteok.com"],
      urlMode: "allowlist",
    });
    sources.push({
      id: "remotive",
      displayName: "Remotive",
      siteUrl: "https://remotive.com",
      allowedHosts: ["remotive.com", "www.remotive.com"],
      urlMode: "allowlist",
    });
    sources.push({
      id: "weworkremotely",
      displayName: "We Work Remotely",
      siteUrl: "https://weworkremotely.com",
      allowedHosts: ["weworkremotely.com", "www.weworkremotely.com"],
      urlMode: "allowlist",
    });
    sources.push({
      id: "himalayas",
      displayName: "Himalayas",
      siteUrl: "https://himalayas.app",
      allowedHosts: ["himalayas.app", "www.himalayas.app"],
      urlMode: "allowlist",
    });
    sources.push({
      id: "arbeitnow",
      displayName: "Arbeitnow",
      siteUrl: "https://www.arbeitnow.com",
      allowedHosts: [
        "arbeitnow.com",
        "www.arbeitnow.com",
        "arbeitnow.ch",
        "www.arbeitnow.ch",
        "arbeitnow.fr",
        "www.arbeitnow.fr",
      ],
      urlMode: "allowlist",
    });
    sources.push({
      id: "hackernews",
      displayName: "Hacker News",
      siteUrl: "https://news.ycombinator.com",
      allowedHosts: ["hn.algolia.com", "news.ycombinator.com"],
      urlMode: "allowlist",
    });
    sources.push({
      id: "adzuna",
      displayName: "Adzuna",
      siteUrl: "https://www.adzuna.in",
      allowedHosts: ["api.adzuna.com", "www.adzuna.in", "adzuna.in"],
      urlMode: "allowlist",
    });
    sources.push({
      id: "greenhouse",
      displayName: "Greenhouse",
      siteUrl: "https://job-boards.greenhouse.io",
      allowedHosts: ["boards-api.greenhouse.io"],
      urlMode: "any-https",
    });
    sources.push({
      id: "lever",
      displayName: "Lever",
      siteUrl: "https://jobs.lever.co",
      allowedHosts: ["api.lever.co"],
      urlMode: "any-https",
    });
    sources.push({
      id: "ashby",
      displayName: "Ashby",
      siteUrl: "https://jobs.ashbyhq.com",
      allowedHosts: ["api.ashbyhq.com"],
      urlMode: "any-https",
    });
    this.sources = sources;
  }

  public findById(sourceId: string): SourceDefinition | null {
    for (let index: number = 0; index < this.sources.length; index++) {
      const source: SourceDefinition = this.sources[index];
      if (source.id === sourceId) {
        return source;
      }
    }
    return null;
  }

  public list(): SourceDefinition[] {
    const copy: SourceDefinition[] = [];
    for (let index: number = 0; index < this.sources.length; index++) {
      copy.push(this.sources[index]);
    }
    return copy;
  }

  public urlMode(sourceId: string): UrlCheckMode | null {
    const source: SourceDefinition | null = this.findById(sourceId);
    if (source === null) {
      return null;
    }
    return source.urlMode;
  }

  public isHostAllowed(sourceId: string, host: string): boolean {
    const source: SourceDefinition | null = this.findById(sourceId);
    if (source === null) {
      return false;
    }
    const normalized: string = host.toLowerCase();
    for (let index: number = 0; index < source.allowedHosts.length; index++) {
      if (source.allowedHosts[index].toLowerCase() === normalized) {
        return true;
      }
    }
    return false;
  }
}
