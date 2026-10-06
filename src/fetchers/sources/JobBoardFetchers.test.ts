import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";
import { Job } from "../../models/Job";
import { HttpClient, HttpResponseResult } from "../http/HttpClient";
import { HtmlToText } from "../parsing/HtmlToText";
import { RemoteTypeInference } from "../parsing/RemoteTypeInference";
import { SalaryParser } from "../parsing/SalaryParser";
import { UrlValidator } from "../parsing/UrlValidator";
import { SourceCatalog } from "../SourceCatalog";
import { SourcePolicy } from "../SourcePolicy";
import { ArbeitnowFetcher } from "./ArbeitnowFetcher";
import { HimalayasFetcher } from "./HimalayasFetcher";
import { RemoteOkFetcher } from "./RemoteOkFetcher";
import { RemotiveFetcher } from "./RemotiveFetcher";
import { WeWorkRemotelyFetcher } from "./WeWorkRemotelyFetcher";

class FixtureHttpClient implements HttpClient {
  public readonly requestedUrls: string[] = [];

  public constructor(private readonly bodies: Map<string, string>) {}

  public async get(url: string, sourceId: string, requestDelayMs: number): Promise<HttpResponseResult> {
    this.requestedUrls.push(url);
    if (sourceId.length === 0 || requestDelayMs < 0) {
      throw new Error("Missing fixture.");
    }
    const bodyText: string | undefined = this.bodies.get(url);
    if (bodyText === undefined) {
      throw new Error("Missing fixture.");
    }
    const result: HttpResponseResult = { status: 200, bodyText: bodyText, headers: {} };
    return result;
  }
}

function readFixture(name: string): string {
  const fixturePath: string = join(process.cwd(), "tests", "fixtures", name);
  return readFileSync(fixturePath, "utf8");
}

function readSample(name: string): string {
  const samplePath: string = join(process.cwd(), "docs", "samples", name);
  return readFileSync(samplePath, "utf8");
}

function policy(maxPages: number): SourcePolicy {
  const value: SourcePolicy = {
    enabled: true,
    minIntervalMinutes: 720,
    maxPages: maxPages,
    requestDelayMs: 0,
  };
  return value;
}

