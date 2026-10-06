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

export class AshbyFetcher implements BatchJobFetcher {
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
    return "ashby";
  }

  public getSourceName(): string {
    const source: SourceDefinition | null = this.catalog.findById(this.getSourceId());
    if (source === null) {
      return "Ashby";
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
      const batch: FetchBatch = await this.runner.runBoard(board, "ashby", (slug: string): Promise<Job[]> => {
        return this.loadBoard(slug, board.company);
      });
      batches.push(batch);
    }
    return batches;
  }

  private async loadBoard(slug: string, company: string): Promise<Job[]> {
    const url: string = "https://api.ashbyhq.com/posting-api/job-board/" + slug + "?includeCompensation=true";
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
    let listed: number = 0;
    for (let index: number = 0; index < entries.length; index++) {
      const entry: Record<string, unknown> | null = JsonFields.record(entries[index]);
      if (entry === null || this.isUnlisted(entry)) {
        continue;
      }
      listed = listed + 1;
      const job: Job | null = this.toJob(entry, company);
      if (job !== null) {
        jobs.push(job);
      }
    }
    if (listed > 0 && jobs.length === 0) {
      throw new Error("Ashby response contained records but none could be parsed.");
    }
    return jobs;
  }

  private isUnlisted(record: Record<string, unknown>): boolean {
    return JsonFields.boolean(record, "isListed") === false;
  }

  private toJob(record: Record<string, unknown>, company: string): Job | null {
    const externalId: string | null = JsonFields.id(record, "id");
    const title: string | null = JsonFields.string(record, "title");
    const url: string | null = JsonFields.string(record, "jobUrl");
    if (externalId === null || title === null || url === null || company.trim().length === 0) {
      return null;
    }
    const location: string = JsonFields.string(record, "location") ?? "Unknown";
    const workplace: string = JsonFields.string(record, "workplaceType") ?? "";
    const description: string = this.htmlToText.toPlainText(JsonFields.string(record, "descriptionPlain") ?? "");
    const salary: AshbySalary = this.readSalary(record);
    const job: Job = {
      source: this.getSourceId(),
      externalId: externalId,
      title: title,
      company: company,
      location: location,
      remoteType: this.readRemoteType(record, location, workplace),
      salaryMin: salary.minimum,
      salaryMax: salary.maximum,
      currency: salary.currency,
      salaryKnown: salary.known,
      salaryIsEstimated: false,
      url: url,
      postedAt: this.parseDate(JsonFields.string(record, "publishedAt")),
      description: description,
      descriptionIsSnippet: false,
    };
    return job;
  }

  private readRemoteType(record: Record<string, unknown>, location: string, workplace: string): RemoteType {
    if (JsonFields.boolean(record, "isRemote") === true) {
      return "remote";
    }
    return this.remoteTypeInference.infer(location + " " + workplace, [], "unknown");
  }

  private readSalary(record: Record<string, unknown>): AshbySalary {
    const empty: AshbySalary = { minimum: null, maximum: null, currency: null, known: false };
    const compensation: Record<string, unknown> | null = JsonFields.record(record.compensation);
    if (compensation === null) {
      return empty;
    }
    const tiers: unknown[] = JsonFields.list(compensation, "compensationTiers");
    for (let tierIndex: number = 0; tierIndex < tiers.length; tierIndex++) {
      const tier: Record<string, unknown> | null = JsonFields.record(tiers[tierIndex]);
      if (tier === null) {
        continue;
      }
      const components: unknown[] = JsonFields.list(tier, "components");
      const salary: AshbySalary | null = this.salaryComponent(components);
      if (salary !== null) {
        return salary;
      }
    }
    return empty;
  }

  private salaryComponent(components: unknown[]): AshbySalary | null {
    for (let index: number = 0; index < components.length; index++) {
      const component: Record<string, unknown> | null = JsonFields.record(components[index]);
      if (component === null) {
        continue;
      }
      const kind: string = (JsonFields.string(component, "compensationType") ?? "").toLowerCase();
      if (kind.indexOf("salary") < 0 && kind.indexOf("equity") >= 0) {
        continue;
      }
      if (kind.indexOf("salary") < 0 && kind.length > 0) {
        continue;
      }
      const minimum: number | null = JsonFields.number(component, "minValue");
      const maximum: number | null = JsonFields.number(component, "maxValue");
      if (minimum === null && maximum === null) {
        continue;
      }
      const salary: AshbySalary = {
        minimum: minimum,
        maximum: maximum,
        currency: JsonFields.string(component, "currencyCode"),
        known: true,
      };
      return salary;
    }
    return null;
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
      throw new Error("Ashby response was not an object.");
    }
    return record;
  }

  private parseJson(bodyText: string): unknown {
    try {
      return JSON.parse(bodyText) as unknown;
    } catch {
      throw new Error("Ashby response was not valid JSON.");
    }
  }
}

interface AshbySalary {
  minimum: number | null;
  maximum: number | null;
  currency: string | null;
  known: boolean;
}
