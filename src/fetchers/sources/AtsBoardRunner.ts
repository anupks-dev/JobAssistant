import { Job } from "../../models/Job";
import { FetchBatch, FetchBatchStatus } from "../FetchBatch";
import { BoardSlugValidator } from "../parsing/BoardSlugValidator";
import { AtsName, AtsBoardConfig } from "./AtsBoardConfig";
import { AtsCompanyGate } from "./AtsCompanyGate";

export class AtsBoardRunner {
  public constructor(
    private readonly companies: AtsCompanyGate,
    private readonly slugValidator: BoardSlugValidator,
  ) {}

  public async runBoard(
    board: AtsBoardConfig,
    ats: AtsName,
    load: (slug: string) => Promise<Job[]>,
  ): Promise<FetchBatch> {
    const startedAt: number = Date.now();
    const sourceId: string = ats + ":" + board.slug;
    if (!this.slugValidator.isValid(board.slug)) {
      return this.batch(sourceId, ats, "error", [], "Invalid board slug.", startedAt);
    }
    const gate: "ok" | "blocked" = this.companies.save(board.company, ats, board.slug);
    if (gate === "blocked") {
      return this.batch(sourceId, ats, "skipped", [], "blocked", startedAt);
    }
    try {
      const jobs: Job[] = await load(board.slug);
      return this.batch(sourceId, ats, "ok", jobs, null, startedAt);
    } catch (error: unknown) {
      return this.batch(sourceId, ats, "error", [], this.noteFor(error), startedAt);
    }
  }

  private noteFor(error: unknown): string {
    if (!(error instanceof Error)) {
      return "Board request failed.";
    }
    const message: string = error.message;
    if (message.indexOf("http://") >= 0 || message.indexOf("https://") >= 0) {
      return "Board request failed.";
    }
    if (message.indexOf("app_id") >= 0 || message.indexOf("app_key") >= 0) {
      return "Board request failed.";
    }
    if (message.indexOf("contained records") >= 0) {
      return message;
    }
    return "Board request failed.";
  }

  private batch(
    sourceId: string,
    catalogSourceId: string,
    status: FetchBatchStatus,
    jobs: Job[],
    note: string | null,
    startedAt: number,
  ): FetchBatch {
    const batch: FetchBatch = {
      sourceId: sourceId,
      catalogSourceId: catalogSourceId,
      status: status,
      jobs: jobs,
      note: note,
      durationMs: Date.now() - startedAt,
    };
    return batch;
  }
}
