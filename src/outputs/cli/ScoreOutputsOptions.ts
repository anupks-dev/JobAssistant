export interface ScoreOutputsOptions {
  jobId: number;
}

const USAGE: string = "Usage: pnpm score:outputs -- --job=<job id>";

export class ScoreOutputsOptionsParser {
  public parse(argv: string[]): ScoreOutputsOptions {
    let jobId: number | null = null;
    for (let index: number = 0; index < argv.length; index++) {
      const argument: string = argv[index];
      if (argument === "--") {
        // pnpm passes the separator through when the script is run as "pnpm score:outputs -- --job=1".
        continue;
      }
      if (!argument.startsWith("--job=")) {
        throw new Error(USAGE);
      }
      jobId = this.parseJobId(argument.slice("--job=".length));
    }
    if (jobId === null) {
      throw new Error(USAGE);
    }
    const options: ScoreOutputsOptions = { jobId: jobId };
    return options;
  }

  private parseJobId(text: string): number {
    const parsed: number = Number(text);
    if (text.length === 0 || !Number.isInteger(parsed) || parsed <= 0) {
      throw new Error(USAGE);
    }
    return parsed;
  }
}
