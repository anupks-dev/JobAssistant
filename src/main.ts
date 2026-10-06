import pino, { Logger } from "pino";
import { AppConfig } from "./config/AppConfig";
import { ConfigLoader } from "./config/ConfigLoader";
import { RepositoryFactory } from "./db/RepositoryFactory";
import { SqliteDatabase } from "./db/SqliteDatabase";

// Entry point. Loads config, opens SQLite, and applies migrations.
// Later phases wire in the fetchers, LLM client, Telegram bot and scheduler.
class Application {
  private readonly logger: Logger = pino({ level: "info" });

  public async start(): Promise<void> {
    const configPath: string = process.env.CONFIG_PATH ?? "config/config.yaml";
    const loader: ConfigLoader = new ConfigLoader(configPath);
    const config: AppConfig = loader.load();

    this.logger.info(
      { roleCount: config.roles.length },
      "JobAgent started. Configuration loaded."
    );

    const database: SqliteDatabase = this.openDatabase();
    const factory: RepositoryFactory = new RepositoryFactory(database);
    this.requireRepositories(factory);
    const schemaVersion: number = database.getSchemaVersion();
    this.logger.info({ schemaVersion: schemaVersion }, "Database ready.");
  }

  private openDatabase(): SqliteDatabase {
    const databasePath: string = process.env.DB_PATH ?? "data/jobagent.sqlite";
    const database: SqliteDatabase = new SqliteDatabase(databasePath);
    // The process exits after startup today. Closing folds the WAL back into the database file.
    process.on("exit", (): void => {
      database.close();
    });
    return database;
  }

  private requireRepositories(factory: RepositoryFactory): void {
    const repositories: object[] = [];
    repositories.push(factory.jobs());
    repositories.push(factory.sentJobs());
    repositories.push(factory.companies());
    repositories.push(factory.runs());
    repositories.push(factory.appState());
    repositories.push(factory.apiUsage());
    repositories.push(factory.configHistory());
    if (repositories.length !== 7) {
      throw new Error("Database repositories were not created.");
    }
  }
}

const application: Application = new Application();
application.start().catch((error: unknown) => {
  console.error("JobAgent failed to start:", error);
  process.exit(1);
});
