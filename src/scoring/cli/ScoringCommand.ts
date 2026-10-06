import { AppConfig } from "../../config/AppConfig";
import { ConfigLoader } from "../../config/ConfigLoader";
import { ErrorSanitizer } from "../../db/ErrorSanitizer";
import { RepositoryFactory } from "../../db/RepositoryFactory";
import { SqliteDatabase } from "../../db/SqliteDatabase";
import { SystemClock } from "../../fetchers/Clock";
import { DelaySleeper } from "../../fetchers/http/FetchHttpClient";
import { HtmlToText } from "../../fetchers/parsing/HtmlToText";
import { JobTextSanitizer } from "../../llm/JobTextSanitizer";
import { JsonExtractor } from "../../llm/JsonExtractor";
import { LlmClient } from "../../llm/LlmClient";
import { createLlmClient } from "../../llm/LlmClientFactory";
import { PiiGuard } from "../../llm/PiiGuard";
import { PromptLoader } from "../../llm/PromptLoader";
import { StructuredCompletion } from "../../llm/StructuredCompletion";
import { GccDetector } from "../../pipeline/GccDetector";
import { PhraseMatcher } from "../../pipeline/PhraseMatcher";
import { GroundingChecker } from "../../outputs/GroundingChecker";
import { TechnologyVocabulary } from "../../outputs/TechnologyVocabulary";
import { CoverLetterGenerator } from "../../outputs/CoverLetterGenerator";
import { CoverLetterValidator } from "../../outputs/CoverLetterValidator";
import { JobPostingPromptFields } from "../../outputs/JobPostingPromptFields";
import { ResumeTweaksCodec } from "../../outputs/ResumeTweaksOutput";
import { ResumeTweaksGenerator } from "../../outputs/ResumeTweaksGenerator";
import { TopJobOutputGenerator } from "../../outputs/TopJobOutputGenerator";
import { PiiRedactor } from "../../profile/PiiRedactor";
import { PiiValueStore, PiiValues } from "../../profile/PiiValueStore";
import { ProfileContext, ProfileContextProvider } from "../../profile/ProfileContextProvider";
import { ProfileFileHasher } from "../../profile/ProfileFileHasher";
import { ProfileLoader } from "../../profile/ProfileLoader";
import { SkillsMatrixStore } from "../../profile/SkillsMatrixStore";
import { PrivateTextFileWriter } from "../../profile/PrivateTextFileWriter";
import { CompanyScorer } from "../CompanyScorer";
import { FinalScoreCalculator } from "../FinalScoreCalculator";
import { JobScorer, JobScorerSettings } from "../JobScorer";
import { LocationScorer } from "../LocationScorer";
import { RankingService } from "../RankingService";
import { SalaryScorer } from "../SalaryScorer";
import { ScoreDetailsCodec } from "../ScoreDetails";
import { SkillListCleanupRunner } from "./SkillListCleanupRunner";
import { SkillListCleaner } from "../SkillListCleaner";
import { ScoringPromptBuilder } from "../ScoringPromptBuilder";

export interface ScoringSession {
  config: AppConfig;
  database: SqliteDatabase;
  factory: RepositoryFactory;
  ranking: RankingService;
  codec: ScoreDetailsCodec;
}

const PROFILE_PATH: string = "data/profile.json";
const MATRIX_PATH: string = "data/skills-matrix.json";
const PII_VALUES_PATH: string = "data/pii-values.json";
// The filter caps the shortlist well below this, so one pass covers every unscored job.
const VOCABULARY_PATH: string = "resources/technologies.txt";
const BATCH_LIMIT: number = 1000;

// Wires the scoring stage. The LLM client always comes from createLlmClient, so PiiGuard cannot be skipped.
export class ScoringCommand {
  public loadConfig(): AppConfig {
    const configPath: string = process.env.CONFIG_PATH ?? "config/config.yaml";
    return new ConfigLoader(configPath).load();
  }

  public openDatabase(): SqliteDatabase {
    return new SqliteDatabase(process.env.DB_PATH ?? "data/jobagent.sqlite");
  }

  public openSession(config: AppConfig, database: SqliteDatabase): ScoringSession {
    const factory: RepositoryFactory = new RepositoryFactory(database);
    const session: ScoringSession = {
      config: config,
      database: database,
      factory: factory,
      ranking: new RankingService(factory.jobs(), config, this.companyScorer(config, factory)),
      codec: new ScoreDetailsCodec(),
    };
    return session;
  }

  // The approved profile and matrix; throws if either is unapproved or out of date.
  public loadContext(): ProfileContext {
    return this.buildContextProvider().get();
  }

