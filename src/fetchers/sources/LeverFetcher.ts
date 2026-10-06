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

export class LeverFetcher implements BatchJobFetcher {
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
    return "lever";
  }

  public getSourceName(): string {
    const source: SourceDefinition | null = this.catalog.findById(this.getSourceId());
    if (source === null) {
      return "Lever";
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
      const batch: FetchBatch = await this.runner.runBoard(board, "lever", (slug: string): Promise<Job[]> => {
        return this.loadBoard(slug, board.company);
      });
      batches.push(batch);
    }
    return batches;
  }

  private async loadBoard(slug: string, company: string): Promise<Job[]> {
    const url: string = "https://api.lever.co/v0/postings/" + slug + "?mode=json";
    const response: HttpResponseResult = await this.httpClient.get(url, this.getSourceId(), this.policy.requestDelayMs);
    if (response.status < 200 || response.status >= 300) {
      throw new Error("Board request failed.");
    }
    return this.parseJobs(response.bodyText, company);
  }

  private parseJobs(bodyText: string, company: string): Job[] {
    const parsed: unknown = this.parseJson(bodyText);
    if (!Array.isArray(parsed)) {
      throw new Error("Lever response was not a list.");
    }
    const jobs: Job[] = [];
    for (let index: number = 0; index < parsed.length; index++) {
      const entry: Record<string, unknown> | null = JsonFields.record(parsed[index]);
      if (entry === null) {
        continue;
      }
      const job: Job | null = this.toJob(entry, company);
      if (job !== null) {
        jobs.push(job);
      }
    }
    if (parsed.length > 0 && jobs.length === 0) {
      throw new Error("Lever response contained records but none could be parsed.");
    }
    return jobs;
  }

  private toJob(record: Record<string, unknown>, company: string): Job | null {
    const externalId: string | null = JsonFields.id(record, "id");
    const title: string | null = JsonFields.string(record, "text");
    const url: string | null = JsonFields.string(record, "hostedUrl");
    if (externalId === null || title === null || url === null || company.trim().length === 0) {
      return null;
    }
    const location: string = this.readLocation(record);
    const workplace: string = JsonFields.string(record, "workplaceType") ?? "";
    const description: string = this.htmlToText.toPlainText(JsonFields.string(record, "descriptionPlain") ?? "");
    const salary: LeverSalary = this.readSalary(record);
    const job: Job = {
      source: this.getSourceId(),
      externalId: externalId,
      title: title,
      company: company,
      location: location,
      remoteType: this.readRemoteType(workplace, location),
      salaryMin: salary.minimum,
      salaryMax: salary.maximum,
      currency: salary.currency,
      salaryKnown: salary.known,
      salaryIsEstimated: false,
      url: url,
      postedAt: this.readPostedAt(record),
      description: description,
      descriptionIsSnippet: false,
    };
    return job;
  }

  private readLocation(record: Record<string, unknown>): string {
    const categories: Record<string, unknown> | null = JsonFields.record(record.categories);
    if (categories === null) {
      return "Unknown";
    }
    const location: string | null = JsonFields.string(categories, "location");
    if (location === null || location.trim().length === 0) {
      return "Unknown";
    }
    return location;
  }

  private readRemoteType(workplace: string, location: string): RemoteType {
    const normalized: string = workplace.trim().toLowerCase();
    if (normalized === "remote" || normalized === "hybrid" || normalized === "onsite") {
      return normalized;
    }
    return this.remoteTypeInference.infer(location + " " + workplace, [], "unknown");
  }

  private readPostedAt(record: Record<string, unknown>): Date | null {
    const value: unknown = record.createdAt;
    if (typeof value === "number" && Number.isFinite(value)) {
      return new Date(value);
    }
    if (typeof value === "string" && /^[0-9]+$/.test(value.trim())) {
      return new Date(Number(value.trim()));
    }
    return null;
  }

  private readSalary(record: Record<string, unknown>): LeverSalary {
    const range: Record<string, unknown> | null = JsonFields.record(record.salaryRange);
    const empty: LeverSalary = { minimum: null, maximum: null, currency: null, known: false };
    if (range === null) {
      return empty;
    }
    const minimum: number | null = JsonFields.number(range, "min");
    const maximum: number | null = JsonFields.number(range, "max");
    if (minimum === null && maximum === null) {
      return empty;
    }
    const known: LeverSalary = {
      minimum: minimum,
      maximum: maximum,
      currency: JsonFields.string(range, "currency"),
      known: true,
    };
    return known;
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

  private parseJson(bodyText: string): unknown {
    try {
      return JSON.parse(bodyText) as unknown;
    } catch {
      throw new Error("Lever response was not valid JSON.");
    }
  }
}

interface LeverSalary {
  minimum: number | null;
  maximum: number | null;
  currency: string | null;
  known: boolean;
}
