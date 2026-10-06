import { Job } from "../../models/Job";
import { JobFetcher } from "../JobFetcher";
import { HttpClient } from "../http/HttpClient";
import { HtmlToText } from "../parsing/HtmlToText";
import { JsonFields } from "../parsing/JsonFields";
import { ParsedSalary, SalaryParser } from "../parsing/SalaryParser";
import { RemoteTypeInference } from "../parsing/RemoteTypeInference";
import { SourceCatalog } from "../SourceCatalog";
import { SourcePolicy } from "../SourcePolicy";

export class RemotiveFetcher implements JobFetcher {
  public constructor(
    private readonly httpClient: HttpClient,
    private readonly policy: SourcePolicy,
    private readonly categories: string[],
    private readonly catalog: SourceCatalog,
    private readonly htmlToText: HtmlToText,
    private readonly salaryParser: SalaryParser,
    private readonly remoteTypeInference: RemoteTypeInference,
  ) {}

  public getSourceId(): string {
    return "remotive";
  }

  public getSourceName(): string {
    const source = this.catalog.findById(this.getSourceId());
    if (source === null) {
      return "Remotive";
    }
    return source.displayName;
  }

  public getPolicy(): SourcePolicy {
    return this.policy;
  }

  public async fetchJobs(): Promise<Job[]> {
    const jobs: Job[] = [];
    const seenIds: string[] = [];
    for (let index: number = 0; index < this.categories.length; index++) {
      const categoryJobs: Job[] = await this.fetchCategory(this.categories[index]);
      for (let jobIndex: number = 0; jobIndex < categoryJobs.length; jobIndex++) {
        const job: Job = categoryJobs[jobIndex];
        if (!this.alreadySeen(seenIds, job.externalId)) {
          seenIds.push(job.externalId);
          jobs.push(job);
        }
      }
    }
    return jobs;
  }

  private async fetchCategory(category: string): Promise<Job[]> {
    const url: string = "https://remotive.com/api/remote-jobs?category=" + encodeURIComponent(category);
    const response = await this.httpClient.get(url, this.getSourceId(), this.policy.requestDelayMs);
    const parsed: unknown = this.parseJson(response.bodyText);
    const record: Record<string, unknown> | null = JsonFields.record(parsed);
    if (record === null) {
      throw new Error("Remotive response was not an object.");
    }
    const entries: unknown[] = JsonFields.list(record, "jobs");
    const jobs: Job[] = [];
    for (let index: number = 0; index < entries.length; index++) {
      const entry: Record<string, unknown> | null = JsonFields.record(entries[index]);
      if (entry === null) {
        continue;
      }
      const job: Job | null = this.toJob(entry);
      if (job !== null) {
        jobs.push(job);
      }
    }
    return jobs;
  }

  private toJob(record: Record<string, unknown>): Job | null {
    const title: string | null = JsonFields.string(record, "title");
    const company: string | null = JsonFields.string(record, "company_name");
    const url: string | null = JsonFields.string(record, "url");
    const externalId: number | null = JsonFields.number(record, "id");
    if (title === null || company === null || url === null || externalId === null) {
      return null;
    }
    const location: string = (JsonFields.string(record, "candidate_required_location") ?? "").trim();
    const tags: string[] = JsonFields.stringList(record, "tags");
    const salary: ParsedSalary = this.salaryParser.parse(JsonFields.string(record, "salary") ?? "");
    const description: string = this.htmlToText.toPlainText(JsonFields.string(record, "description") ?? "");
    const job: Job = {
      source: this.getSourceId(),
      externalId: String(externalId),
      title: title,
      company: company,
      location: location,
      remoteType: this.remoteTypeInference.infer(location, tags, "remote"),
      salaryMin: salary.min,
      salaryMax: salary.max,
      currency: salary.currency,
      salaryKnown: salary.known,
      salaryIsEstimated: false,
      url: url.trim(),
      postedAt: this.readPostedAt(JsonFields.string(record, "publication_date")),
      description: description,
      descriptionIsSnippet: false,
    };
    return job;
  }

  private readPostedAt(value: string | null): Date | null {
    if (value === null) {
      return null;
    }
    let text: string = value.trim();
    if (text.length === 0) {
      return null;
    }
    const hasZone: boolean = text.endsWith("Z") || text.indexOf("+") >= 0 || text.lastIndexOf("-") > 9;
    if (!hasZone) {
      text = text + "Z";
    }
    const parsed: Date = new Date(text);
    if (Number.isNaN(parsed.getTime())) {
      return null;
    }
    return parsed;
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
      throw new Error("Remotive response was not valid JSON.");
    }
  }
}
