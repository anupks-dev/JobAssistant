import { readFileSync } from "fs";
import { z } from "zod";

export interface PiiValues {
  fullName: string;
  alternateNames: string[];
  emails: string[];
  phones: string[];
  addresses: string[];
  otherValues: string[];
}

const PiiValuesSchema = z.object({
  fullName: z.string(),
  alternateNames: z.array(z.string()),
  emails: z.array(z.string()),
  phones: z.array(z.string()),
  addresses: z.array(z.string()),
  otherValues: z.array(z.string()),
});

// Loads the local list of exact strings to scrub. The file itself is secret.
export class PiiValueStore {
  public constructor(private readonly filePath: string) {}

  public load(): PiiValues {
    let fileText: string;
    try {
      fileText = readFileSync(this.filePath, "utf-8");
    } catch {
      throw new Error("PII values file is missing or unreadable: " + this.filePath);
    }
    const withoutBom: string = fileText.replace(/^\uFEFF/, "");
    const raw: unknown = this.parseJson(withoutBom);
    const parsed: z.ZodSafeParseResult<PiiValues> = PiiValuesSchema.safeParse(raw);
    if (!parsed.success) {
      const fieldList: string = this.fieldNames(parsed.error.issues);
      throw new Error("PII values file is invalid. Check these fields: " + fieldList);
    }
    return parsed.data;
  }

  private parseJson(fileText: string): unknown {
    try {
      const raw: unknown = JSON.parse(fileText) as unknown;
      return raw;
    } catch {
      throw new Error("PII values file is not valid JSON: " + this.filePath);
    }
  }

  // Zod issue messages can echo the rejected value, so only field paths are reported.
  private fieldNames(issues: z.ZodIssue[]): string {
    let names: string = "";
    for (let index: number = 0; index < issues.length; index++) {
      const issue: z.ZodIssue = issues[index];
      let pathText: string = issue.path.join(".");
      if (pathText.length === 0) {
        pathText = "(root)";
      }
      if (names.length > 0) {
        names += ", ";
      }
      names += pathText;
    }
    return names;
  }
}
