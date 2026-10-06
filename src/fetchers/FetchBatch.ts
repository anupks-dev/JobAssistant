import { Job } from "../models/Job";

export type FetchBatchStatus = "ok" | "error" | "skipped";

export interface FetchBatch {
  sourceId: string;
  catalogSourceId: string;
  status: FetchBatchStatus;
  jobs: Job[];
  note: string | null;
  durationMs: number;
}
