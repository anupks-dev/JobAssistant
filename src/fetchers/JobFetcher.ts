import { Job } from "../models/Job";
import { FetchBatch } from "./FetchBatch";
import { SourcePolicy } from "./SourcePolicy";

// Every job source implements this interface.
// A failing fetcher must throw an error; the caller catches it so that one broken
// source never stops the whole daily run.
export interface JobFetcher {
  getSourceName(): string;
  getSourceId(): string;
  getPolicy(): SourcePolicy;
  fetchJobs(): Promise<Job[]>;
}

// Sources that record one status per board, or that can stop early, return batches.
export interface BatchJobFetcher extends JobFetcher {
  fetchBatches(): Promise<FetchBatch[]>;
}
