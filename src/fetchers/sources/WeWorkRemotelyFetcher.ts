import { CheerioAPI, load } from "cheerio";
import { Job } from "../../models/Job";
import { JobFetcher } from "../JobFetcher";
import { HttpClient } from "../http/HttpClient";
import { HtmlToText } from "../parsing/HtmlToText";
import { RemoteTypeInference } from "../parsing/RemoteTypeInference";
import { SourceCatalog } from "../SourceCatalog";
import { SourcePolicy } from "../SourcePolicy";

interface SplitTitle {
  company: string;
  title: string;
}

export class WeWorkRemotelyFetcher implements JobFetcher {
  public constructor(
    private readonly httpClient: HttpClient,
    private readonly policy: SourcePolicy,
    private readonly feeds: string[],
    private readonly catalog: SourceCatalog,
    private readonly htmlToText: HtmlToText,
    private readonly remoteTypeInference: RemoteTypeInference,
  ) {}

  public getSourceId(): string {
    return "weworkremotely";
  }

  public getSourceName(): string {
    const source = this.catalog.findById(this.getSourceId());
    if (source === null) {
      return "We Work Remotely";
    }
    return source.displayName;
  }

  public getPolicy(): SourcePolicy {
    return this.policy;
  }

  public async fetchJobs(): Promise<Job[]> {
    const jobs: Job[] = [];
    const seenLinks: string[] = [];
    for (let index: number = 0; index < this.feeds.length; index++) {
      const feedJobs: Job[] = await this.fetchFeed(this.feeds[index]);
      for (let jobIndex: number = 0; jobIndex < feedJobs.length; jobIndex++) {
        const job: Job = feedJobs[jobIndex];
        if (!this.alreadySeen(seenLinks, job.url)) {
          seenLinks.push(job.url);
          jobs.push(job);
        }
      }
    }
    return jobs;
  }

  private async fetchFeed(feed: string): Promise<Job[]> {
    const url: string = "https://weworkremotely.com/categories/" + encodeURIComponent(feed) + ".rss";
    const response = await this.httpClient.get(url, this.getSourceId(), this.policy.requestDelayMs);
    const document: CheerioAPI = load(response.bodyText, { xml: true });
    const itemCount: number = document("item").length;
    const jobs: Job[] = [];
    for (let index: number = 0; index < itemCount; index++) {
      const job: Job | null = this.toJob(document, index);
      if (job !== null) {
        jobs.push(job);
      }
    }
    return jobs;
  }

  private toJob(document: CheerioAPI, index: number): Job | null {
    const item = document("item").eq(index);
    const rawTitle: string = item.find("title").first().text().trim();
    const link: string = item.find("link").first().text().trim();
    const guid: string = item.find("guid").first().text().trim();
    if (rawTitle.length === 0 || link.length === 0) {
      return null;
    }
    const split: SplitTitle = this.splitTitle(rawTitle);
    const region: string = item.find("region").first().text().trim();
    const country: string = item.find("country").first().text().trim();
    let location: string = region;
    if (location.length === 0) {
      location = country;
    }
    const descriptionHtml: string = item.find("description").first().text();
    const externalId: string = guid.length > 0 ? guid : link;
    const job: Job = {
      source: this.getSourceId(),
      externalId: externalId,
      title: split.title,
      company: split.company,
      location: location,
      remoteType: this.remoteTypeInference.infer(location, [], "remote"),
      salaryMin: null,
      salaryMax: null,
      currency: null,
      salaryKnown: false,
      salaryIsEstimated: false,
      url: link,
      postedAt: this.readPostedAt(item.find("pubDate").first().text()),
      description: this.htmlToText.toPlainText(descriptionHtml),
      descriptionIsSnippet: false,
    };
    return job;
  }

  private splitTitle(rawTitle: string): SplitTitle {
    const separator: number = rawTitle.indexOf(": ");
    if (separator < 0) {
      const whole: SplitTitle = { company: "", title: rawTitle };
      return whole;
    }
    const split: SplitTitle = {
      company: rawTitle.slice(0, separator).trim(),
      title: rawTitle.slice(separator + 2).trim(),
    };
    return split;
  }

  private readPostedAt(value: string): Date | null {
    const text: string = value.trim();
    if (text.length === 0) {
      return null;
    }
    const parsed: Date = new Date(text);
    if (Number.isNaN(parsed.getTime())) {
      return null;
    }
    return parsed;
  }

  private alreadySeen(seenLinks: string[], url: string): boolean {
    for (let index: number = 0; index < seenLinks.length; index++) {
      if (seenLinks[index] === url) {
        return true;
      }
    }
    return false;
  }
}
