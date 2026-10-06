import { Job } from "../../models/Job";
import { JobFetcher } from "../JobFetcher";
import { HttpClient } from "../http/HttpClient";
import { HtmlToText } from "../parsing/HtmlToText";
import { JsonFields } from "../parsing/JsonFields";
import { RemoteTypeInference } from "../parsing/RemoteTypeInference";
import { SourceCatalog } from "../SourceCatalog";
import { SourcePolicy } from "../SourcePolicy";

const FEED_URL: string = "https://remoteok.com/api";

export class RemoteOkFetcher implements JobFetcher {
  public constructor(
    private readonly httpClient: HttpClient,
    private readonly policy: SourcePolicy,
    private readonly catalog: SourceCatalog,
    private readonly htmlToText: HtmlToText,
    private readonly remoteTypeInference: RemoteTypeInference,
  ) {}

  public getSourceId(): string {
    return "remoteok";
  }

  public getSourceName(): string {
    const source = this.catalog.findById(this.getSourceId());
    if (source === null) {
      return "Remote OK";
    }
    return source.displayName;
  }

  public getPolicy(): SourcePolicy {
    return this.policy;
  }

  public async fetchJobs(): Promise<Job[]> {
    const response = await this.httpClient.get(FEED_URL, this.getSourceId(), this.policy.requestDelayMs);
    const parsed: unknown = this.parseJson(response.bodyText);
    if (!Array.isArray(parsed)) {
      throw new Error("RemoteOK response was not a list.");
    }
    if (parsed.length < 2) {
      throw new Error("RemoteOK returned no jobs.");
    }
    const jobs: Job[] = [];
    for (let index: number = 0; index < parsed.length; index++) {
      const record: Record<string, unknown> | null = JsonFields.record(parsed[index]);
      if (record === null || this.isLegalNotice(record)) {
        continue;
      }
      const job: Job | null = this.toJob(record);
      if (job !== null) {
        jobs.push(job);
      }
    }
    return jobs;
  }

  // The first payload element is a legal notice, not a posting.
  private isLegalNotice(record: Record<string, unknown>): boolean {
    return typeof record.legal === "string" && JsonFields.string(record, "position") === null;
  }

  private toJob(record: Record<string, unknown>): Job | null {
    const title: string | null = JsonFields.string(record, "position");
    const company: string | null = JsonFields.string(record, "company");
    const url: string | null = this.readUrl(record);
    const externalId: string | null = this.readExternalId(record);
    if (title === null || company === null || url === null || externalId === null) {
      return null;
    }
    const tags: string[] = JsonFields.stringList(record, "tags");
    const location: string = this.readLocation(record);
    const salaryMin: number | null = this.readSalary(record, "salary_min");
    const salaryMax: number | null = this.readSalary(record, "salary_max");
    const salaryKnown: boolean = salaryMin !== null || salaryMax !== null;
    // The feed has no currency field. Amounts on Remote OK are US dollars.
    let currency: string | null = null;
    if (salaryKnown) {
      currency = "USD";
    }
    const description: string = this.htmlToText.toPlainText(JsonFields.string(record, "description") ?? "");
    const job: Job = {
      source: this.getSourceId(),
      externalId: externalId,
      title: title,
      company: company,
      location: location,
      remoteType: this.remoteTypeInference.infer(location, tags, "remote"),
      salaryMin: salaryMin,
      salaryMax: salaryMax,
      currency: currency,
      salaryKnown: salaryKnown,
      salaryIsEstimated: false,
      url: url,
      postedAt: this.readPostedAt(record),
      description: description,
      descriptionIsSnippet: false,
    };
    return job;
  }

  // The live feed stores id as a string. Older fixtures use a number.
  private readExternalId(record: Record<string, unknown>): string | null {
    const value: unknown = record.id;
    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value);
    }
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
    return null;
  }

  private readUrl(record: Record<string, unknown>): string | null {
    const url: string | null = JsonFields.string(record, "url");
    if (url !== null && url.trim().length > 0) {
      return url.trim();
    }
    const applyUrl: string | null = JsonFields.string(record, "apply_url");
    if (applyUrl !== null && applyUrl.trim().length > 0) {
      return applyUrl.trim();
    }
    return null;
  }

  private readLocation(record: Record<string, unknown>): string {
    const location: string | null = JsonFields.string(record, "location");
    if (location === null) {
      return "";
    }
    return location.trim();
  }

  private readSalary(record: Record<string, unknown>, key: string): number | null {
    const amount: number | null = JsonFields.number(record, key);
    if (amount === null || amount <= 0) {
      return null;
    }
    return amount;
  }

  private readPostedAt(record: Record<string, unknown>): Date | null {
    const dateText: string | null = JsonFields.string(record, "date");
    if (dateText !== null) {
      const parsed: Date = new Date(dateText);
      if (!Number.isNaN(parsed.getTime())) {
        return parsed;
      }
    }
    const epoch: number | null = JsonFields.number(record, "epoch");
    if (epoch === null) {
      return null;
    }
    return new Date(epoch * 1000);
  }

  private parseJson(bodyText: string): unknown {
    try {
      return JSON.parse(bodyText) as unknown;
    } catch {
      throw new Error("RemoteOK response was not valid JSON.");
    }
  }
}
