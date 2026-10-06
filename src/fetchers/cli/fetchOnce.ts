import pino, { Logger } from "pino";
import { AppConfig } from "../../config/AppConfig";
import { ConfigLoader } from "../../config/ConfigLoader";
import { ErrorSanitizer } from "../../db/ErrorSanitizer";
import { RepositoryFactory } from "../../db/RepositoryFactory";
import { FinishedRunStatus, RunCounts } from "../../db/repositories/RunRepository";
import { SqliteDatabase } from "../../db/SqliteDatabase";
import { SystemClock } from "../Clock";
import { FetchOrchestrator, SourceFetchReport } from "../FetchOrchestrator";
import { JobFetcher } from "../JobFetcher";
import { DelaySleeper, FetchHttpClient } from "../http/FetchHttpClient";
import { BoardSlugValidator } from "../parsing/BoardSlugValidator";
import { HnHeadlineParser } from "../parsing/HnHeadlineParser";
import { HtmlToText } from "../parsing/HtmlToText";
import { RemoteTypeInference } from "../parsing/RemoteTypeInference";
import { SalaryParser } from "../parsing/SalaryParser";
import { UrlValidator } from "../parsing/UrlValidator";
import { SourceCatalog } from "../SourceCatalog";
import { SourcePolicy } from "../SourcePolicy";
import { AdzunaCredentials, AdzunaFetcher, AdzunaQuerySettings } from "../sources/AdzunaFetcher";
import { ArbeitnowFetcher } from "../sources/ArbeitnowFetcher";
import { AshbyFetcher } from "../sources/AshbyFetcher";
import { AtsBoardConfig, AtsName } from "../sources/AtsBoardConfig";
import { AtsBoardRunner } from "../sources/AtsBoardRunner";
import { AtsCompanyGate } from "../sources/AtsCompanyGate";
import { GreenhouseFetcher } from "../sources/GreenhouseFetcher";
import { HackerNewsFetcher } from "../sources/HackerNewsFetcher";
import { HimalayasFetcher } from "../sources/HimalayasFetcher";
import { LeverFetcher } from "../sources/LeverFetcher";
import { RemoteOkFetcher } from "../sources/RemoteOkFetcher";
import { RemotiveFetcher } from "../sources/RemotiveFetcher";
import { WeWorkRemotelyFetcher } from "../sources/WeWorkRemotelyFetcher";

interface FetchOnceOptions {
  force: boolean;
  sourceId: string | null;
}

// One manual fetch. Prints counts and statuses only.
class FetchOnceCommand {
  private readonly logger: Logger = pino({ level: "info" });

  public async run(argv: string[]): Promise<void> {
    const options: FetchOnceOptions = this.readOptions(argv);
    const configPath: string = process.env.CONFIG_PATH ?? "config/config.yaml";
    const loader: ConfigLoader = new ConfigLoader(configPath);
    const config: AppConfig = loader.load();
    const database: SqliteDatabase = this.openDatabase();
    try {
      const factory: RepositoryFactory = new RepositoryFactory(database);
      const catalog: SourceCatalog = new SourceCatalog();
      const fetchers: JobFetcher[] = this.buildFetchers(config, catalog, factory, options.sourceId);
      const orchestrator: FetchOrchestrator = new FetchOrchestrator(
        fetchers,
        factory.jobs(),
        factory.runs(),
        factory.appState(),
        new UrlValidator(catalog),
        new ErrorSanitizer(),
      );
      const runId: number = factory.runs().startRun("manual");
      const reports: SourceFetchReport[] = await orchestrator.fetchAll(runId, options.force);
      const status: FinishedRunStatus = this.runStatus(reports);
      const counts: RunCounts = this.runCounts(reports);
      factory.runs().finishRun(runId, status, counts);
      this.printReports(reports, status);
    } finally {
      database.close();
    }
  }

