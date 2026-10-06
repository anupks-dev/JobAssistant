import { Job, RemoteType } from "../../models/Job";
import { FetchBatch } from "../FetchBatch";
import { BatchJobFetcher } from "../JobFetcher";
import { HttpClient, HttpResponseResult } from "../http/HttpClient";
import { HtmlToText } from "../parsing/HtmlToText";
import { JsonFields } from "../parsing/JsonFields";
import { RemoteTypeInference } from "../parsing/RemoteTypeInference";
import { SourceCatalog, SourceDefinition } from "../SourceCatalog";
import { SourcePolicy } from "../SourcePolicy";
import { AtsBoardConfig } from "./AtsBoardConfig";
import { AtsBoardRunner } from "./AtsBoardRunner";

export class GreenhouseFetcher implements BatchJobFetcher {
  public constructor(
    private readonly httpClient: HttpClient,
    private readonly policy: SourcePolicy,
    private readonly boards: AtsBoardConfig[],
    private readonly catalog: SourceCatalog,
    private readonly htmlToText: HtmlToText,
    private readonly remoteTypeInference: RemoteTypeInference,
    private readonly runner: AtsBoardRunner,
  ) {}

  public getSourceId(): string {
    return "greenhouse";
  }

  public getSourceName(): string {
    const source: SourceDefinition | null = this.catalog.findById(this.getSourceId());
    if (source === null) {
      return "Greenhouse";
    }
    return source.displayName;
  }

  public getPolicy(): SourcePolicy {
    return this.policy;
  }

  public async fetchJobs(): Promise<Job[]> {
    const batches: FetchBatch[] = await this.fetchBatches();
    return this.jobsFrom(batches);
  }

  public async fetchBatches(): Promise<FetchBatch[]> {
    const batches: FetchBatch[] = [];
    for (let index: number = 0; index < this.boards.length; index++) {
      const board: AtsBoardConfig = this.boards[index];
      const batch: FetchBatch = await this.runner.runBoard(board, "greenhouse", (slug: string): Promise<Job[]> => {
        return this.loadBoard(slug, board.company);
      });
      batches.push(batch);
    }
    return batches;
  }

  private async loadBoard(slug: string, company: string): Promise<Job[]> {
    const url: string = "https://boards-api.greenhouse.io/v1/boards/" + slug + "/jobs?content=true";
    const response: HttpResponseResult = await this.httpClient.get(url, this.getSourceId(), this.policy.requestDelayMs);
    if (response.status < 200 || response.status >= 300) {
      throw new Error("Board request failed.");
    }
    return this.parseJobs(response.bodyText, company);
  }

  private parseJobs(bodyText: string, company: string): Job[] {
    const record: Record<string, unknown> = this.readObject(bodyText);
    const entries: unknown[] = JsonFields.list(record, "jobs");
    const jobs: Job[] = [];
    for (let index: number = 0; index < entries.length; index++) {
      const entry: Record<string, unknown> | null = JsonFields.record(entries[index]);
      if (entry === null) {
        continue;
      }
      const job: Job | null = this.toJob(entry, company);
      if (job !== null) {
        jobs.push(job);
      }
    }
    if (entries.length > 0 && jobs.length === 0) {
      throw new Error("Greenhouse response contained records but none could be parsed.");
    }
    return jobs;
  }

  private toJob(record: Record<string, unknown>, company: string): Job | null {
    const externalId: string | null = JsonFields.id(record, "id");
    const title: string | null = JsonFields.string(record, "title");
    const url: string | null = JsonFields.string(record, "absolute_url");
    const location: string = this.readLocation(record);
    if (externalId === null || title === null || url === null || company.trim().length === 0) {
      return null;
    }
    const content: string = JsonFields.string(record, "content") ?? "";
    const description: string = this.htmlToText.toPlainText(content);
    const remoteType: RemoteType = this.remoteTypeInference.infer(location, [], "unknown");
    const job: Job = {
      source: this.getSourceId(),
      externalId: externalId,
      title: title,
      company: company,
      location: location,
      remoteType: remoteType,
      salaryMin: null,
      salaryMax: null,
      currency: null,
      salaryKnown: false,
      salaryIsEstimated: false,
      url: url,
      postedAt: this.readPostedAt(record),
      description: description,
      descriptionIsSnippet: false,
    };
    return job;
  }

  private readLocation(record: Record<string, unknown>): string {
    const location: Record<string, unknown> | null = JsonFields.record(record.location);
    if (location === null) {
      return "Unknown";
    }
    const name: string | null = JsonFields.string(location, "name");
    if (name === null || name.trim().length === 0) {
      return "Unknown";
    }
    return name;
  }

  private readPostedAt(record: Record<string, unknown>): Date | null {
    const firstPublished: Date | null = this.parseDate(JsonFields.string(record, "first_published"));
    if (firstPublished !== null) {
      return firstPublished;
    }
    return this.parseDate(JsonFields.string(record, "updated_at"));
  }

  private parseDate(value: string | null): Date | null {
    if (value === null) {
      return null;
    }
    const parsed: number = Date.parse(value);
    if (Number.isNaN(parsed)) {
      return null;
    }
    return new Date(parsed);
  }

  private jobsFrom(batches: FetchBatch[]): Job[] {
    const jobs: Job[] = [];
    for (let index: number = 0; index < batches.length; index++) {
      const batch: FetchBatch = batches[index];
      if (batch.status === "error") {
        throw new Error(batch.note ?? "Board request failed.");
      }
      for (let jobIndex: number = 0; jobIndex < batch.jobs.length; jobIndex++) {
        jobs.push(batch.jobs[jobIndex]);
      }
    }
    return jobs;
  }

  private readObject(bodyText: string): Record<string, unknown> {
    const parsed: unknown = this.parseJson(bodyText);
    const record: Record<string, unknown> | null = JsonFields.record(parsed);
    if (record === null) {
      throw new Error("Greenhouse response was not an object.");
    }
    return record;
  }

  private parseJson(bodyText: string): unknown {
    try {
      return JSON.parse(bodyText) as unknown;
    } catch {
      throw new Error("Greenhouse response was not valid JSON.");
    }
  }
}
