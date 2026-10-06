import { JobOutput } from "../../db/repositories/JobOutputRepository";
import { StoredJob } from "../../db/repositories/JobRepository";
import { SourceCatalog, SourceDefinition } from "../../fetchers/SourceCatalog";
import { ScoreDetails } from "../ScoreDetails";
import { ScoreDetailPrinter } from "./ScoreDetailPrinter";
import { ScoringCommand, ScoringSession } from "./ScoringCommand";

// Shows the stored score of one job. Needs no LLM and no profile files.
class ScoreShowCommand {
  public run(argv: string[]): void {
    const jobId: number = this.readJobId(argv);
    const command: ScoringCommand = new ScoringCommand();
    const database: ReturnType<ScoringCommand["openDatabase"]> = command.openDatabase();
    try {
      const session: ScoringSession = command.openSession(command.loadConfig(), database);
      const job: StoredJob | null = session.factory.jobs().findById(jobId);
      if (job === null) {
        throw new Error("No job with id " + String(jobId) + ".");
      }
      const details: ScoreDetails | null = session.codec.parse(job.scoreDetails);
      const output: JobOutput | null = session.factory.jobOutputs().findByJobId(job.id);
      const lines: string[] = new ScoreDetailPrinter().lines(job, this.sourceName(job.source), details, output);
      for (let index: number = 0; index < lines.length; index++) {
        console.log(lines[index]);
      }
    } finally {
      database.close();
    }
  }

  // Falls back to the raw source id for a source the catalog no longer knows.
  private sourceName(sourceId: string): string {
    const definition: SourceDefinition | null = new SourceCatalog().findById(sourceId);
    return definition === null ? sourceId : definition.displayName;
  }

  private readJobId(argv: string[]): number {
    const parsed: number = Number(argv[0]);
    if (argv.length === 0 || !Number.isInteger(parsed) || parsed <= 0) {
      throw new Error("Usage: pnpm score:show <jobId>");
    }
    return parsed;
  }
}

try {
  new ScoreShowCommand().run(process.argv.slice(2));
} catch (error: unknown) {
  const message: string = error instanceof Error ? error.message : "Score show failed.";
  console.error(message);
  process.exit(1);
}