describe("job board fetchers", () => {
  const catalog: SourceCatalog = new SourceCatalog();
  const htmlToText: HtmlToText = new HtmlToText();
  const remoteTypeInference: RemoteTypeInference = new RemoteTypeInference();

  it("maps a RemoteOK job and skips the legal notice", async () => {
    const bodies: Map<string, string> = new Map<string, string>();
    bodies.set("https://remoteok.com/api", readFixture("remoteok.json"));
    const client: FixtureHttpClient = new FixtureHttpClient(bodies);
    const fetcher: RemoteOkFetcher = new RemoteOkFetcher(client, policy(1), catalog, htmlToText, remoteTypeInference);
    const jobs: Job[] = await fetcher.fetchJobs();
    expect(jobs.length).toBe(1);
    expect(jobs[0].title).toBe("Senior Backend Engineer");
    expect(jobs[0].company).toBe("Example Labs");
    expect(jobs[0].url).toBe("https://remoteok.com/remote-jobs/1137460");
    expect(jobs[0].postedAt?.toISOString()).toBe("2026-10-02T12:53:01.000Z");
    expect(jobs[0].description).toBe("Build APIs.");
    expect(jobs[0].salaryMin).toBe(120000);
    expect(jobs[0].salaryMax).toBe(160000);
    expect(jobs[0].currency).toBe("USD");
    expect(jobs[0].externalId).toBe("1137460");
  });

  it("maps the saved RemoteOK sample and keeps mixed-case hosts", async () => {
    const bodies: Map<string, string> = new Map<string, string>();
    bodies.set("https://remoteok.com/api", readSample("remoteok.json"));
    const client: FixtureHttpClient = new FixtureHttpClient(bodies);
    const fetcher: RemoteOkFetcher = new RemoteOkFetcher(client, policy(1), catalog, htmlToText, remoteTypeInference);
    const jobs: Job[] = await fetcher.fetchJobs();
    expect(jobs.length).toBe(99);
    const validator: UrlValidator = new UrlValidator(catalog);
    let allowed: number = 0;
    for (let index: number = 0; index < jobs.length; index++) {
      if (validator.isAllowed(jobs[index].url, "remoteok")) {
        allowed = allowed + 1;
      }
    }
    expect(allowed).toBe(jobs.length);
  });

  it("throws when RemoteOK returns only the legal notice", async () => {
    const bodies: Map<string, string> = new Map<string, string>();
    bodies.set("https://remoteok.com/api", "[{\"legal\":\"Please see the legal notice.\"}]");
    const client: FixtureHttpClient = new FixtureHttpClient(bodies);
    const fetcher: RemoteOkFetcher = new RemoteOkFetcher(client, policy(1), catalog, htmlToText, remoteTypeInference);
    await expect(fetcher.fetchJobs()).rejects.toThrow("RemoteOK returned no jobs.");
  });

  it("maps a Remotive job and ignores warning keys", async () => {
    const bodies: Map<string, string> = new Map<string, string>();
    bodies.set("https://remotive.com/api/remote-jobs?category=software-dev", readFixture("remotive.json"));
    const client: FixtureHttpClient = new FixtureHttpClient(bodies);
    const fetcher: RemotiveFetcher = new RemotiveFetcher(
      client,
      policy(1),
      ["software-dev"],
      catalog,
      htmlToText,
      new SalaryParser(),
      remoteTypeInference,
    );
    const jobs: Job[] = await fetcher.fetchJobs();
    expect(jobs.length).toBe(1);
    expect(jobs[0].title).toBe("Backend Engineer");
    expect(jobs[0].company).toBe("Northwind");
    expect(jobs[0].url).toBe("https://remotive.com/remote-jobs/software-dev/example-20411");
    expect(jobs[0].postedAt?.toISOString()).toBe("2026-09-30T13:15:26.000Z");
    expect(jobs[0].description).toBe("Ship services.");
    expect(jobs[0].salaryMin).toBe(120000);
    expect(jobs[0].salaryMax).toBe(160000);
  });

  it("splits We Work Remotely titles and merges feeds without duplicate links", async () => {
    const bodies: Map<string, string> = new Map<string, string>();
    bodies.set("https://weworkremotely.com/categories/remote-back-end-programming-jobs.rss", readFixture("wwr-backend.xml"));
    bodies.set("https://weworkremotely.com/categories/remote-full-stack-programming-jobs.rss", readFixture("wwr-fullstack.xml"));
    const client: FixtureHttpClient = new FixtureHttpClient(bodies);
    const feeds: string[] = ["remote-back-end-programming-jobs", "remote-full-stack-programming-jobs"];
    const fetcher: WeWorkRemotelyFetcher = new WeWorkRemotelyFetcher(
      client,
      policy(1),
      feeds,
      catalog,
      htmlToText,
      remoteTypeInference,
    );
    const jobs: Job[] = await fetcher.fetchJobs();
    expect(jobs.length).toBe(3);
    expect(jobs[0].company).toBe("Twikey");
    expect(jobs[0].title).toBe("Senior Java Developer");
    expect(jobs[0].url).toBe("https://weworkremotely.com/remote-jobs/twikey-senior-java-developer");
    expect(jobs[0].description).toBe("Build APIs.");
    expect(jobs[0].postedAt).not.toBeNull();
    expect(jobs[2].title).toBe("Full Stack Developer");
  });

  it("walks Himalayas pages with nextCursor and annualizes hourly pay", async () => {
    const bodies: Map<string, string> = new Map<string, string>();
    bodies.set("https://himalayas.app/jobs/api?limit=20", readFixture("himalayas-page-1.json"));
    bodies.set("https://himalayas.app/jobs/api?limit=20&cursor=cursor-page-2", readFixture("himalayas-page-2.json"));
    const client: FixtureHttpClient = new FixtureHttpClient(bodies);
    const fetcher: HimalayasFetcher = new HimalayasFetcher(client, policy(5), catalog, htmlToText, remoteTypeInference);
    const jobs: Job[] = await fetcher.fetchJobs();
    expect(client.requestedUrls.length).toBe(2);
    expect(jobs.length).toBe(2);
    expect(jobs[0].title).toBe("Support Specialist");
    expect(jobs[0].company).toBe("Peak Labs");
    expect(jobs[0].url).toBe("https://himalayas.app/companies/peak-labs/jobs/support-specialist");
    expect(jobs[0].salaryMin).toBe(50 * 40 * 52);
    expect(jobs[0].salaryMax).toBe(80 * 40 * 52);
    expect(jobs[0].description).toBe("Help customers.");
    expect(jobs[0].postedAt?.toISOString()).toBe(new Date(1759402381 * 1000).toISOString());
    expect(jobs[1].title).toBe("Data Engineer");
    expect(jobs[1].salaryKnown).toBe(false);
  });

  it("keeps only remote Arbeitnow jobs and follows links.next", async () => {
    const bodies: Map<string, string> = new Map<string, string>();
    bodies.set("https://www.arbeitnow.com/api/job-board-api", readFixture("arbeitnow-page-1.json"));
    bodies.set("https://www.arbeitnow.com/api/job-board-api?page=2", readFixture("arbeitnow-page-2.json"));
    const client: FixtureHttpClient = new FixtureHttpClient(bodies);
    const fetcher: ArbeitnowFetcher = new ArbeitnowFetcher(client, policy(3), catalog, htmlToText, remoteTypeInference);
    const jobs: Job[] = await fetcher.fetchJobs();
    expect(client.requestedUrls.length).toBe(2);
    expect(jobs.length).toBe(2);
    expect(jobs[0].title).toBe("Backend Engineer");
    expect(jobs[0].company).toBe("Example GmbH");
    expect(jobs[0].url).toBe("https://www.arbeitnow.com/jobs/remote-backend-example");
    expect(jobs[0].description).toBe("Remote role.");
    expect(jobs[0].postedAt?.toISOString()).toBe(new Date(1759402381 * 1000).toISOString());
    expect(jobs[1].title).toBe("Frontend Engineer");
  });
});
