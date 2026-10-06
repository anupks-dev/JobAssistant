import { Job } from "../../models/Job";
import { Clock } from "../Clock";
import { JobFetcher } from "../JobFetcher";
import { HttpClient, HttpResponseResult } from "../http/HttpClient";
import { HtmlToText } from "../parsing/HtmlToText";
import { HnHeadline, HnHeadlineParser } from "../parsing/HnHeadlineParser";
import { JsonFields } from "../parsing/JsonFields";
import { RemoteTypeInference } from "../parsing/RemoteTypeInference";
import { SourceCatalog, SourceDefinition } from "../SourceCatalog";
import { SourcePolicy } from "../SourcePolicy";

const THREAD_URL: string = "https://hn.algolia.com/api/v1/search_by_date?tags=story,author_whoishiring&hitsPerPage=30";
const COMMENT_PAGE_SIZE: number = 100;

export class HackerNewsFetcher implements JobFetcher {
  public constructor(
    private readonly httpClient: HttpClient,
    private readonly policy: SourcePolicy,
    private readonly catalog: SourceCatalog,
    private readonly htmlToText: HtmlToText,
    private readonly remoteTypeInference: RemoteTypeInference,
    private readonly headlineParser: HnHeadlineParser,
    private readonly postedWithinDays: number,
    private readonly clock: Clock,
  ) {}

  public getSourceId(): string {
    return "hackernews";
  }

  public getSourceName(): string {
    const source: SourceDefinition | null = this.catalog.findById(this.getSourceId());
    if (source === null) {
      return "Hacker News";
    }
    return source.displayName;
  }

  public getPolicy(): SourcePolicy {
    return this.policy;
  }

  public async fetchJobs(): Promise<Job[]> {
    const thread: Record<string, unknown> = await this.latestHiringThread();
    const storyId: string | null = JsonFields.id(thread, "objectID");
    if (storyId === null) {
      throw new Error("Hacker News hiring thread had no id.");
    }
    return this.fetchComments(storyId);
  }

  private async latestHiringThread(): Promise<Record<string, unknown>> {
    const response: HttpResponseResult = await this.httpClient.get(THREAD_URL, this.getSourceId(), this.policy.requestDelayMs);
    const record: Record<string, unknown> = this.readObject(response.bodyText, "Hacker News thread response was not an object.");
    const hits: unknown[] = JsonFields.list(record, "hits");
    const selected: Record<string, unknown> | null = this.selectThread(hits);
    if (selected === null) {
      throw new Error("No Hacker News hiring thread was found.");
    }
    return selected;
  }

  private selectThread(hits: unknown[]): Record<string, unknown> | null {
    let best: Record<string, unknown> | null = null;
    let bestTime: number = -1;
    for (let index: number = 0; index < hits.length; index++) {
      const record: Record<string, unknown> | null = JsonFields.record(hits[index]);
      if (record === null) {
        continue;
      }
      const title: string | null = JsonFields.string(record, "title");
      if (title === null || !this.isHiringTitle(title)) {
        continue;
      }
      const created: number = JsonFields.number(record, "created_at_i") ?? 0;
      if (best === null || created > bestTime) {
        best = record;
        bestTime = created;
      }
    }
    return best;
  }

  private isHiringTitle(title: string): boolean {
    const lower: string = title.toLowerCase();
    if (lower.indexOf("who is hiring") < 0) {
      return false;
    }
    if (lower.indexOf("wants to be hired") >= 0) {
      return false;
    }
    if (lower.indexOf("freelancer") >= 0) {
      return false;
    }
    return true;
  }

  private async fetchComments(storyId: string): Promise<Job[]> {
    const jobs: Job[] = [];
    const seenIds: string[] = [];
    const pageCount: number = this.policy.maxPages;
    for (let page: number = 0; page < pageCount; page++) {
      const hits: unknown[] = await this.commentPage(storyId, page);
      this.collectComments(hits, storyId, jobs, seenIds);
      if (hits.length < COMMENT_PAGE_SIZE) {
        break;
      }
    }
    return jobs;
  }

  private async commentPage(storyId: string, page: number): Promise<unknown[]> {
    const url: string = this.commentUrl(storyId, page);
    const response: HttpResponseResult = await this.httpClient.get(url, this.getSourceId(), this.policy.requestDelayMs);
    const record: Record<string, unknown> = this.readObject(response.bodyText, "Hacker News comment response was not an object.");
    return JsonFields.list(record, "hits");
  }

