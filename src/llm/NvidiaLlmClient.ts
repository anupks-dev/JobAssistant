import OpenAI from "openai";
import { APIError } from "openai";
import { ChatCompletionCreateParamsNonStreaming } from "openai/resources/chat/completions";
import { ErrorSanitizer } from "../db/ErrorSanitizer";
import { Clock } from "../fetchers/Clock";
import { LlmClient, LlmRequest, LlmResult } from "./LlmClient";
import { LlmRetryableError } from "./LlmError";
import { LlmCleanResult, LlmResponseCleaner } from "./LlmResponseCleaner";

export interface NvidiaLlmSettings {
  primaryModel: string;
  fallbackModel: string | null;
  timeoutSeconds: number;
  baseUrl: string;
}

// NVIDIA's API accepts chat_template_kwargs but the OpenAI SDK types do not list it yet.
interface NvidiaChatTemplateKwargs {
  enable_thinking: boolean;
}

// The SDK serializes the whole params object as the request body, so an extended interface
// carries the extra field through without any cast to any.
interface NvidiaCompletionParams extends ChatCompletionCreateParamsNonStreaming {
  chat_template_kwargs: NvidiaChatTemplateKwargs;
}

interface NvidiaCompletionMessage {
  content?: string | null;
  reasoning_content?: string | null;
}

interface NvidiaCompletionChoice {
  message?: NvidiaCompletionMessage;
}

interface NvidiaCompletionResponse {
  choices?: NvidiaCompletionChoice[];
  model?: string;
}

export class NvidiaLlmClient implements LlmClient {
  public constructor(
    private readonly apiKey: string,
    private readonly settings: NvidiaLlmSettings,
    private readonly clock: Clock,
    private readonly cleaner: LlmResponseCleaner,
    private readonly errorSanitizer: ErrorSanitizer,
    private readonly clientFactory: (apiKey: string, baseUrl: string, timeoutMs: number) => OpenAI = NvidiaLlmClient.defaultClientFactory,
  ) {}

  public async complete(request: LlmRequest): Promise<LlmResult> {
    const useFallback: boolean = request.useFallbackModel === true;
    const model: string = this.selectModel(useFallback);
    const startedAtMs: number = this.clock.now().getTime();
    const client: OpenAI = this.clientFactory(this.apiKey, this.settings.baseUrl, this.settings.timeoutSeconds * 1000);
    const params: NvidiaCompletionParams = {
      model: model,
      temperature: request.temperature,
      max_tokens: request.maxTokens,
      messages: [
        { role: "system", content: request.systemPrompt },
        { role: "user", content: request.userPrompt },
      ],
      stream: false,
      chat_template_kwargs: {
        enable_thinking: false,
      },
    };
    try {
      const response: NvidiaCompletionResponse = await client.chat.completions.create(params) as NvidiaCompletionResponse;
      const endedAtMs: number = this.clock.now().getTime();
      const choice: NvidiaCompletionChoice | undefined = response.choices !== undefined && response.choices.length > 0
        ? response.choices[0]
        : undefined;
      const message: NvidiaCompletionMessage | undefined = choice?.message;
      const rawText: string = message?.content ?? "";
      const reasoningContent: string | null | undefined = message?.reasoning_content;
      const cleaned: LlmCleanResult = this.cleaner.clean(rawText, reasoningContent);
      const result: LlmResult = {
        text: cleaned.text,
        modelUsed: response.model ?? model,
        latencyMs: endedAtMs - startedAtMs,
        usedFallback: useFallback,
        hadReasoningContent: cleaned.hadReasoningContent,
      };
      return result;
    } catch (error: unknown) {
      throw this.mapError(error);
    }
  }

  private selectModel(useFallback: boolean): string {
    if (useFallback && this.settings.fallbackModel !== null && this.settings.fallbackModel.length > 0) {
      return this.settings.fallbackModel;
    }
    return this.settings.primaryModel;
  }

  private mapError(error: unknown): Error {
    if (error instanceof APIError) {
      const status: number | null = error.status ?? null;
      if (status === 429 || (status !== null && status >= 500)) {
        const retryAfterMs: number | null = this.readRetryAfterMs(error);
        const message: string = this.errorSanitizer.sanitize("LLM request failed.");
        return new LlmRetryableError(message, status, retryAfterMs);
      }
      const message: string = this.errorSanitizer.sanitize("LLM request was rejected.");
      return new Error(message);
    }
    if (error instanceof Error) {
      if (error.name === "AbortError" || error.name === "TimeoutError") {
        const message: string = this.errorSanitizer.sanitize("LLM request timed out.");
        return new LlmRetryableError(message, null, null);
      }
      const message: string = this.errorSanitizer.sanitize(error.message);
      if (error.name === "TypeError") {
        return new LlmRetryableError(message, null, null);
      }
      return new Error(message);
    }
    return new Error("LLM request failed.");
  }

  private readRetryAfterMs(error: APIError): number | null {
    const headers: Record<string, string> | undefined = error.headers as Record<string, string> | undefined;
    if (headers === undefined) {
      return null;
    }
    const retryAfter: string | undefined = headers["retry-after"] ?? headers["Retry-After"];
    if (retryAfter === undefined) {
      return null;
    }
    const seconds: number = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds >= 0) {
      return seconds * 1000;
    }
    const parsed: number = Date.parse(retryAfter);
    if (Number.isNaN(parsed)) {
      return null;
    }
    const delayMs: number = parsed - this.clock.now().getTime();
    if (delayMs < 0) {
      return 0;
    }
    return delayMs;
  }

  private static defaultClientFactory(apiKey: string, baseUrl: string, timeoutMs: number): OpenAI {
    const client: OpenAI = new OpenAI({
      apiKey: apiKey,
      baseURL: baseUrl,
      timeout: timeoutMs,
    });
    return client;
  }
}
