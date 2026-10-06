import pino, { Logger } from "pino";
import { AppConfig } from "../../config/AppConfig";
import { ConfigLoader } from "../../config/ConfigLoader";
import { RepositoryFactory } from "../../db/RepositoryFactory";
import { SqliteDatabase } from "../../db/SqliteDatabase";
import { SystemClock } from "../../fetchers/Clock";
import { CurrencyConverter } from "../CurrencyConverter";
import { FilterPipelineRunner } from "../FilterPipelineRunner";
import { GccDetector } from "../GccDetector";
import { JobFilter } from "../JobFilter";
import { JobFilterPipeline } from "../JobFilterPipeline";
import { LocationNormalizer } from "../LocationNormalizer";
import { PhraseMatcher } from "../PhraseMatcher";
import { PreScorer } from "../PreScorer";
import { RegionEligibilityClassifier } from "../RegionEligibilityClassifier";
import { BlockedCompanyFilter } from "../filters/BlockedCompanyFilter";
import { DuplicateFilter } from "../filters/DuplicateFilter";
import { LocationFilter } from "../filters/LocationFilter";
import { PostingAgeFilter } from "../filters/PostingAgeFilter";
import { SalaryFilter } from "../filters/SalaryFilter";
import { TitleFilter } from "../filters/TitleFilter";
import { TitlePrimarySegment } from "../TitlePrimarySegment";

export interface FilterSession {
  database: SqliteDatabase;
  runner: FilterPipelineRunner;
  factory: RepositoryFactory;
}

export class FilterCommand {
  public readonly logger: Logger = pino({ level: "info" });

  public open(): FilterSession {
    const configPath: string = process.env.CONFIG_PATH ?? "config/config.yaml";
    const loader: ConfigLoader = new ConfigLoader(configPath);
    const config: AppConfig = loader.load();
    const databasePath: string = process.env.DB_PATH ?? "data/jobagent.sqlite";
    const database: SqliteDatabase = new SqliteDatabase(databasePath);
    const factory: RepositoryFactory = new RepositoryFactory(database);
    const phrases: PhraseMatcher = new PhraseMatcher();
    const filters: JobFilter[] = this.filters(phrases);
    const runner: FilterPipelineRunner = new FilterPipelineRunner(
      factory.jobs(),
      factory.sentJobs(),
      factory.companies(),
      config,
      new SystemClock(),
      new JobFilterPipeline(filters),
      new PreScorer(phrases),
    );
    const session: FilterSession = { database: database, runner: runner, factory: factory };
    return session;
  }

  public filters(phrases: PhraseMatcher): JobFilter[] {
    const normalizer: LocationNormalizer = new LocationNormalizer(phrases);
    const regions: RegionEligibilityClassifier = new RegionEligibilityClassifier(phrases);
    const gccDetector: GccDetector = new GccDetector(phrases);
    const filters: JobFilter[] = [];
    filters.push(new BlockedCompanyFilter(phrases));
    filters.push(new PostingAgeFilter());
    filters.push(new TitleFilter(phrases, new TitlePrimarySegment()));
    filters.push(new LocationFilter(normalizer, regions, gccDetector, phrases));
    filters.push(new SalaryFilter(new CurrencyConverter()));
    filters.push(new DuplicateFilter());
    return filters;
  }
}
