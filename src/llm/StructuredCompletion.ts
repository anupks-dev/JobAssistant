import { z } from "zod";
import { JsonExtractor } from "./JsonExtractor";
import { LlmClient, LlmRequest, LlmResult } from "./LlmClient";

export interface StructuredCompletionSuccess<T> {
  ok: true;
  value: T;
  modelUsed: string;
  usedFallback: boolean;
}

export interface StructuredCompletionFailure {
  ok: false;
  reason: "parse" | "validation" | "api";
  details: string;
}

export type StructuredCompletionResult<T> = StructuredCompletionSuccess<T> | StructuredCompletionFailure;

export interface StructuredCompletionOptions<T> {
  taskName: string;
  systemPrompt: string;
  userPrompt: string;
  temperature: number;
  maxTokens: number;
  schema: z.ZodType<T>;
  fallbackModelAvailable: boolean;
}

// Calls the LLM, extracts JSON, validates it, and retries with safe correction hints only.
export class StructuredCompletion {
  public constructor(
    private readonly client: LlmClient,
    private readonly extractor: JsonExtractor,
  ) {}

  public async complete<T>(options: StructuredCompletionOptions<T>): Promise<StructuredCompletionResult<T>> {
    const firstAttempt: StructuredCompletionResult<T> = await this.attempt(options, options.userPrompt, false);
    if (firstAttempt.ok) {
      return firstAttempt;
    }
    const correctionPrompt: string = this.buildCorrectionPrompt(options.userPrompt, firstAttempt.details);
    const secondAttempt: StructuredCompletionResult<T> = await this.attempt(options, correctionPrompt, false);
    if (secondAttempt.ok) {
      return secondAttempt;
    }
    if (!options.fallbackModelAvailable) {
      return secondAttempt;
    }
    const fallbackAttempt: StructuredCompletionResult<T> = await this.attempt(options, correctionPrompt, true);
    return fallbackAttempt;
  }

  private async attempt<T>(
    options: StructuredCompletionOptions<T>,
    userPrompt: string,
    useFallbackModel: boolean,
  ): Promise<StructuredCompletionResult<T>> {
    const request: LlmRequest = {
      taskName: options.taskName,
      systemPrompt: options.systemPrompt,
      userPrompt: userPrompt,
      temperature: options.temperature,
      maxTokens: options.maxTokens,
      useFallbackModel: useFallbackModel,
    };
    let result: LlmResult;
    try {
      result = await this.client.complete(request);
    } catch (error: unknown) {
      const details: string = error instanceof Error ? error.message : "LLM request failed.";
      const failure: StructuredCompletionFailure = {
        ok: false,
        reason: "api",
        details: details,
      };
      return failure;
    }
    const extracted: ReturnType<JsonExtractor["extract"]> = this.extractor.extract(result.text);
    if (!extracted.ok) {
      const failure: StructuredCompletionFailure = {
        ok: false,
        reason: "parse",
        details: extracted.error,
      };
      return failure;
    }
    const parsed: z.ZodSafeParseResult<T> = options.schema.safeParse(extracted.value);
    if (!parsed.success) {
      const details: string = this.validationDetails(parsed.error.issues);
      const failure: StructuredCompletionFailure = {
        ok: false,
        reason: "validation",
        details: details,
      };
      return failure;
    }
    const success: StructuredCompletionSuccess<T> = {
      ok: true,
      value: parsed.data,
      modelUsed: result.modelUsed,
      usedFallback: result.usedFallback,
    };
    return success;
  }

  private buildCorrectionPrompt(originalPrompt: string, details: string): string {
    return originalPrompt
      + "\n\nYour previous response was invalid. Fix it and return only valid JSON.\n"
      + "Validation errors: "
      + details;
  }

  private validationDetails(issues: z.ZodIssue[]): string {
    let text: string = "";
    for (let index: number = 0; index < issues.length; index++) {
      const issue: z.ZodIssue = issues[index];
      let pathText: string = issue.path.join(".");
      if (pathText.length === 0) {
        pathText = "(root)";
      }
      if (text.length > 0) {
        text = text + "; ";
      }
      text = text + pathText + ": " + issue.message;
    }
    return text;
  }
}
