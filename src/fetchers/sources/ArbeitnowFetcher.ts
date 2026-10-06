import { Job } from "../../models/Job";
import { JobFetcher } from "../JobFetcher";
import { HttpClient } from "../http/HttpClient";
import { HtmlToText } from "../parsing/HtmlToText";
import { JsonFields } from "../parsing/JsonFields";
import { RemoteTypeInference } from "../parsing/RemoteTypeInference";
import { SourceCatalog } from "../SourceCatalog";
import { SourcePolicy } from "../SourcePolicy";

const FIRST_PAGE_URL: string = "https://www.arbeitnow.com/api/job-board-api";

export class ArbeitnowFetcher implements JobFetcher {
  public constructor(
    private readonly httpClient: HttpClient,
    private readonly policy: SourcePolicy,
    private readonly catalog: SourceCatalog,
    private readonly htmlToText: HtmlToText,
    private readonly remoteTypeInference: RemoteTypeInference,
  ) {}

  public getSourceId(): string {
    return "arbeitnow";
  }

  public getSourceName(): string {
    const source = this.catalog.findById(this.getSourceId());
    if (source === null) {
      return "Arbeitnow";
    }
    return source.displayName;
  }

  public getPolicy(): SourcePolicy {
    return this.policy;
  }

  public async fetchJobs(): Promise<Job[]> {
    const jobs: Job[] = [];
    const seenSlugs: string[] = [];
    let nextUrl: string | null = FIRST_PAGE_URL;
    const pageCount: number = this.policy.maxPages;
    for (let page: number = 0; page < pageCount && nextUrl !== null; page++) {
      const pageRecord: Record<string, unknown> = await this.fetchPage(nextUrl);
      const entries: unknown[] = JsonFields.list(pageRecord, "data");
      for (let index: number = 0; index < entries.length; index++) {
        const entry: Record<string, unknown> | null = JsonFields.record(entries[index]);
        if (entry === null || !this.isRemote(entry)) {
          continue;
        }
        const job: Job | null = this.toJob(entry);
        if (job !== null && !this.alreadySeen(seenSlugs, job.externalId)) {
          seenSlugs.push(job.externalId);
          jobs.push(job);
        }
      }
      nextUrl = this.readNextLink(pageRecord);
    }
    return jobs;
  }

  private async fetchPage(url: string): Promise<Record<string, unknown>> {
    const response = await this.httpClient.get(url, this.getSourceId(), this.policy.requestDelayMs);
    const parsed: unknown = this.parseJson(response.bodyText);
    const record: Record<string, unknown> | null = JsonFields.record(parsed);
    if (record === null) {
      throw new Error("Arbeitnow response was not an object.");
    }
    return record;
  }

  private isRemote(record: Record<string, unknown>): boolean {
    return JsonFields.boolean(record, "remote") === true;
  }

  private toJob(record: Record<string, unknown>): Job | null {
    const title: string | null = JsonFields.string(record, "title");
    const company: string | null = JsonFields.string(record, "company_name");
    const url: string | null = JsonFields.string(record, "url");
    const slug: string | null = JsonFields.string(record, "slug");
    if (title === null || company === null || url === null || slug === null) {
      return null;
    }
    const location: string = (JsonFields.string(record, "location") ?? "").trim();
    const tags: string[] = JsonFields.stringList(record, "tags");
    const description: string = this.htmlToText.toPlainText(JsonFields.string(record, "description") ?? "");
    const job: Job = {
      source: this.getSourceId(),
      externalId: slug,
      title: title,
      company: company,
      location: location,
      remoteType: this.remoteTypeInference.infer(location, tags, "remote"),
      salaryMin: null,
      salaryMax: null,
      currency: null,
      salaryKnown: false,
      salaryIsEstimated: false,
      url: url.trim(),
      postedAt: this.readPostedAt(JsonFields.number(record, "created_at")),
      description: description,
      descriptionIsSnippet: false,
    };
    return job;
  }

  private readNextLink(record: Record<string, unknown>): string | null {
    const links: Record<string, unknown> | null = JsonFields.record(record.links);
    if (links === null) {
      return null;
    }
    const next: string | null = JsonFields.string(links, "next");
    if (next === null || next.trim().length === 0) {
      return null;
    }
    return next.trim();
  }

  private readPostedAt(unixSeconds: number | null): Date | null {
    if (unixSeconds === null) {
      return null;
    }
    return new Date(unixSeconds * 1000);
  }

  private alreadySeen(seenSlugs: string[], externalId: string): boolean {
    for (let index: number = 0; index < seenSlugs.length; index++) {
      if (seenSlugs[index] === externalId) {
        return true;
      }
    }
    return false;
  }

  private parseJson(bodyText: string): unknown {
    try {
      return JSON.parse(bodyText) as unknown;
    } catch {
      throw new Error("Arbeitnow response was not valid JSON.");
    }
  }
}
