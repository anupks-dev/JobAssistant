import { ApiUsageRepository } from "../../db/repositories/ApiUsageRepository";
import { JobRepository } from "../../db/repositories/JobRepository";
import { Job } from "../../models/Job";
import { Clock } from "../Clock";
import { FetchBatch } from "../FetchBatch";
import { BatchJobFetcher } from "../JobFetcher";
import { HttpClient, HttpResponseResult } from "../http/HttpClient";
import { HtmlToText } from "../parsing/HtmlToText";
import { JsonFields } from "../parsing/JsonFields";
import { RemoteTypeInference } from "../parsing/RemoteTypeInference";
import { SourceCatalog, SourceDefinition } from "../SourceCatalog";
import { SourcePolicy } from "../SourcePolicy";

const PAGE_SIZE: number = 50;
const USAGE_SOURCE: string = "adzuna";
const INR_MINIMUM: number = 100000;
const OTHER_MINIMUM: number = 10000;

export interface AdzunaCredentials {
  appId: string;
  appKey: string;
}

export interface AdzunaQuerySettings {
  roles: string[];
  cities: string[];
  country: string;
  postedWithinDays: number;
  maxCallsPerDay: number;
  maxCallsPerMonth: number;
}

export class AdzunaFetcher implements BatchJobFetcher {
  public constructor(
    private readonly httpClient: HttpClient,
    private readonly policy: SourcePolicy,
    private readonly settings: AdzunaQuerySettings,
    private readonly credentials: AdzunaCredentials,
    private readonly catalog: SourceCatalog,
    private readonly htmlToText: HtmlToText,
    private readonly remoteTypeInference: RemoteTypeInference,
    private readonly apiUsage: ApiUsageRepository,
    private readonly jobRepository: JobRepository,
    private readonly clock: Clock,
  ) {}

  public getSourceId(): string {
    return "adzuna";
  }

