import { Job } from "../../models/Job";
import { JobFetcher } from "../JobFetcher";
import { HttpClient } from "../http/HttpClient";
import { HtmlToText } from "../parsing/HtmlToText";
import { JsonFields } from "../parsing/JsonFields";
import { RemoteTypeInference } from "../parsing/RemoteTypeInference";
import { SourceCatalog } from "../SourceCatalog";
import { SourcePolicy } from "../SourcePolicy";

const PAGE_LIMIT: number = 20;

export class HimalayasFetcher implements JobFetcher {
  public constructor(
    private readonly httpClient: HttpClient,
    private readonly policy: SourcePolicy,
    private readonly catalog: SourceCatalog,
    private readonly htmlToText: HtmlToText,
    private readonly remoteTypeInference: RemoteTypeInference,
  ) {}

  public getSourceId(): string {
    return "himalayas";
  }

  public getSourceName(): string {
    const source = this.catalog.findById(this.getSourceId());
    if (source === null) {
      return "Himalayas";
    }
    return source.displayName;
  }

  public getPolicy(): SourcePolicy {
    return this.policy;
  }

  public async fetchJobs(): Promise<Job[]> {
    const jobs: Job[] = [];
    const seenIds: string[] = [];
    let cursor: string | null = null;
    const pageCount: number = this.policy.maxPages;
    for (let page: number = 0; page < pageCount; page++) {
      const pageRecord: Record<string, unknown> = await this.fetchPage(cursor);
      const entries: unknown[] = JsonFields.list(pageRecord, "jobs");
      for (let index: number = 0; index < entries.length; index++) {
        const entry: Record<string, unknown> | null = JsonFields.record(entries[index]);
        if (entry === null) {
          continue;
        }
        const job: Job | null = this.toJob(entry);
        if (job !== null && !this.alreadySeen(seenIds, job.externalId)) {
          seenIds.push(job.externalId);
          jobs.push(job);
        }
      }
      cursor = JsonFields.string(pageRecord, "nextCursor");
      if (cursor === null || cursor.trim().length === 0) {
        break;
      }
    }
    return jobs;
  }

  // The saved OpenAPI marks offset as deprecated. Pages are walked with nextCursor.
  private async fetchPage(cursor: string | null): Promise<Record<string, unknown>> {
    let url: string = "https://himalayas.app/jobs/api?limit=" + String(PAGE_LIMIT);
    if (cursor !== null) {
      url = url + "&cursor=" + encodeURIComponent(cursor);
    }
    const response = await this.httpClient.get(url, this.getSourceId(), this.policy.requestDelayMs);
    const parsed: unknown = this.parseJson(response.bodyText);
    const record: Record<string, unknown> | null = JsonFields.record(parsed);
    if (record === null) {
      throw new Error("Himalayas response was not an object.");
    }
    return record;
  }

  private toJob(record: Record<string, unknown>): Job | null {
    const title: string | null = JsonFields.string(record, "title");
    const company: string | null = JsonFields.string(record, "companyName");
    const url: string | null = this.readUrl(record);
    const externalId: string | null = this.readExternalId(record, url);
    if (title === null || company === null || url === null || externalId === null) {
      return null;
    }
    const locations: string[] = JsonFields.stringList(record, "locationRestrictions");
    const location: string = this.joinLocations(locations);
    const salary = this.readSalary(record);
    const description: string = this.htmlToText.toPlainText(JsonFields.string(record, "description") ?? "");
    const job: Job = {
      source: this.getSourceId(),
      externalId: externalId,
      title: title,
      company: company,
      location: location,
      remoteType: this.remoteTypeInference.infer(location, [], "remote"),
      salaryMin: salary.min,
      salaryMax: salary.max,
      currency: salary.currency,
      salaryKnown: salary.known,
      salaryIsEstimated: false,
      url: url,
      postedAt: this.readPostedAt(JsonFields.number(record, "pubDate")),
      description: description,
      descriptionIsSnippet: false,
    };
    return job;
  }

  private readUrl(record: Record<string, unknown>): string | null {
    const applicationLink: string | null = JsonFields.string(record, "applicationLink");
    if (applicationLink !== null && applicationLink.trim().length > 0) {
      return applicationLink.trim();
    }
    const guid: string | null = JsonFields.string(record, "guid");
    if (guid !== null && guid.trim().length > 0) {
      return guid.trim();
    }
    return null;
  }

  private readExternalId(record: Record<string, unknown>, url: string | null): string | null {
    const guid: string | null = JsonFields.string(record, "guid");
    if (guid !== null && guid.trim().length > 0) {
      return guid.trim();
    }
    return url;
  }

  private joinLocations(locations: string[]): string {
    let joined: string = "";
    for (let index: number = 0; index < locations.length; index++) {
      if (index > 0) {
        joined = joined + ", ";
      }
      joined = joined + locations[index];
    }
    return joined;
  }

  private readSalary(record: Record<string, unknown>): { min: number | null; max: number | null; currency: string | null; known: boolean } {
    const period: string = JsonFields.string(record, "salaryPeriod") ?? "annual";
    const minimum: number | null = this.annualAmount(JsonFields.number(record, "minSalary"), period);
    const maximum: number | null = this.annualAmount(JsonFields.number(record, "maxSalary"), period);
    if (minimum === null && maximum === null) {
      return { min: null, max: null, currency: null, known: false };
    }
    let low: number | null = minimum;
    let high: number | null = maximum;
    if (low === null) {
      low = high;
    }
    if (high === null) {
      high = low;
    }
    return {
      min: low,
      max: high,
      currency: JsonFields.string(record, "currency"),
      known: true,
    };
  }

  // minSalary is in salaryPeriod, not already annual. A full-time year is 40 hours by 52 weeks.
  private annualAmount(amount: number | null, period: string): number | null {
    if (amount === null) {
      return null;
    }
    if (period === "annual") {
      return amount;
    }
    if (period === "monthly") {
      return amount * 12;
    }
    if (period === "fortnightly") {
      return amount * 26;
    }
    if (period === "weekly") {
      return amount * 52;
    }
    if (period === "hourly") {
      return amount * 40 * 52;
    }
    return null;
  }

  private readPostedAt(unixSeconds: number | null): Date | null {
    if (unixSeconds === null) {
      return null;
    }
    return new Date(unixSeconds * 1000);
  }

  private alreadySeen(seenIds: string[], externalId: string): boolean {
    for (let index: number = 0; index < seenIds.length; index++) {
      if (seenIds[index] === externalId) {
        return true;
      }
    }
    return false;
  }

  private parseJson(bodyText: string): unknown {
    try {
      return JSON.parse(bodyText) as unknown;
    } catch {
      throw new Error("Himalayas response was not valid JSON.");
    }
  }
}
