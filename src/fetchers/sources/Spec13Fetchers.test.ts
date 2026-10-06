import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";
import { ConfigLoader } from "../../config/ConfigLoader";
import { ErrorSanitizer } from "../../db/ErrorSanitizer";
import { RepositoryFactory } from "../../db/RepositoryFactory";
import { Company, CompanyFlags } from "../../db/repositories/CompanyRepository";
import { StoredJob } from "../../db/repositories/JobRepository";
import { SourceStatusRecord } from "../../db/repositories/RunRepository";
import { SqliteDatabase } from "../../db/SqliteDatabase";
import { Job } from "../../models/Job";
import { Clock } from "../Clock";
import { FetchBatch } from "../FetchBatch";
import { FetchOrchestrator, SourceFetchReport } from "../FetchOrchestrator";
import { BoardProbe, BoardProbeResult } from "../BoardProbe";
import { JobFetcher } from "../JobFetcher";
import { HttpClient, HttpResponseResult } from "../http/HttpClient";
import { Sleeper } from "../http/FetchHttpClient";
import { BoardSlugValidator } from "../parsing/BoardSlugValidator";
import { HnHeadlineParser } from "../parsing/HnHeadlineParser";
import { HtmlToText } from "../parsing/HtmlToText";
import { RemoteTypeInference } from "../parsing/RemoteTypeInference";
import { UrlValidator } from "../parsing/UrlValidator";
import { SourceCatalog } from "../SourceCatalog";
import { SourcePolicy } from "../SourcePolicy";
import { AdzunaCredentials, AdzunaFetcher, AdzunaQuerySettings } from "./AdzunaFetcher";
import { AshbyFetcher } from "./AshbyFetcher";
import { AtsBoardConfig } from "./AtsBoardConfig";
import { AtsBoardRunner } from "./AtsBoardRunner";
import { AtsCompanyGate } from "./AtsCompanyGate";
import { GreenhouseFetcher } from "./GreenhouseFetcher";
import { HackerNewsFetcher } from "./HackerNewsFetcher";
import { LeverFetcher } from "./LeverFetcher";

class FixedClock implements Clock {
  public constructor(private readonly instant: Date) {}

  public now(): Date {
    return this.instant;
  }
}

class RoutingHttpClient implements HttpClient {
  public readonly requestedUrls: string[] = [];

  public constructor(private readonly handler: (url: string) => HttpResponseResult) {}

  public async get(url: string, sourceId: string, requestDelayMs: number): Promise<HttpResponseResult> {
    this.requestedUrls.push(url);
    if (sourceId.length < 0 || requestDelayMs < 0) {
      throw new Error("Missing fixture.");
    }
    return this.handler(url);
  }
}

class ImmediateSleeper implements Sleeper {
  public sleeps: number = 0;

  public async sleep(milliseconds: number): Promise<void> {
    if (milliseconds > 0) {
      this.sleeps = this.sleeps + 1;
    }
  }
}

class FakeFetcher implements JobFetcher {
  public constructor(
    private readonly sourceId: string,
    private readonly policy: SourcePolicy,
    private readonly failure: Error | null,
  ) {}

  public getSourceName(): string {
    return this.sourceId;
  }

  public getSourceId(): string {
    return this.sourceId;
  }

  public getPolicy(): SourcePolicy {
    return this.policy;
  }

  public async fetchJobs(): Promise<Job[]> {
    if (this.failure !== null) {
      throw this.failure;
    }
    return [];
  }
}

function readFixture(name: string): string {
  const fixturePath: string = join(process.cwd(), "tests", "fixtures", name);
  return readFileSync(fixturePath, "utf8");
}

function policy(maxPages: number, delayMs: number): SourcePolicy {
  const value: SourcePolicy = {
    enabled: true,
    minIntervalMinutes: 720,
    maxPages: maxPages,
    requestDelayMs: delayMs,
  };
  return value;
}

function ok(bodyText: string, status: number): HttpResponseResult {
  const result: HttpResponseResult = { status: status, bodyText: bodyText, headers: {} };
  return result;
}

function blockedFlags(): CompanyFlags {
  const flags: CompanyFlags = {
    isGcc: false,
    isPreferred: false,
    isBlocked: true,
    atsType: null,
    boardSlug: null,
  };
  return flags;
}