  public getSourceName(): string {
    const source: SourceDefinition | null = this.catalog.findById(this.getSourceId());
    if (source === null) {
      return "Adzuna";
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
    const startedAt: number = Date.now();
    if (!this.hasCredentials()) {
      return [this.batch("skipped", [], "Adzuna credentials are missing.", startedAt)];
    }
    if (!this.countryIsSafe(this.settings.country)) {
      return [this.batch("error", [], "Adzuna country is invalid.", startedAt)];
    }
    const jobs: Job[] = [];
    const seenIds: string[] = [];
    for (let roleIndex: number = 0; roleIndex < this.settings.roles.length; roleIndex++) {
      for (let cityIndex: number = 0; cityIndex < this.settings.cities.length; cityIndex++) {
        const stopped: "ok" | "budget" | "failed" = await this.fetchQuery(
          this.settings.roles[roleIndex],
          this.settings.cities[cityIndex],
          jobs,
          seenIds,
        );
        if (stopped === "budget") {
          return [this.batch("skipped", jobs, "budget", startedAt)];
        }
        if (stopped === "failed") {
          return [this.batch("error", [], "Adzuna request failed.", startedAt)];
        }
      }
    }
    return [this.batch("ok", jobs, null, startedAt)];
  }

  private async fetchQuery(role: string, city: string, jobs: Job[], seenIds: string[]): Promise<"ok" | "budget" | "failed"> {
    const pageCount: number = this.policy.maxPages;
    for (let page: number = 1; page <= pageCount; page++) {
      if (!this.hasBudget()) {
        return "budget";
      }
      const loaded: HttpResponseResult | "failed" = await this.loadPage(role, city, page);
      if (loaded === "failed") {
        return "failed";
      }
      const pageJobs: Job[] = this.parsePage(loaded.bodyText);
      this.appendJobs(pageJobs, jobs, seenIds);
      if (pageJobs.length < PAGE_SIZE || this.allStored(pageJobs)) {
        return "ok";
      }
    }
    return "ok";
  }

  private async loadPage(role: string, city: string, page: number): Promise<HttpResponseResult | "failed"> {
    const url: string = this.buildUrl(role, city, page);
    try {
      const response: HttpResponseResult = await this.httpClient.get(url, this.getSourceId(), this.policy.requestDelayMs);
      this.apiUsage.increment(USAGE_SOURCE, this.dayKey());
      if (response.status < 200 || response.status >= 300) {
        return "failed";
      }
      return response;
    } catch {
      this.apiUsage.increment(USAGE_SOURCE, this.dayKey());
      return "failed";
    }
  }

  private buildUrl(role: string, city: string, page: number): string {
    const params: URLSearchParams = new URLSearchParams();
    params.set("app_id", this.credentials.appId);
    params.set("app_key", this.credentials.appKey);
    params.set("what", role);
    params.set("where", city);
    params.set("results_per_page", String(PAGE_SIZE));
    params.set("sort_by", "date");
    params.set("max_days_old", String(this.settings.postedWithinDays));
    params.set("full_time", "1");
    return "https://api.adzuna.com/v1/api/jobs/" + this.settings.country + "/search/" + String(page) + "?" + params.toString();
  }

  private parsePage(bodyText: string): Job[] {
    const parsed: unknown = this.parseJson(bodyText);
    const record: Record<string, unknown> | null = JsonFields.record(parsed);
    if (record === null) {
      throw new Error("Adzuna response was not an object.");
    }
    const results: unknown[] = JsonFields.list(record, "results");
    const jobs: Job[] = [];
    for (let index: number = 0; index < results.length; index++) {
      const entry: Record<string, unknown> | null = JsonFields.record(results[index]);
      if (entry === null) {
        continue;
      }
      const job: Job | null = this.toJob(entry);
      if (job !== null) {
        jobs.push(job);
      }
    }
    if (results.length > 0 && jobs.length === 0) {
      throw new Error("Adzuna response contained records but none could be parsed.");
    }
    return jobs;
  }

  private toJob(record: Record<string, unknown>): Job | null {
    const externalId: string | null = JsonFields.id(record, "id");
    const title: string | null = JsonFields.string(record, "title");
    const company: string | null = this.nestedName(record, "company", "display_name");
    const location: string | null = this.nestedName(record, "location", "display_name");
    const url: string | null = JsonFields.string(record, "redirect_url");
    if (externalId === null || title === null || company === null || location === null || url === null) {
      return null;
    }
    const salary: SalaryDecision = this.readSalary(record);
    const description: string = this.htmlToText.toPlainText(JsonFields.string(record, "description") ?? "");
    const job: Job = {
      source: this.getSourceId(),
      externalId: externalId,
      title: title,
      company: company,
      location: location,
      remoteType: this.remoteTypeInference.infer(location, [], "unknown"),
      salaryMin: salary.minimum,
      salaryMax: salary.maximum,
      currency: salary.currency,
      salaryKnown: salary.known,
      salaryIsEstimated: salary.estimated,
      url: this.stripSecrets(url),
      postedAt: this.readPostedAt(record),
      description: description,
      descriptionIsSnippet: true,
    };
    return job;
  }

  private readSalary(record: Record<string, unknown>): SalaryDecision {
    const currency: string = this.currencyForCountry(this.settings.country);
    const minimum: number | null = this.readAmount(record, "salary_min");
    const maximum: number | null = this.readAmount(record, "salary_max");
    if (this.isPredicted(record)) {
      const predicted: SalaryDecision = {
        minimum: null,
        maximum: null,
        currency: null,
        known: false,
        estimated: true,
      };
      return predicted;
    }
    if (!this.isPlausible(minimum, maximum, currency)) {
      const unknown: SalaryDecision = {
        minimum: null,
        maximum: null,
        currency: null,
        known: false,
        estimated: false,
      };
      return unknown;
    }
    const known: SalaryDecision = {
      minimum: minimum,
      maximum: maximum,
      currency: currency,
      known: true,
      estimated: false,
    };
    return known;
  }

  private isPredicted(record: Record<string, unknown>): boolean {
    const value: unknown = record.salary_is_predicted;
    return value === "1" || value === 1 || value === true;
  }

  private isPlausible(minimum: number | null, maximum: number | null, currency: string): boolean {
    if (minimum === null && maximum === null) {
      return false;
    }
    const floor: number = currency === "INR" ? INR_MINIMUM : OTHER_MINIMUM;
    if (minimum !== null && minimum < floor) {
      return false;
    }
    if (maximum !== null && maximum < floor) {
      return false;
    }
    return true;
  }

  private readAmount(record: Record<string, unknown>, key: string): number | null {
    const value: unknown = record[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === "string" && value.trim().length > 0) {
      const parsed: number = Number(value.trim());
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
    return null;
  }

  private currencyForCountry(country: string): string {
    if (country === "in") {
      return "INR";
    }
    if (country === "us") {
      return "USD";
    }
    if (country === "gb") {
      return "GBP";
    }
    if (country === "ca") {
      return "CAD";
    }
    if (country === "au") {
      return "AUD";
    }
    if (country === "de" || country === "fr" || country === "nl" || country === "es" || country === "it") {
      return "EUR";
    }
    return "USD";
  }

  private nestedName(record: Record<string, unknown>, key: string, field: string): string | null {
    const nested: Record<string, unknown> | null = JsonFields.record(record[key]);
    if (nested === null) {
      return null;
    }
    return JsonFields.string(nested, field);
  }

  private readPostedAt(record: Record<string, unknown>): Date | null {
    const created: string | null = JsonFields.string(record, "created");
    if (created === null) {
      return null;
    }
    const parsed: number = Date.parse(created);
    if (Number.isNaN(parsed)) {
      return null;
    }
    return new Date(parsed);
  }

  private stripSecrets(url: string): string {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return url;
    }
    parsed.searchParams.delete("app_id");
    parsed.searchParams.delete("app_key");
    return parsed.toString();
  }

  private appendJobs(pageJobs: Job[], jobs: Job[], seenIds: string[]): void {
    for (let index: number = 0; index < pageJobs.length; index++) {
      const job: Job = pageJobs[index];
      if (this.alreadySeen(seenIds, job.externalId)) {
        continue;
      }
      seenIds.push(job.externalId);
      jobs.push(job);
    }
  }

  private allStored(pageJobs: Job[]): boolean {
    if (pageJobs.length === 0) {
      return false;
    }
    for (let index: number = 0; index < pageJobs.length; index++) {
      const stored: boolean = this.jobRepository.existsByExternalId(this.getSourceId(), pageJobs[index].externalId);
      if (!stored) {
        return false;
      }
    }
    return true;
  }

  private hasBudget(): boolean {
    const dayCount: number = this.apiUsage.getDayCount(USAGE_SOURCE, this.dayKey());
    const monthCount: number = this.apiUsage.getMonthCount(USAGE_SOURCE, this.monthKey());
    if (dayCount + 1 > this.settings.maxCallsPerDay) {
      return false;
    }
    if (monthCount + 1 > this.settings.maxCallsPerMonth) {
      return false;
    }
    return true;
  }

  private hasCredentials(): boolean {
    return this.credentials.appId.trim().length > 0 && this.credentials.appKey.trim().length > 0;
  }

  private countryIsSafe(country: string): boolean {
    return /^[a-z]{2}$/.test(country);
  }

  private dayKey(): string {
    return this.clock.now().toISOString().slice(0, 10);
  }

  private monthKey(): string {
    return this.clock.now().toISOString().slice(0, 7);
  }

  private alreadySeen(seenIds: string[], externalId: string): boolean {
    for (let index: number = 0; index < seenIds.length; index++) {
      if (seenIds[index] === externalId) {
        return true;
      }
    }
    return false;
  }

  private jobsFrom(batches: FetchBatch[]): Job[] {
    const jobs: Job[] = [];
    for (let index: number = 0; index < batches.length; index++) {
      const batch: FetchBatch = batches[index];
      if (batch.status === "error") {
        throw new Error(batch.note ?? "Adzuna request failed.");
      }
      for (let jobIndex: number = 0; jobIndex < batch.jobs.length; jobIndex++) {
        jobs.push(batch.jobs[jobIndex]);
      }
    }
    return jobs;
  }

  private batch(status: "ok" | "error" | "skipped", jobs: Job[], note: string | null, startedAt: number): FetchBatch {
    const batch: FetchBatch = {
      sourceId: this.getSourceId(),
      catalogSourceId: this.getSourceId(),
      status: status,
      jobs: jobs,
      note: note,
      durationMs: Date.now() - startedAt,
    };
    return batch;
  }

  private parseJson(bodyText: string): unknown {
    try {
      return JSON.parse(bodyText) as unknown;
    } catch {
      throw new Error("Adzuna response was not valid JSON.");
    }
  }
}

interface SalaryDecision {
  minimum: number | null;
  maximum: number | null;
  currency: string | null;
  known: boolean;
  estimated: boolean;
}
