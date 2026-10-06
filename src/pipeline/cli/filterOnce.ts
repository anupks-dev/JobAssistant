import { FilterRunSummary } from "../FilterPipelineRunner";
import { FilterCommand, FilterSession } from "./FilterCommand";
import { FilterSummaryPrinter } from "./FilterSummaryPrinter";

class FilterOnceCommand {
  public run(argv: string[]): void {
    const reevaluate: boolean = this.readReevaluate(argv);
    const command: FilterCommand = new FilterCommand();
    const opened: FilterSession = command.open();
    try {
      const summary: FilterRunSummary = opened.runner.run(reevaluate);
      const printer: FilterSummaryPrinter = new FilterSummaryPrinter();
      const lines: string[] = printer.lines(summary);
      for (let index: number = 0; index < lines.length; index++) {
        console.log(lines[index]);
      }
      command.logger.info({
        evaluated: summary.evaluated,
        shortlisted: summary.shortlisted,
        capped: summary.capped,
        bySource: summary.bySource,
      }, "Filter finished");
    } finally {
      opened.database.close();
    }
  }

  private readReevaluate(argv: string[]): boolean {
    for (let index: number = 0; index < argv.length; index++) {
      if (argv[index] === "--reevaluate") {
        return true;
      }
    }
    return false;
  }

}

const command: FilterOnceCommand = new FilterOnceCommand();
try {
  command.run(process.argv.slice(2));
} catch (error: unknown) {
  const message: string = error instanceof Error ? error.message : "Filter failed.";
  console.error(message);
  process.exit(1);
}