  private readOptions(argv: string[]): FetchOnceOptions {
    let force: boolean = false;
    let sourceId: string | null = null;
    for (let index: number = 0; index < argv.length; index++) {
      const argument: string = argv[index];
      if (argument === "--force") {
        force = true;
      }
      if (argument.indexOf("--source=") === 0) {
        sourceId = argument.slice("--source=".length);
      }
    }
    const options: FetchOnceOptions = { force: force, sourceId: sourceId };
    return options;
  }

  private openDatabase(): SqliteDatabase {
    const databasePath: string = process.env.DB_PATH ?? "data/jobagent.sqlite";
    return new SqliteDatabase(databasePath);
  }

  private buildFetchers(
    config: AppConfig,
    catalog: SourceCatalog,
    factory: RepositoryFactory,
    sourceId: string | null,
  ): JobFetcher[] {
    const htmlToText: HtmlToText = new HtmlToText();
    const salaryParser: SalaryParser = new SalaryParser();
    const remoteTypeInference: RemoteTypeInference = new RemoteTypeInference();
    const httpClient: FetchHttpClient = new FetchHttpClient(
      catalog,
      (url: string, init: RequestInit): Promise<Response> => fetch(url, init),
      new DelaySleeper(),
      { timeoutMs: 15000, maxResponseBytes: 10 * 1024 * 1024, maxRetries: 3 },
    );
    const available: JobFetcher[] = [];
    available.push(new RemoteOkFetcher(httpClient, this.policy(config.sources.remoteok), catalog, htmlToText, remoteTypeInference));
    available.push(new RemotiveFetcher(
      httpClient,
      this.policy(config.sources.remotive),
      config.sources.remotive.categories,
      catalog,
      htmlToText,
      salaryParser,
      remoteTypeInference,
    ));
    available.push(new WeWorkRemotelyFetcher(
      httpClient,
      this.policy(config.sources.weworkremotely),
      config.sources.weworkremotely.feeds,
      catalog,
      htmlToText,
      remoteTypeInference,
    ));
    available.push(new HimalayasFetcher(httpClient, this.policy(config.sources.himalayas), catalog, htmlToText, remoteTypeInference));
    available.push(new ArbeitnowFetcher(httpClient, this.policy(config.sources.arbeitnow), catalog, htmlToText, remoteTypeInference));
    const clock: SystemClock = new SystemClock();
    const headlineParser: HnHeadlineParser = new HnHeadlineParser(config.locations.onsiteCities);
    available.push(new HackerNewsFetcher(
      httpClient,
      this.policy(config.sources.hackernews),
      catalog,
      htmlToText,
      remoteTypeInference,
      headlineParser,
      config.filters.postedWithinDays,
      clock,
    ));
    const adzunaSettings: AdzunaQuerySettings = {
      roles: config.roles,
      cities: config.locations.onsiteCities,
      country: config.sources.adzuna.country,
      postedWithinDays: config.filters.postedWithinDays,
      maxCallsPerDay: config.sources.adzuna.maxCallsPerDay,
      maxCallsPerMonth: config.sources.adzuna.maxCallsPerMonth,
    };
    const adzunaCredentials: AdzunaCredentials = {
      appId: process.env.ADZUNA_APP_ID ?? "",
      appKey: process.env.ADZUNA_APP_KEY ?? "",
    };
    available.push(new AdzunaFetcher(
      httpClient,
      this.policy(config.sources.adzuna),
      adzunaSettings,
      adzunaCredentials,
      catalog,
      htmlToText,
      remoteTypeInference,
      factory.apiUsage(),
      factory.jobs(),
      clock,
    ));
    const runner: AtsBoardRunner = new AtsBoardRunner(new AtsCompanyGate(factory.companies()), new BoardSlugValidator());
    available.push(new GreenhouseFetcher(
      httpClient,
      this.policy(config.sources.greenhouse),
      this.boardsFor(config, "greenhouse"),
      catalog,
      htmlToText,
      remoteTypeInference,
      runner,
    ));
    available.push(new LeverFetcher(
      httpClient,
      this.policy(config.sources.lever),
      this.boardsFor(config, "lever"),
      catalog,
      htmlToText,
      remoteTypeInference,
      runner,
    ));
    available.push(new AshbyFetcher(
      httpClient,
      this.policy(config.sources.ashby),
      this.boardsFor(config, "ashby"),
      catalog,
      htmlToText,
      remoteTypeInference,
      runner,
    ));
    return this.selectFetchers(available, sourceId);
  }

