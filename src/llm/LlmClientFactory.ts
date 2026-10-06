import { AppConfig } from "../config/AppConfig";
import { ErrorSanitizer } from "../db/ErrorSanitizer";
import { ApiUsageRepository } from "../db/repositories/ApiUsageRepository";
import { Clock } from "../fetchers/Clock";
import { PiiGuard } from "./PiiGuard";
import { GuardedLlmClient } from "./GuardedLlmClient";
import { LlmClient } from "./LlmClient";
import { LlmRateLimiter, Sleeper } from "./LlmRateLimiter";
import { LlmResponseCleaner } from "./LlmResponseCleaner";
import { NvidiaLlmClient, NvidiaLlmSettings } from "./NvidiaLlmClient";
import { ResilientLlmClient } from "./ResilientLlmClient";

export interface LlmClientFactoryDependencies {
  config: AppConfig;
  apiUsage: ApiUsageRepository;
  piiGuard: PiiGuard;
  clock: Clock;
  sleeper: Sleeper;
  errorSanitizer: ErrorSanitizer;
}

// The only supported way to obtain an LlmClient. NvidiaLlmClient is always behind PiiGuard.
export function createLlmClient(dependencies: LlmClientFactoryDependencies): LlmClient {
  const apiKey: string = process.env.NVIDIA_API_KEY ?? "";
  if (apiKey.length === 0) {
    throw new Error("NVIDIA_API_KEY is not set.");
  }
  const primaryModel: string = process.env.NVIDIA_MODEL ?? "";
  if (primaryModel.length === 0) {
    throw new Error("NVIDIA_MODEL is not set.");
  }
  const fallbackModel: string | null = readFallbackModel();
  const settings: NvidiaLlmSettings = {
    primaryModel: primaryModel,
    fallbackModel: fallbackModel,
    timeoutSeconds: dependencies.config.llm.timeoutSeconds,
    baseUrl: process.env.NVIDIA_BASE_URL ?? "https://integrate.api.nvidia.com/v1",
  };
  const nvidiaClient: NvidiaLlmClient = new NvidiaLlmClient(
    apiKey,
    settings,
    dependencies.clock,
    new LlmResponseCleaner(),
    dependencies.errorSanitizer,
  );
  const guardedClient: GuardedLlmClient = new GuardedLlmClient(nvidiaClient, dependencies.piiGuard);
  const rateLimiter: LlmRateLimiter = new LlmRateLimiter(
    dependencies.config.llm.requestsPerMinute,
    dependencies.clock,
    dependencies.sleeper,
  );
  const fallbackAvailable: boolean = fallbackModel !== null && fallbackModel.length > 0;
  const resilientClient: ResilientLlmClient = new ResilientLlmClient(
    guardedClient,
    rateLimiter,
    dependencies.apiUsage,
    dependencies.clock,
    dependencies.sleeper,
    fallbackAvailable,
  );
  return resilientClient;
}

function readFallbackModel(): string | null {
  const value: string | undefined = process.env.NVIDIA_FALLBACK_MODEL;
  if (value === undefined || value.trim().length === 0) {
    return null;
  }
  return value.trim();
}
