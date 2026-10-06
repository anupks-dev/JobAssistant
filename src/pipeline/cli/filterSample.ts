import { StoredJob } from "../../db/repositories/JobRepository";
import { FilterSampleFormatter } from "../FilterSampleFormatter";
import { FilterCommand, FilterSession } from "./FilterCommand";
import { FilterSampleQuery, FilterSampleQueryReader } from "./FilterSampleQuery";

class FilterSampleCommand {
  public constructor(private readonly reader: FilterSampleQueryReader) {}

  public run(argv: string[]): void {
    const query: FilterSampleQuery = this.reader.read(argv);
    const command: FilterCommand = new FilterCommand();
    const opened: FilterSession = command.open();
    try {
      const jobs: StoredJob[] = this.load(opened, query);
      const formatter: FilterSampleFormatter = new FilterSampleFormatter();
      for (let index: number = 0; index < jobs.length; index++) {
        const job: StoredJob = jobs[index];
        const notes: string = job.filterNotes === null ? "" : job.filterNotes;
        console.log(formatter.format(job.id, job.source, job.company, job.title, job.location, notes));
      }
      command.logger.info({ count: jobs.length }, "Filter sample finished");
    } finally {
      opened.database.close();
    }
  }

  private load(opened: FilterSession, query: FilterSampleQuery): StoredJob[] {
    const source: string | undefined = query.source === null ? undefined : query.source;
    if (query.shortlisted) {
      return opened.factory.jobs().findByStatus("shortlisted", query.limit, source, query.offset);
    }
    return opened.factory.jobs().findRejectedByReason(query.reason ?? "", query.limit, source, query.offset);
  }
}

const command: FilterSampleCommand = new FilterSampleCommand(new FilterSampleQueryReader());
try {
  command.run(process.argv.slice(2));
} catch (error: unknown) {
  const message: string = error instanceof Error ? error.message : "Filter sample failed.";
  console.error(message);
  process.exit(1);
}
