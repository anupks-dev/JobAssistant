export interface JsonExtractSuccess {
  ok: true;
  value: unknown;
}

export interface JsonExtractFailure {
  ok: false;
  error: string;
}

export type JsonExtractResult = JsonExtractSuccess | JsonExtractFailure;

// Finds the first balanced JSON object in model output without throwing.
export class JsonExtractor {
  public extract(text: string): JsonExtractResult {
    const trimmed: string = this.stripCodeFences(text.trim());
    const start: number = trimmed.indexOf("{");
    if (start < 0) {
      const failure: JsonExtractFailure = { ok: false, error: "No JSON object found." };
      return failure;
    }
    const end: number = this.findBalancedObjectEnd(trimmed, start);
    if (end < 0) {
      const failure: JsonExtractFailure = { ok: false, error: "Unbalanced JSON object." };
      return failure;
    }
    const candidate: string = trimmed.slice(start, end + 1);
    try {
      const value: unknown = JSON.parse(candidate) as unknown;
      const success: JsonExtractSuccess = { ok: true, value: value };
      return success;
    } catch {
      const failure: JsonExtractFailure = { ok: false, error: "Invalid JSON." };
      return failure;
    }
  }

  private stripCodeFences(text: string): string {
    const fenceMatch: RegExpMatchArray | null = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenceMatch !== null && fenceMatch[1] !== undefined) {
      return fenceMatch[1].trim();
    }
    return text;
  }

  private findBalancedObjectEnd(text: string, start: number): number {
    let depth: number = 0;
    let inString: boolean = false;
    let escaped: boolean = false;
    for (let index: number = start; index < text.length; index++) {
      const character: string = text.charAt(index);
      if (inString) {
        if (escaped) {
          escaped = false;
          continue;
        }
        if (character === "\\") {
          escaped = true;
          continue;
        }
        if (character === "\"") {
          inString = false;
        }
        continue;
      }
      if (character === "\"") {
        inString = true;
        continue;
      }
      if (character === "{") {
        depth = depth + 1;
        continue;
      }
      if (character === "}") {
        depth = depth - 1;
        if (depth === 0) {
          return index;
        }
      }
    }
    return -1;
  }
}