  // limit null scores every unscored shortlisted job.
  public buildScorer(session: ScoringSession, limit: number | null): JobScorer {
    const config: AppConfig = session.config;
    const redactor: PiiRedactor = this.buildRedactor();
    const client: LlmClient = this.buildClient(session, redactor);
    const promptLoader: PromptLoader = new PromptLoader("prompts");
    const sanitizer: JobTextSanitizer = new JobTextSanitizer(redactor, new HtmlToText(), config.llm.maxJobChars);
    const settings: JobScorerSettings = {
      temperature: config.llm.temperatures.scoring,
      maxTokens: config.llm.maxTokens.scoring,
      fallbackModelAvailable: this.isFallbackConfigured(),
      batchLimit: limit === null ? BATCH_LIMIT : limit,
    };
    return new JobScorer(
      session.factory.jobs(),
      this.buildContextProvider(),
      new ScoringPromptBuilder(promptLoader, sanitizer),
      promptLoader,
      new StructuredCompletion(client, new JsonExtractor()),
      new LocationScorer(),
      new SalaryScorer(config.filters.minSalaryUsd),
      this.companyScorer(config, session.factory),
      new FinalScoreCalculator(config.weights),
      session.codec,
      new SkillListCleaner(this.loadVocabulary()),
      settings,
    );
  }

  public buildOutputGenerator(session: ScoringSession): TopJobOutputGenerator {
    const config: AppConfig = session.config;
    const redactor: PiiRedactor = this.buildRedactor();
    const client: LlmClient = this.buildClient(session, redactor);
    const promptLoader: PromptLoader = new PromptLoader("prompts");
    const sanitizer: JobTextSanitizer = new JobTextSanitizer(redactor, new HtmlToText(), config.llm.maxJobChars);
    const fields: JobPostingPromptFields = new JobPostingPromptFields(sanitizer);
    const checker: GroundingChecker = new GroundingChecker(this.loadVocabulary(), config.grounding.domainTerms);
    const validator: CoverLetterValidator = new CoverLetterValidator(new PiiGuard(redactor), checker);
    const letters: CoverLetterGenerator = new CoverLetterGenerator(client, promptLoader, fields, validator, {
      temperature: config.llm.temperatures.coverLetter,
      maxTokens: config.llm.maxTokens.coverLetter,
    });
    const tweaks: ResumeTweaksGenerator = new ResumeTweaksGenerator(
      new StructuredCompletion(client, new JsonExtractor()),
      promptLoader,
      fields,
      checker,
      {
        temperature: config.llm.temperatures.resumeTweaks,
        maxTokens: config.llm.maxTokens.resumeTweaks,
        fallbackModelAvailable: this.isFallbackConfigured(),
      },
    );
    return new TopJobOutputGenerator(
      session.factory.jobOutputs(),
      letters,
      tweaks,
      validator,
      new ResumeTweaksCodec(),
      new SystemClock(),
    );
  }

  public loadVocabulary(): TechnologyVocabulary {
    return TechnologyVocabulary.fromFile(VOCABULARY_PATH);
  }

  public buildCleanupRunner(session: ScoringSession): SkillListCleanupRunner {
    return new SkillListCleanupRunner(
      session.factory.jobs(),
      session.codec,
      new SkillListCleaner(this.loadVocabulary()),
      this.buildContextProvider(),
    );
  }

  private buildRedactor(): PiiRedactor {
    const piiValues: PiiValues = new PiiValueStore(PII_VALUES_PATH).load();
    return new PiiRedactor(piiValues);
  }

  private buildClient(session: ScoringSession, redactor: PiiRedactor): LlmClient {
    return createLlmClient({
      config: session.config,
      apiUsage: session.factory.apiUsage(),
      piiGuard: new PiiGuard(redactor),
      clock: new SystemClock(),
      sleeper: new DelaySleeper(),
      errorSanitizer: new ErrorSanitizer(),
    });
  }

  public buildContextProvider(): ProfileContextProvider {
    return new ProfileContextProvider(
      new ProfileLoader(PROFILE_PATH),
      new SkillsMatrixStore(MATRIX_PATH, new PrivateTextFileWriter()),
      new ProfileFileHasher(PROFILE_PATH),
    );
  }

  private companyScorer(config: AppConfig, factory: RepositoryFactory): CompanyScorer {
    const phrases: PhraseMatcher = new PhraseMatcher();
    return new CompanyScorer(phrases, new GccDetector(phrases), {
      preferredNames: config.companies.preferred,
      gccSeedNames: config.gcc.seedCompanies,
      gccKeywords: config.gcc.keywords,
      knownCompanies: factory.companies().findAll(),
    });
  }

  private isFallbackConfigured(): boolean {
    const value: string = process.env.NVIDIA_FALLBACK_MODEL ?? "";
    return value.trim().length > 0;
  }
}
