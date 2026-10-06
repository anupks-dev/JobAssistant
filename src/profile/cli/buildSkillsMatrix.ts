import { AppConfig } from "../../config/AppConfig";
import { ConfigLoader } from "../../config/ConfigLoader";
import { ErrorSanitizer } from "../../db/ErrorSanitizer";
import { RepositoryFactory } from "../../db/RepositoryFactory";
import { SqliteDatabase } from "../../db/SqliteDatabase";
import { SystemClock } from "../../fetchers/Clock";
import { DelaySleeper } from "../../fetchers/http/FetchHttpClient";
import { JsonExtractor } from "../../llm/JsonExtractor";
import { LlmClient } from "../../llm/LlmClient";
import { createLlmClient } from "../../llm/LlmClientFactory";
import { PiiGuard } from "../../llm/PiiGuard";
import { PromptLoader } from "../../llm/PromptLoader";
import { StructuredCompletion } from "../../llm/StructuredCompletion";
import { PiiRedactor } from "../PiiRedactor";
import { PiiValueStore } from "../PiiValueStore";
import { PrivateTextFileWriter } from "../PrivateTextFileWriter";
import { ProfileFileHasher } from "../ProfileFileHasher";
import { ProfileLoader } from "../ProfileLoader";
import { ProfileTextFormatter } from "../ProfileTextFormatter";
import { SkillsMatrix } from "../SkillsMatrix";
import { SkillsMatrixGenerator, SkillsMatrixSettings } from "../SkillsMatrixGenerator";
import { SkillsMatrixStore } from "../SkillsMatrixStore";

// Generates data/skills-matrix.json from the approved profile. Prints counts only, never profile text.
class BuildSkillsMatrixCommand {
  public async run(): Promise<void> {
    const profilePath: string = "data/profile.json";
    const matrixPath: string = "data/skills-matrix.json";
    const store: SkillsMatrixStore = new SkillsMatrixStore(matrixPath, new PrivateTextFileWriter());
    // A rerun would discard hand edits and approval, so it needs an explicit flag.
    if (store.exists() && !process.argv.includes("--force")) {
      throw new Error("data/skills-matrix.json already exists. Run with --force to replace it (edits and approval are lost).");
    }
    const configPath: string = process.env.CONFIG_PATH ?? "config/config.yaml";
    const config: AppConfig = new ConfigLoader(configPath).load();
    const database: SqliteDatabase = new SqliteDatabase(process.env.DB_PATH ?? "data/jobagent.sqlite");
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
      const settings: SkillsMatrixSettings = {
        excludeRoles: config.excludeRoles,
        temperature: config.llm.temperatures.skillsMatrix,
        maxTokens: config.llm.maxTokens.skillsMatrix,
        fallbackModelAvailable: this.isFallbackConfigured(),
      };
      const generator: SkillsMatrixGenerator = new SkillsMatrixGenerator(
        new ProfileLoader(profilePath),
        new ProfileFileHasher(profilePath),
        new ProfileTextFormatter(),
        new PromptLoader("prompts"),
        new StructuredCompletion(client, new JsonExtractor()),
        settings,
      );
      const matrix: SkillsMatrix = await generator.generate();
      store.save(matrix);
      console.log("Wrote " + matrixPath + " (approved=false). Entries: targetRoles="
        + String(matrix.targetRoles.length) + ", mustHave=" + String(matrix.mustHave.length)
        + ", niceToHave=" + String(matrix.niceToHave.length) + ", avoid=" + String(matrix.avoid.length)
        + ", strengths=" + String(matrix.strengths.length) + ".");
      console.log("Review and edit it, then run pnpm profile:skills:approve.");
    } finally {
      database.close();
    }
  }

  private isFallbackConfigured(): boolean {
    const value: string = process.env.NVIDIA_FALLBACK_MODEL ?? "";
    return value.trim().length > 0;
  }
}

const command: BuildSkillsMatrixCommand = new BuildSkillsMatrixCommand();
command.run().catch((error: unknown) => {
  const message: string = error instanceof Error ? error.message : "Skills matrix generation failed.";
  console.error(message);
  process.exit(1);
});
