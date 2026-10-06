export type SentSection = "top" | "extra";

export interface SentJobRecord {
  id: number;
  jobId: number;
  dedupeKey: string;
  runId: number;
  sentAt: string;
  rank: number;
  score: number;
  section: SentSection;
}

export interface SentJobRepository {
  recordSent(jobId: number, dedupeKey: string, runId: number, rank: number, score: number, section: SentSection): void;
  hasBeenSent(dedupeKey: string): boolean;
  listSentSince(sinceIso: string): SentJobRecord[];
}
