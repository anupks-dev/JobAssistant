import pino, { Logger } from "pino";
import { AppConfig } from "../../config/AppConfig";
import { ConfigLoader } from "../../config/ConfigLoader";
import { RepositoryFactory } from "../../db/RepositoryFactory";
import { SqliteDatabase } from "../../db/SqliteDatabase";
import { BoardProbe, BoardProbeResult } from "../BoardProbe";
import { DelaySleeper, FetchHttpClient } from "../http/FetchHttpClient";
import { BoardSlugValidator } from "../parsing/BoardSlugValidator";
import { SourceCatalog } from "../SourceCatalog";
import { AtsCompanyGate } from "../sources/AtsCompanyGate";

class ProbeBoardsCommand {
  private readonly logger: Logger = pino({ level: "info" });

  public async run(argv: string[]): Promise<void> {
    const slugs: string[] = this.readSlugs(argv);
    if (slugs.length === 0) {
      throw new Error("Provide at least one board slug.");
    }
    const configPath: string = process.env.CONFIG_PATH ?? "config/config.yaml";
    const loader: ConfigLoader = new ConfigLoader(configPath);
    const config: AppConfig = loader.load();
    const database: SqliteDatabase = this.openDatabase();
    try {
      const factory: RepositoryFactory = new RepositoryFactory(database);
      const catalog: SourceCatalog = new SourceCatalog();
      const httpClient: FetchHttpClient = new FetchHttpClient(
        catalog,
        (url: string, init: RequestInit): Promise<Response> => fetch(url, init),
        new DelaySleeper(),
        { timeoutMs: 15000, maxResponseBytes: 10 * 1024 * 1024, maxRetries: 3 },
      );
      const delayMs: number = this.delayMs(config);
      const probe: BoardProbe = new BoardProbe(
        httpClient,
        new AtsCompanyGate(factory.companies()),
        new DelaySleeper(),
        new BoardSlugValidator(),
        delayMs,
      );
      const results: BoardProbeResult[] = await probe.probe(slugs);
      this.printResults(results);
    } finally {
      database.close();
    }
  }

  private readSlugs(argv: string[]): string[] {
    const slugs: string[] = [];
    for (let index: number = 0; index < argv.length; index++) {
      const argument: string = argv[index];
      if (argument.indexOf("-") === 0) {
        continue;
      }
      slugs.push(argument);
    }
    return slugs;
  }

  private openDatabase(): SqliteDatabase {
    const databasePath: string = process.env.DB_PATH ?? "data/jobagent.sqlite";
    return new SqliteDatabase(databasePath);
  }

  private delayMs(config: AppConfig): number {
    let delay: number = config.sources.greenhouse.requestDelayMs;
    if (config.sources.lever.requestDelayMs > delay) {
      delay = config.sources.lever.requestDelayMs;
    }
    if (config.sources.ashby.requestDelayMs > delay) {
      delay = config.sources.ashby.requestDelayMs;
    }
    return delay;
  }

  private printResults(results: BoardProbeResult[]): void {
    for (let index: number = 0; index < results.length; index++) {
      console.log(results[index].line);
    }
    this.logger.info({ slugCount: results.length }, "Board probe finished");
  }
}

const command: ProbeBoardsCommand = new ProbeBoardsCommand();
command.run(process.argv.slice(2)).catch((error: unknown) => {
  const message: string = error instanceof Error ? error.message : "Board probe failed.";
  console.error(message);
  process.exit(1);
});
