export interface LlmRequest {
  taskName: string;
  systemPrompt: string;
  userPrompt: string;
  temperature: number;
  maxTokens: number;
  useFallbackModel?: boolean;
}

export interface LlmResult {
  text: string;
  modelUsed: string;
  latencyMs: number;
  usedFallback: boolean;
  hadReasoningContent: boolean;
}

export interface LlmClient {
  complete(request: LlmRequest): Promise<LlmResult>;
}
