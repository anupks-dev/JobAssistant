import { Job } from "../../models/Job";

export type JobStatus = "new" | "rejected" | "shortlisted" | "scored" | "sent";

export interface UpsertJobsResult {
  inserted: number;
  skipped: number;
}

export type RegionEligibility = "open" | "unknown" | "restricted";

export interface FilterSaveResult {
  status: "rejected" | "shortlisted";
  reason: string | null;
  regionEligibility: RegionEligibility | null;
  isBangaloreGcc: boolean;
  salaryUsdMin: number | null;
  salaryUsdMax: number | null;
  notes: string | null;
}

export interface StoredJob extends Job {
  id: number;
  fetchedAt: Date;
  dedupeKey: string;
  status: JobStatus;
  rejectionReason: string | null;
  score: number | null;
  scoreReason: string | null;
  regionEligibility: RegionEligibility | null;
  isBangaloreGcc: boolean;
  salaryUsdMin: number | null;
  salaryUsdMax: number | null;
  filterNotes: string | null;
  scoreDetails: string | null;
}

export interface JobRepository {
  upsertJobs(jobs: Job[], dedupeKeys?: string[]): UpsertJobsResult;
  findByStatus(status: JobStatus, limit: number, source?: string, offset?: number): StoredJob[];
  existsByDedupeKey(dedupeKey: string): boolean;
  existsByExternalId(source: string, externalId: string): boolean;
  updateStatus(jobId: number, status: JobStatus, rejectionReason?: string): void;
  saveScore(jobId: number, score: number, reason: string, details: string): void;
  // Records why a job could not be scored. The job stays shortlisted with no score.
  saveUnscoredNote(jobId: number, details: string): void;
  // Jobs marked unscored_final (too many failed attempts) are skipped unless includeUnscoredFinal is true.
  findShortlistedUnscored(limit: number, includeUnscoredFinal?: boolean): StoredJob[];
  countUnscoredFinal(): number;
  // Scored jobs that were never sent, whatever their score or age. Used to rescore after a prompt change.
  findScoredUnsent(limit: number): StoredJob[];
  findRankingPool(sinceIso: string, minScore: number): StoredJob[];
  findPostedSince(sinceIso: string): StoredJob[];
  purgeOlderThan(days: number): number;
  findById(jobId: number): StoredJob | null;
  saveFilterResult(jobId: number, result: FilterSaveResult): void;
  resetForReevaluation(): void;
  findRejectedByReason(reason: string, limit: number, source?: string, offset?: number): StoredJob[];
}
