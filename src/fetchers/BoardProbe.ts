import { AtsType } from "../db/repositories/CompanyRepository";
import { HttpClient, HttpResponseResult } from "./http/HttpClient";
import { Sleeper } from "./http/FetchHttpClient";
import { JsonFields } from "./parsing/JsonFields";
import { BoardSlugValidator } from "./parsing/BoardSlugValidator";
import { AtsName } from "./sources/AtsBoardConfig";
import { AtsCompanyGate } from "./sources/AtsCompanyGate";

export interface BoardProbeResult {
  slug: string;
  ats: AtsType;
  jobCount: number;
  line: string;
}

interface ProbeHit {
  ats: AtsName;
  jobCount: number;
}

export class BoardProbe {
  public constructor(
    private readonly httpClient: HttpClient,
    private readonly companies: AtsCompanyGate,
    private readonly sleeper: Sleeper,
    private readonly slugValidator: BoardSlugValidator,
    private readonly requestDelayMs: number,
  ) {}

  public async probe(slugs: string[]): Promise<BoardProbeResult[]> {
    const results: BoardProbeResult[] = [];
    let requestsMade: number = 0;
    for (let index: number = 0; index < slugs.length; index++) {
      const slug: string = slugs[index];
      if (!this.slugValidator.isValid(slug)) {
        results.push(this.result(slug, "none", 0, slug + " invalid slug"));
        continue;
      }
      const hit: ProbeHit | null = await this.probeSlug(slug, requestsMade);
      requestsMade = requestsMade + 3;
      if (hit === null) {
        this.remember(slug, "none", null);
        results.push(this.result(slug, "none", 0, slug + " no supported board"));
        continue;
      }
      this.remember(slug, hit.ats, slug);
      results.push(this.result(slug, hit.ats, hit.jobCount, slug + " ats=" + hit.ats + " jobs=" + String(hit.jobCount)));
    }
    return results;
  }

  private async probeSlug(slug: string, requestsMade: number): Promise<ProbeHit | null> {
    const greenhouse: ProbeHit | null = await this.ask(slug, "greenhouse", requestsMade, (body: string): number | null => {
      return this.countObjectList(body, "jobs");
    });
    const lever: ProbeHit | null = await this.ask(slug, "lever", requestsMade + 1, (body: string): number | null => {
      return this.countArray(body);
    });
    const ashby: ProbeHit | null = await this.ask(slug, "ashby", requestsMade + 2, (body: string): number | null => {
      return this.countObjectList(body, "jobs");
    });
    if (greenhouse !== null) {
      return greenhouse;
    }
    if (lever !== null) {
      return lever;
    }
    return ashby;
  }

  private async ask(
    slug: string,
    ats: AtsName,
    requestIndex: number,
    count: (body: string) => number | null,
  ): Promise<ProbeHit | null> {
    if (requestIndex > 0 && this.requestDelayMs > 0) {
      await this.sleeper.sleep(this.requestDelayMs);
    }
    try {
      const response: HttpResponseResult = await this.httpClient.get(this.endpoint(ats, slug), ats, 0);
      if (response.status < 200 || response.status >= 300) {
        return null;
      }
      const jobCount: number | null = count(response.bodyText);
      if (jobCount === null) {
        return null;
      }
      const hit: ProbeHit = { ats: ats, jobCount: jobCount };
      return hit;
    } catch {
      return null;
    }
  }

  private endpoint(ats: AtsName, slug: string): string {
    if (ats === "greenhouse") {
      return "https://boards-api.greenhouse.io/v1/boards/" + slug + "/jobs?content=true";
    }
    if (ats === "lever") {
      return "https://api.lever.co/v0/postings/" + slug + "?mode=json";
    }
    return "https://api.ashbyhq.com/posting-api/job-board/" + slug + "?includeCompensation=true";
  }

  private countObjectList(bodyText: string, key: string): number | null {
    const parsed: unknown = this.parseJson(bodyText);
    const record: Record<string, unknown> | null = JsonFields.record(parsed);
    if (record === null) {
      return null;
    }
    return this.listLength(record[key]);
  }

  private countArray(bodyText: string): number | null {
    return this.listLength(this.parseJson(bodyText));
  }

  private listLength(value: unknown): number | null {
    if (!Array.isArray(value)) {
      return null;
    }
    let count: number = 0;
    for (let index: number = 0; index < value.length; index++) {
      count = count + 1;
    }
    return count;
  }

  private parseJson(bodyText: string): unknown {
    try {
      return JSON.parse(bodyText) as unknown;
    } catch {
      return null;
    }
  }

  private remember(slug: string, atsType: AtsType, boardSlug: string | null): void {
    this.companies.save(slug, atsType, boardSlug);
  }

  private result(slug: string, ats: AtsType, jobCount: number, line: string): BoardProbeResult {
    const result: BoardProbeResult = {
      slug: slug,
      ats: ats,
      jobCount: jobCount,
      line: line,
    };
    return result;
  }
}
