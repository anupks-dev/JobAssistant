export interface ScoreOnceOptions {
  // Caps how many jobs are scored in one run; null means all of them.
  limit: number | null;
  retryFailed: boolean;
  rescoreOutdated: boolean;
  // Redo letters and tweaks of the top section that were made with an older prompt version.
  regenerateOutputsOutdated: boolean;
  // Applies the skill list cleanup to stored scores of unsent jobs, without any LLM call, and does nothing else.
  cleanSkillLists: boolean;
  // Adds the job URL as the last column of the ranked list.
  urls: boolean;
}

const USAGE: string = "Usage: pnpm score:once [-- [--limit=<positive whole number>] [--retry-failed] [--rescore-outdated] [--regenerate-outputs-outdated] [--clean-skill-lists] [--urls]]";

export class ScoreOnceOptionsParser {
  public parse(argv: string[]): ScoreOnceOptions {
    const options: ScoreOnceOptions = {
      limit: null,
      retryFailed: false,
      rescoreOutdated: false,
      regenerateOutputsOutdated: false,
      cleanSkillLists: false,
      urls: false,
    };
    for (let index: number = 0; index < argv.length; index++) {
      const argument: string = argv[index];
      if (argument === "--") {
        // pnpm passes the separator through when the script is run as "pnpm score:once -- --flag".
        continue;
      }
      if (argument === "--retry-failed") {
        options.retryFailed = true;
      } else if (argument === "--rescore-outdated") {
        options.rescoreOutdated = true;
      } else if (argument === "--regenerate-outputs-outdated") {
        options.regenerateOutputsOutdated = true;
      } else if (argument === "--clean-skill-lists") {
        options.cleanSkillLists = true;
      } else if (argument === "--urls") {
        options.urls = true;
      } else if (argument.startsWith("--limit=")) {
        options.limit = this.parseLimit(argument.slice("--limit=".length));
      } else {
        throw new Error(USAGE);
      }
    }
    return options;
  }

  private parseLimit(text: string): number {
    const parsed: number = Number(text);
    if (text.length === 0 || !Number.isInteger(parsed) || parsed <= 0) {
      throw new Error(USAGE);
    }
    return parsed;
  }
}