  private commentUrl(storyId: string, page: number): string {
    const cutoff: number = this.postedAfter();
    const params: URLSearchParams = new URLSearchParams();
    params.set("tags", "comment,story_" + storyId);
    params.set("hitsPerPage", String(COMMENT_PAGE_SIZE));
    params.set("page", String(page));
    params.set("numericFilters", "created_at_i>" + String(cutoff));
    return "https://hn.algolia.com/api/v1/search_by_date?" + params.toString();
  }

  private postedAfter(): number {
    const windowMs: number = this.postedWithinDays * 24 * 60 * 60 * 1000;
    const cutoffMs: number = this.clock.now().getTime() - windowMs;
    return Math.floor(cutoffMs / 1000);
  }

  private collectComments(hits: unknown[], storyId: string, jobs: Job[], seenIds: string[]): void {
    let candidates: number = 0;
    let parsed: number = 0;
    for (let index: number = 0; index < hits.length; index++) {
      const record: Record<string, unknown> | null = JsonFields.record(hits[index]);
      if (record === null || !this.isTopLevel(record, storyId) || this.isSkippedComment(record)) {
        continue;
      }
      candidates = candidates + 1;
      const job: Job | null = this.toJob(record);
      if (job !== null && !this.alreadySeen(seenIds, job.externalId)) {
        seenIds.push(job.externalId);
        jobs.push(job);
        parsed = parsed + 1;
      }
    }
    if (candidates > 0 && parsed === 0) {
      throw new Error("Hacker News response contained records but none could be parsed.");
    }
  }

  private isTopLevel(record: Record<string, unknown>, storyId: string): boolean {
    const parentId: string | null = JsonFields.id(record, "parent_id");
    if (parentId === null) {
      return false;
    }
    return parentId === storyId;
  }

  private isSkippedComment(record: Record<string, unknown>): boolean {
    if (this.hasTag(record, "deleted") || this.hasTag(record, "dead")) {
      return true;
    }
    const text: string | null = JsonFields.string(record, "comment_text");
    if (text === null || text.trim().length === 0) {
      return true;
    }
    return false;
  }

  private hasTag(record: Record<string, unknown>, tag: string): boolean {
    const tags: string[] = JsonFields.stringList(record, "_tags");
    for (let index: number = 0; index < tags.length; index++) {
      if (tags[index] === tag) {
        return true;
      }
    }
    return false;
  }

  private toJob(record: Record<string, unknown>): Job | null {
    const externalId: string | null = JsonFields.id(record, "objectID");
    const text: string | null = JsonFields.string(record, "comment_text");
    if (externalId === null || text === null) {
      return null;
    }
    const headline: HnHeadline = this.headlineParser.parse(text);
    const description: string = this.htmlToText.toPlainText(text);
    const job: Job = {
      source: this.getSourceId(),
      externalId: externalId,
      title: headline.title,
      company: headline.company,
      location: headline.location,
      remoteType: this.remoteTypeInference.infer(headline.headline, [], "unknown"),
      salaryMin: null,
      salaryMax: null,
      currency: null,
      salaryKnown: false,
      salaryIsEstimated: false,
      url: "https://news.ycombinator.com/item?id=" + externalId,
      postedAt: this.readPostedAt(record),
      description: description,
      descriptionIsSnippet: false,
    };
    return job;
  }

  private readPostedAt(record: Record<string, unknown>): Date | null {
    const created: string | null = JsonFields.string(record, "created_at");
    if (created === null) {
      return null;
    }
    const parsed: number = Date.parse(created);
    if (Number.isNaN(parsed)) {
      return null;
    }
    return new Date(parsed);
  }

  private alreadySeen(seenIds: string[], externalId: string): boolean {
    for (let index: number = 0; index < seenIds.length; index++) {
      if (seenIds[index] === externalId) {
        return true;
      }
    }
    return false;
  }

  private readObject(bodyText: string, failure: string): Record<string, unknown> {
    const parsed: unknown = this.parseJson(bodyText);
    const record: Record<string, unknown> | null = JsonFields.record(parsed);
    if (record === null) {
      throw new Error(failure);
    }
    return record;
  }

  private parseJson(bodyText: string): unknown {
    try {
      return JSON.parse(bodyText) as unknown;
    } catch {
      throw new Error("Hacker News response was not valid JSON.");
    }
  }
}