describe("spec 1.3 fetchers", () => {
  const catalog: SourceCatalog = new SourceCatalog();
  const htmlToText: HtmlToText = new HtmlToText();
  const remoteTypeInference: RemoteTypeInference = new RemoteTypeInference();
  const clock: FixedClock = new FixedClock(new Date("2026-10-04T12:00:00.000Z"));

  it("loads the config with an empty ATS board list", () => {
    const loader: ConfigLoader = new ConfigLoader(join(process.cwd(), "config", "config.yaml"));
    expect(loader.load().atsBoards.length).toBe(0);
    expect(loader.load().sources.adzuna.country).toBe("in");
    expect(catalog.findById("adzuna")?.displayName).toBe("Adzuna");
  });

  it("selects the hiring thread, keeps top-level comments, and builds permalinks", async () => {
    const threads: string = readFixture("hn-threads.json");
    const comments: string = readFixture("hn-comments.json");
    const threadRecord: { hits: Record<string, unknown>[] } = JSON.parse(threads) as { hits: Record<string, unknown>[] };
    const freelancer: Record<string, unknown> = {};
    const sourceHit: Record<string, unknown> = threadRecord.hits[0];
    const keys: string[] = Object.keys(sourceHit);
    for (let index: number = 0; index < keys.length; index++) {
      freelancer[keys[index]] = sourceHit[keys[index]];
    }
    freelancer.title = "Ask HN: Freelancer? Who is hiring?";
    freelancer.objectID = "1";
    freelancer.created_at_i = 1999999999;
    threadRecord.hits.unshift(freelancer);
    const commentRecord: { hits: Record<string, unknown>[] } = JSON.parse(comments) as { hits: Record<string, unknown>[] };
    commentRecord.hits.push({
      objectID: "900",
      parent_id: 49922569,
      comment_text: "",
      _tags: ["comment", "deleted"],
    });
    commentRecord.hits.push({
      objectID: 901,
      parent_id: "49922569",
      comment_text: "| Staff Engineer | Remote",
      _tags: ["comment"],
    });
    const client: RoutingHttpClient = new RoutingHttpClient((url: string): HttpResponseResult => {
      if (url.indexOf("tags=story") >= 0) {
        return ok(JSON.stringify(threadRecord), 200);
      }
      return ok(JSON.stringify(commentRecord), 200);
    });
    const fetcher: HackerNewsFetcher = new HackerNewsFetcher(
      client,
      policy(3, 0),
      catalog,
      htmlToText,
      remoteTypeInference,
      new HnHeadlineParser(["Bangalore"]),
      7,
      clock,
    );
    const jobs: Job[] = await fetcher.fetchJobs();
    expect(client.requestedUrls[1]).toContain("story_49922569");
    expect(client.requestedUrls[1]).not.toContain("story_49922568");
    const commentUrl: URL = new URL(client.requestedUrls[1]);
    expect(commentUrl.searchParams.get("numericFilters")).toContain("created_at_i>");
    const mattermost: Job | null = findJob(jobs, "49946276");
    const kraken: Job | null = findJob(jobs, "49945738");
    const ripple: Job | null = findJob(jobs, "49945147");
    const unknownCompany: Job | null = findJob(jobs, "901");
    expect(mattermost).not.toBeNull();
    expect(mattermost?.company).toBe("Mattermost");
    expect(mattermost?.location).toContain("Remote");
    expect(mattermost?.url).toBe("https://news.ycombinator.com/item?id=49946276");
    expect(mattermost?.descriptionIsSnippet).toBe(false);
    expect(mattermost?.salaryKnown).toBe(false);
    expect(mattermost?.description).not.toContain("<p>");
    expect(mattermost?.description).toContain("Mattermost");
    expect(kraken?.company).toBe("Kraken Tech");
    expect(kraken?.title).toContain("Engineer");
    expect(ripple?.company).toBe("Ripple");
    expect(ripple?.title).toContain("Engineer");
    expect(ripple?.remoteType).toBe("hybrid");
    expect(unknownCompany?.company).toBe("Unknown");
    expect(findJob(jobs, "49947208")).toBeNull();
    expect(findJob(jobs, "900")).toBeNull();
  });

  it("maps Adzuna jobs, drops the implausible salary, and hides credentials", async () => {
    const database: SqliteDatabase = new SqliteDatabase(":memory:");
    const factory: RepositoryFactory = new RepositoryFactory(database);
    const fixture: string = readFixture("adzuna.json");
    const client: RoutingHttpClient = new RoutingHttpClient((): HttpResponseResult => {
      return ok(fixture, 200);
    });
    const fetcher: AdzunaFetcher = adzunaFetcher(client, factory, clock, ["Tech Lead"], 30, 2000, {
      appId: "fixture-app-id",
      appKey: "fixture-app-key",
    });
    const jobs: Job[] = await fetcher.fetchJobs();
    expect(jobs.length).toBe(5);
    expect(jobs[0].externalId).toBe("5910234360");
    expect(jobs[0].title).toBe("Engineering Manager");
    expect(jobs[0].company).toBe("Razorpay");
    expect(jobs[0].location).toBe("Bangalore, Karnataka");
    expect(jobs[0].url).toContain("https://www.adzuna.in/details/5910234360");
    expect(jobs[0].descriptionIsSnippet).toBe(true);
    expect(jobs[0].salaryKnown).toBe(false);
    expect(jobs[0].salaryIsEstimated).toBe(false);
    expect(jobs[0].salaryMin).toBeNull();
    expect(jobs[0].postedAt?.toISOString()).toBe("2026-10-03T21:36:50.000Z");
    expect(JSON.stringify(jobs)).not.toContain("fixture-app-id");
    expect(JSON.stringify(jobs)).not.toContain("fixture-app-key");
    const leaking: RoutingHttpClient = new RoutingHttpClient((): HttpResponseResult => {
      throw new Error("https://api.adzuna.com/search?app_id=fixture-app-id&app_key=fixture-app-key");
    });
    const failing: AdzunaFetcher = adzunaFetcher(leaking, factory, clock, ["Tech Lead"], 30, 2000, {
      appId: "fixture-app-id",
      appKey: "fixture-app-key",
    });
    const batches: FetchBatch[] = await failing.fetchBatches();
    const note: string = batches[0].note ?? "";
    expect(batches[0].status).toBe("error");
    expect(note).not.toContain("fixture-app-id");
    expect(note).not.toContain("fixture-app-key");
    expect(factory.apiUsage().getDayCount("adzuna", "2026-10-04")).toBe(2);
    database.close();
  });

  it("treats a predicted Adzuna salary as unknown and accepts a numeric id", async () => {
    const database: SqliteDatabase = new SqliteDatabase(":memory:");
    const factory: RepositoryFactory = new RepositoryFactory(database);
    const payload: { results: Record<string, unknown>[] } = JSON.parse(readFixture("adzuna.json")) as {
      results: Record<string, unknown>[];
    };
    payload.results[0].id = 5910234360;
    payload.results[0].salary_is_predicted = "1";
    payload.results[0].salary_min = 1800000;
    payload.results[0].salary_max = 2400000;
    const client: RoutingHttpClient = new RoutingHttpClient((): HttpResponseResult => {
      return ok(JSON.stringify(payload), 200);
    });
    const fetcher: AdzunaFetcher = adzunaFetcher(client, factory, clock, ["Tech Lead"], 30, 2000, {
      appId: "fixture-app-id",
      appKey: "fixture-app-key",
    });
    const jobs: Job[] = await fetcher.fetchJobs();
    expect(jobs[0].externalId).toBe("5910234360");
    expect(jobs[0].salaryKnown).toBe(false);
    expect(jobs[0].salaryIsEstimated).toBe(true);
    expect(jobs[0].salaryMin).toBeNull();
    database.close();
  });

  it("stops Adzuna calls at the budget and skips when credentials are missing", async () => {
    const database: SqliteDatabase = new SqliteDatabase(":memory:");
    const factory: RepositoryFactory = new RepositoryFactory(database);
    const client: RoutingHttpClient = new RoutingHttpClient((): HttpResponseResult => {
      return ok(readFixture("adzuna.json"), 200);
    });
    const limited: AdzunaFetcher = adzunaFetcher(client, factory, clock, ["Tech Lead", "Senior Backend Engineer"], 1, 2000, {
      appId: "fixture-app-id",
      appKey: "fixture-app-key",
    });
    const stopped: FetchBatch[] = await limited.fetchBatches();
    expect(stopped[0].status).toBe("skipped");
    expect(stopped[0].note).toBe("budget");
    expect(client.requestedUrls.length).toBe(1);
    expect(factory.apiUsage().getDayCount("adzuna", "2026-10-04")).toBe(1);
    expect(factory.apiUsage().getMonthCount("adzuna", "2026-10")).toBe(1);
    const blocked: RoutingHttpClient = new RoutingHttpClient((): HttpResponseResult => {
      return ok(readFixture("adzuna.json"), 200);
    });
    const missing: AdzunaFetcher = adzunaFetcher(blocked, factory, clock, ["Tech Lead"], 30, 2000, {
      appId: "",
      appKey: "",
    });
    const skipped: FetchBatch[] = await missing.fetchBatches();
    expect(skipped[0].status).toBe("skipped");
    expect(skipped[0].note).toBe("Adzuna credentials are missing.");
    expect(blocked.requestedUrls.length).toBe(0);
    database.close();
  });

  it("decodes Greenhouse HTML, converts Lever timestamps, and skips unlisted Ashby jobs", async () => {
    const database: SqliteDatabase = new SqliteDatabase(":memory:");
    const factory: RepositoryFactory = new RepositoryFactory(database);
    const runner: AtsBoardRunner = new AtsBoardRunner(new AtsCompanyGate(factory.companies()), new BoardSlugValidator());
    const greenhouseBody: string = readFixture("greenhouse.json");
    const greenhouseClient: RoutingHttpClient = new RoutingHttpClient((): HttpResponseResult => {
      return ok(greenhouseBody, 200);
    });
    const greenhouse: GreenhouseFetcher = new GreenhouseFetcher(
      greenhouseClient,
      policy(1, 0),
      [board("GitLab", "greenhouse", "gitlab")],
      catalog,
      htmlToText,
      remoteTypeInference,
      runner,
    );
    const greenhouseJobs: Job[] = await greenhouse.fetchJobs();
    expect(greenhouseJobs[0].company).toBe("GitLab");
    expect(greenhouseJobs[0].title).toBe("Account Executive - France");
    expect(greenhouseJobs[0].location).toBe("Remote, France");
    expect(greenhouseJobs[0].externalId).toBe("8860302002");
    expect(greenhouseJobs[0].description).toContain("GitLab is the intelligent orchestration platform");
    expect(greenhouseJobs[0].description).not.toContain("&lt;");
    expect(greenhouseJobs[0].description).not.toContain("<div");
    expect(greenhouseJobs[0].remoteType).toBe("remote");
    const savedCompany: Company | null = factory.companies().findByName("GitLab");
    expect(savedCompany?.atsType).toBe("greenhouse");
    expect(savedCompany?.boardSlug).toBe("gitlab");

    const leverBody: { id: string; text: string; createdAt: number; hostedUrl: string }[] = JSON.parse(readFixture("lever.json")) as {
      id: string;
      text: string;
      createdAt: number;
      hostedUrl: string;
    }[];
    const leverClient: RoutingHttpClient = new RoutingHttpClient((): HttpResponseResult => {
      return ok(readFixture("lever.json"), 200);
    });
    const lever: LeverFetcher = new LeverFetcher(
      leverClient,
      policy(1, 0),
      [board("Spotify", "lever", "spotify")],
      catalog,
      htmlToText,
      remoteTypeInference,
      runner,
    );
    const leverJobs: Job[] = await lever.fetchJobs();
    expect(leverJobs[0].title).toBe(leverBody[0].text);
    expect(leverJobs[0].company).toBe("Spotify");
    expect(leverJobs[0].postedAt?.toISOString()).toBe(new Date(leverBody[0].createdAt).toISOString());
    expect(leverJobs[0].url).toBe(leverBody[0].hostedUrl);
    expect(leverJobs[0].remoteType).toBe("hybrid");

    const ashbyPayload: { jobs: Record<string, unknown>[] } = JSON.parse(readFixture("ashby.json")) as {
      jobs: Record<string, unknown>[];
    };
    const hiddenId: string = String(ashbyPayload.jobs[1].id);
    ashbyPayload.jobs[1].isListed = false;
    const ashbyClient: RoutingHttpClient = new RoutingHttpClient((): HttpResponseResult => {
      return ok(JSON.stringify(ashbyPayload), 200);
    });
    const ashby: AshbyFetcher = new AshbyFetcher(
      ashbyClient,
      policy(1, 0),
      [board("Linear", "ashby", "linear")],
      catalog,
      htmlToText,
      remoteTypeInference,
      runner,
    );
    const ashbyJobs: Job[] = await ashby.fetchJobs();
    expect(ashbyJobs.length).toBe(1);
    expect(ashbyJobs[0].company).toBe("Linear");
    expect(ashbyJobs[0].remoteType).toBe("remote");
    expect(findJob(ashbyJobs, hiddenId)).toBeNull();
    database.close();
  });

  it("rejects unsafe board slugs and reports an unparsed board as an error", async () => {
    const validator: BoardSlugValidator = new BoardSlugValidator();
    expect(validator.isValid("../x")).toBe(false);
    expect(validator.isValid("Hub Spot")).toBe(false);
    expect(validator.isValid("A".repeat(65).toLowerCase())).toBe(false);
    expect(validator.isValid("gitlab")).toBe(true);
    const database: SqliteDatabase = new SqliteDatabase(":memory:");
    const factory: RepositoryFactory = new RepositoryFactory(database);
    const runner: AtsBoardRunner = new AtsBoardRunner(new AtsCompanyGate(factory.companies()), validator);
    const client: RoutingHttpClient = new RoutingHttpClient((): HttpResponseResult => {
      return ok("{\"jobs\":[{\"id\":1}]}", 200);
    });
    const fetcher: GreenhouseFetcher = new GreenhouseFetcher(
      client,
      policy(1, 0),
      [board("GitLab", "greenhouse", "../x"), board("GitLab", "greenhouse", "gitlab")],
      catalog,
      htmlToText,
      remoteTypeInference,
      runner,
    );
    const batches: FetchBatch[] = await fetcher.fetchBatches();
    expect(batches[0].status).toBe("error");
    expect(batches[0].note).toBe("Invalid board slug.");
    expect(batches[1].status).toBe("error");
    expect(batches[1].note).toContain("contained records");
    expect(client.requestedUrls.length).toBe(1);
    expect(client.requestedUrls[0]).toBe("https://boards-api.greenhouse.io/v1/boards/gitlab/jobs?content=true");
    database.close();
  });

  it("skips a blocked company board", async () => {
    const database: SqliteDatabase = new SqliteDatabase(":memory:");
    const factory: RepositoryFactory = new RepositoryFactory(database);
    factory.companies().upsertCompany("GitLab", blockedFlags());
    const runner: AtsBoardRunner = new AtsBoardRunner(new AtsCompanyGate(factory.companies()), new BoardSlugValidator());
    const client: RoutingHttpClient = new RoutingHttpClient((): HttpResponseResult => {
      return ok(readFixture("greenhouse.json"), 200);
    });
    const fetcher: GreenhouseFetcher = new GreenhouseFetcher(
      client,
      policy(1, 0),
      [board("GitLab", "greenhouse", "gitlab")],
      catalog,
      htmlToText,
      remoteTypeInference,
      runner,
    );
    const batches: FetchBatch[] = await fetcher.fetchBatches();
    expect(batches[0].status).toBe("skipped");
    expect(batches[0].note).toBe("blocked");
    expect(client.requestedUrls.length).toBe(0);
    database.close();
  });

  it("probes ATS endpoints, counts jobs, and stores none when every board is missing", async () => {
    const database: SqliteDatabase = new SqliteDatabase(":memory:");
    const factory: RepositoryFactory = new RepositoryFactory(database);
    const greenhouseBody: string = readFixture("greenhouse.json");
    const client: RoutingHttpClient = new RoutingHttpClient((url: string): HttpResponseResult => {
      if (url.indexOf("/boards/gitlab/") >= 0) {
        return ok(greenhouseBody, 200);
      }
      if (url.indexOf("/postings/gitlab") >= 0 || url.indexOf("/job-board/gitlab") >= 0) {
        return ok("missing", 404);
      }
      return ok("missing", 404);
    });
    const probe: BoardProbe = new BoardProbe(
      client,
      new AtsCompanyGate(factory.companies()),
      new ImmediateSleeper(),
      new BoardSlugValidator(),
      0,
    );
    const found: BoardProbeResult[] = await probe.probe(["gitlab"]);
    expect(found[0].line).toBe("gitlab ats=greenhouse jobs=2");
    expect(found[0].line).not.toContain("GitLab is the intelligent");
    expect(factory.companies().findByName("gitlab")?.atsType).toBe("greenhouse");
    expect(factory.companies().findByName("gitlab")?.boardSlug).toBe("gitlab");
    const missingClient: RoutingHttpClient = new RoutingHttpClient((): HttpResponseResult => {
      return ok("missing", 404);
    });
    const missingProbe: BoardProbe = new BoardProbe(
      missingClient,
      new AtsCompanyGate(factory.companies()),
      new ImmediateSleeper(),
      new BoardSlugValidator(),
      0,
    );
    const missing: BoardProbeResult[] = await missingProbe.probe(["infracloud"]);
    expect(missing[0].line).toBe("infracloud no supported board");
    expect(factory.companies().findByName("infracloud")?.atsType).toBe("none");
    expect(factory.companies().findByName("infracloud")?.boardSlug).toBeNull();
    expect(missingClient.requestedUrls.length).toBe(3);
    database.close();
  });

  it("keeps a failed board from stopping other boards or sources", async () => {
    const database: SqliteDatabase = new SqliteDatabase(":memory:");
    const factory: RepositoryFactory = new RepositoryFactory(database);
    const runner: AtsBoardRunner = new AtsBoardRunner(new AtsCompanyGate(factory.companies()), new BoardSlugValidator());
    const client: RoutingHttpClient = new RoutingHttpClient((url: string): HttpResponseResult => {
      if (url.indexOf("/boards/gitlab/") >= 0) {
        return ok(readFixture("greenhouse.json"), 200);
      }
      throw new Error("https://boards-api.greenhouse.io/v1/boards/broken/jobs?app_key=fixture-app-key");
    });
    const greenhouse: GreenhouseFetcher = new GreenhouseFetcher(
      client,
      policy(1, 0),
      [board("Broken Co", "greenhouse", "broken"), board("GitLab", "greenhouse", "gitlab")],
      catalog,
      htmlToText,
      remoteTypeInference,
      runner,
    );
    const failing: FakeFetcher = new FakeFetcher("remoteok", policy(720, 0), new Error("app_key=fixture-app-key"));
    const orchestrator: FetchOrchestrator = new FetchOrchestrator(
      [failing, greenhouse],
      factory.jobs(),
      factory.runs(),
      factory.appState(),
      new UrlValidator(catalog),
      new ErrorSanitizer(),
    );
    const runId: number = factory.runs().startRun("manual");
    const reports: SourceFetchReport[] = await orchestrator.fetchAll(runId, true);
    expect(reports[0].sourceId).toBe("remoteok");
    expect(reports[0].status).toBe("error");
    expect(reports[1].sourceId).toBe("greenhouse:broken");
    expect(reports[1].status).toBe("error");
    expect(reports[2].sourceId).toBe("greenhouse:gitlab");
    expect(reports[2].status).toBe("ok");
    expect(reports[2].inserted).toBe(2);
    const stored: StoredJob[] = factory.jobs().findByStatus("new", 10);
    expect(stored.length).toBe(2);
    expect(stored[0].status).toBe("new");
    const statuses: SourceStatusRecord[] = factory.runs().getLastRun()?.sourceStatuses ?? [];
    let combined: string = "";
    for (let index: number = 0; index < statuses.length; index++) {
      combined = combined + " " + (statuses[index].errorMessage ?? "");
    }
    expect(combined).not.toContain("fixture-app-key");
    database.close();
  });
});

function findJob(jobs: Job[], externalId: string): Job | null {
  for (let index: number = 0; index < jobs.length; index++) {
    if (jobs[index].externalId === externalId) {
      return jobs[index];
    }
  }
  return null;
}

function board(company: string, ats: "greenhouse" | "lever" | "ashby", slug: string): AtsBoardConfig {
  const value: AtsBoardConfig = { company: company, ats: ats, slug: slug };
  return value;
}

function adzunaFetcher(
  client: HttpClient,
  factory: RepositoryFactory,
  clock: Clock,
  roles: string[],
  maxCallsPerDay: number,
  maxCallsPerMonth: number,
  credentials: AdzunaCredentials,
): AdzunaFetcher {
  const settings: AdzunaQuerySettings = {
    roles: roles,
    cities: ["Bangalore"],
    country: "in",
    postedWithinDays: 7,
    maxCallsPerDay: maxCallsPerDay,
    maxCallsPerMonth: maxCallsPerMonth,
  };
  return new AdzunaFetcher(
    client,
    policy(2, 0),
    settings,
    credentials,
    new SourceCatalog(),
    new HtmlToText(),
    new RemoteTypeInference(),
    factory.apiUsage(),
    factory.jobs(),
    clock,
  );
}