  private boardsFor(config: AppConfig, ats: AtsName): AtsBoardConfig[] {
    const selected: AtsBoardConfig[] = [];
    for (let index: number = 0; index < config.atsBoards.length; index++) {
      const board: AtsBoardConfig = config.atsBoards[index];
      if (board.ats === ats) {
        selected.push(board);
      }
    }
    return selected;
  }

  private selectFetchers(available: JobFetcher[], sourceId: string | null): JobFetcher[] {
    const selected: JobFetcher[] = [];
    for (let index: number = 0; index < available.length; index++) {
      const fetcher: JobFetcher = available[index];
      if (sourceId !== null) {
        if (fetcher.getSourceId() === sourceId) {
          selected.push(fetcher);
        }
        continue;
      }
      if (fetcher.getPolicy().enabled) {
        selected.push(fetcher);
      }
    }
    if (sourceId !== null && selected.length === 0) {
      throw new Error("Unknown source.");
    }
    return selected;
  }

  private policy(source: SourcePolicy): SourcePolicy {
    const policy: SourcePolicy = {
      enabled: source.enabled,
      minIntervalMinutes: source.minIntervalMinutes,
      maxPages: source.maxPages,
      requestDelayMs: source.requestDelayMs,
    };
    return policy;
  }

  private runStatus(reports: SourceFetchReport[]): FinishedRunStatus {
    let errorCount: number = 0;
    let okCount: number = 0;
    for (let index: number = 0; index < reports.length; index++) {
      if (reports[index].status === "error") {
        errorCount = errorCount + 1;
      }
      if (reports[index].status === "ok") {
        okCount = okCount + 1;
      }
    }
    if (errorCount === 0) {
      return "success";
    }
    if (okCount === 0 && errorCount === reports.length) {
      return "failed";
    }
    return "partial";
  }

  private runCounts(reports: SourceFetchReport[]): RunCounts {
    let fetchedCount: number = 0;
    for (let index: number = 0; index < reports.length; index++) {
      fetchedCount = fetchedCount + reports[index].fetched;
    }
    const counts: RunCounts = {
      fetchedCount: fetchedCount,
      filteredCount: 0,
      shortlistedCount: 0,
      sentCount: 0,
    };
    return counts;
  }

  private droppedText(report: SourceFetchReport): string {
    let text: string = " dropped=" + String(report.droppedUrls);
    if (report.droppedUrls === 0) {
      return text;
    }
    const parts: string[] = [];
    if (report.droppedHosts > 0) {
      parts.push("host=" + String(report.droppedHosts));
    }
    if (report.droppedInvalidUrls > 0) {
      parts.push("invalid_url=" + String(report.droppedInvalidUrls));
    }
    if (parts.length === 0) {
      return text;
    }
    let joined: string = "";
    for (let index: number = 0; index < parts.length; index++) {
      if (index > 0) {
        joined = joined + ", ";
      }
      joined = joined + parts[index];
    }
    return text + " (" + joined + ")";
  }

  private printReports(reports: SourceFetchReport[], status: FinishedRunStatus): void {
    for (let index: number = 0; index < reports.length; index++) {
      const report: SourceFetchReport = reports[index];
      console.log(
        report.sourceId
        + " status=" + report.status
        + " fetched=" + String(report.fetched)
        + " inserted=" + String(report.inserted)
        + " skipped=" + String(report.skipped)
        + this.droppedText(report),
      );
    }
    this.logger.info({ status: status, sourceCount: reports.length }, "Fetch finished");
  }
}

const command: FetchOnceCommand = new FetchOnceCommand();
command.run(process.argv).catch((error: unknown) => {
  const message: string = error instanceof Error ? error.message : "Fetch failed.";
  console.error(message);
  process.exit(1);
});
