import { FilterStep } from "../JobFilter";
import { JobExplanation } from "../FilterPipelineRunner";
import { FilterCommand, FilterSession } from "./FilterCommand";

class FilterExplainCommand {
  public run(argv: string[]): void {
    const jobId: number | null = this.readJobId(argv);
    if (jobId === null) {
      throw new Error("Provide a job id.");
    }
    const command: FilterCommand = new FilterCommand();
    const opened: FilterSession = command.open();
    try {
      const explanation: JobExplanation | null = opened.runner.explain(jobId);
      if (explanation === null) {
        throw new Error("Job not found.");
      }
      this.printExplanation(explanation);
      command.logger.info({ jobId: jobId }, "Filter explain finished");
    } finally {
      opened.database.close();
    }
  }

  private readJobId(argv: string[]): number | null {
    for (let index: number = 0; index < argv.length; index++) {
      const argument: string = argv[index];
      if (argument.indexOf("-") === 0) {
        continue;
      }
      const parsed: number = Number(argument);
      if (Number.isFinite(parsed) && parsed > 0) {
        return Math.floor(parsed);
      }
    }
    return null;
  }

  private printExplanation(explanation: JobExplanation): void {
    for (let index: number = 0; index < explanation.steps.length; index++) {
      const step: FilterStep = explanation.steps[index];
      if (step.passed) {
        console.log(step.name + " passed");
      } else {
        console.log(step.name + " rejected " + (step.reasonCode ?? ""));
      }
    }
    console.log("stored_reason=" + (explanation.storedReason ?? ""));
    console.log("stored_notes=" + (explanation.storedNotes ?? ""));
  }
}

const command: FilterExplainCommand = new FilterExplainCommand();
try {
  command.run(process.argv.slice(2));
} catch (error: unknown) {
  const message: string = error instanceof Error ? error.message : "Filter explain failed.";
  console.error(message);
  process.exit(1);
}
