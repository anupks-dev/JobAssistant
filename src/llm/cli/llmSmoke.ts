import pino, { Logger } from "pino";
import { AppConfig } from "../../config/AppConfig";
import { ConfigLoader } from "../../config/ConfigLoader";
import { ErrorSanitizer } from "../../db/ErrorSanitizer";
import { RepositoryFactory } from "../../db/RepositoryFactory";
import { SqliteDatabase } from "../../db/SqliteDatabase";
import { SystemClock } from "../../fetchers/Clock";
import { DelaySleeper } from "../../fetchers/http/FetchHttpClient";
import { PiiGuard } from "../PiiGuard";
import { createLlmClient } from "../LlmClientFactory";
import { LlmClient, LlmRequest, LlmResult } from "../LlmClient";
import { PiiRedactor } from "../../profile/PiiRedactor";
import { PiiValueStore } from "../../profile/PiiValueStore";

// Sends one harmless prompt through the guarded client. Prints counts only, never secrets.
class LlmSmokeCommand {
  private readonly logger: Logger = pino({ level: "info" });

  public async run(): Promise<void> {
    const configPath: string = process.env.CONFIG_PATH ?? "config/config.yaml";
    const loader: ConfigLoader = new ConfigLoader(configPath);
    const config: AppConfig = loader.load();
    const database: SqliteDatabase = this.openDatabase();
    try {
      const factory: RepositoryFactory = new RepositoryFactory(database);
      const piiValues: ReturnType<PiiValueStore["load"]> = new PiiValueStore("data/pii-values.json").load();
      const guard: PiiGuard = new PiiGuard(new PiiRedactor(piiValues));
      const client: LlmClient = createLlmClient({
        config: config,
        apiUsage: factory.apiUsage(),
        piiGuard: guard,
        clock: new SystemClock(),
        sleeper: new DelaySleeper(),
        errorSanitizer: new ErrorSanitizer(),
      });
      const request: LlmRequest = {
        taskName: "smoke",
        systemPrompt: "Reply with one short sentence.",
        userPrompt: "Say hello in plain text.",
        temperature: 0.2,
        maxTokens: 32,
      };
      const result: LlmResult = await client.complete(request);
      const preview: string = result.text.slice(0, 200);
      const reasoningSeen: string = result.hadReasoningContent ? "yes" : "no";
      console.log("model=" + result.modelUsed);
      console.log("latencyMs=" + String(result.latencyMs));
      console.log("reasoningBeforeStrip=" + reasoningSeen);
      console.log("replyPreview=" + preview);
      this.logger.info({ taskName: request.taskName, latencyMs: result.latencyMs }, "LLM smoke finished");
    } finally {
      database.close();
    }
  }

  private openDatabase(): SqliteDatabase {
    const databasePath: string = process.env.DB_PATH ?? "data/jobagent.sqlite";
    return new SqliteDatabase(databasePath);
  }
}

const command: LlmSmokeCommand = new LlmSmokeCommand();
command.run().catch((error: unknown) => {
  const message: string = error instanceof Error ? error.message : "LLM smoke failed.";
  console.error(message);
  process.exit(1);
});
