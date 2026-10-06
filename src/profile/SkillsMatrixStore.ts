import { existsSync, readFileSync } from "fs";
import { PrivateTextFileWriter } from "./PrivateTextFileWriter";
import { SkillsMatrix, SkillsMatrixSchema } from "./SkillsMatrix";
import { z } from "zod";

// Reads and writes data/skills-matrix.json. The file is private (mode 600).
export class SkillsMatrixStore {
  public constructor(
    private readonly matrixPath: string,
    private readonly fileWriter: PrivateTextFileWriter,
  ) {}

  public exists(): boolean {
    return existsSync(this.matrixPath);
  }

  public load(): SkillsMatrix {
    if (!this.exists()) {
      throw new Error("Skills matrix is missing. Run pnpm profile:skills.");
    }
    const fileText: string = readFileSync(this.matrixPath, "utf-8");
    let raw: unknown;
    try {
      raw = JSON.parse(fileText) as unknown;
    } catch {
      throw new Error("Skills matrix file is not valid JSON.");
    }
    const parsed: z.ZodSafeParseResult<SkillsMatrix> = SkillsMatrixSchema.safeParse(raw);
    if (!parsed.success) {
      throw new Error("Skills matrix file does not match the expected schema.");
    }
    return parsed.data;
  }

  public save(matrix: SkillsMatrix): void {
    const text: string = JSON.stringify(matrix, null, 2) + "\n";
    this.fileWriter.write(this.matrixPath, text);
  }
}
