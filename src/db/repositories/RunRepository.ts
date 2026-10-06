export type RunTrigger = "scheduled" | "manual";

export type RunStatus = "running" | "success" | "partial" | "failed";

export type FinishedRunStatus = "success" | "partial" | "failed";

export type SourceStatus = "ok" | "error" | "skipped";

export interface RunCounts {
  fetchedCount: number;
  filteredCount: number;
  shortlistedCount: number;
  sentCount: number;
}

export interface SourceStatusRecord {
  source: string;
  status: SourceStatus;
  jobCount: number;
  errorMessage: string | null;
  durationMs: number;
}

export interface RunRecord {
  id: number;
  startedAt: string;
  finishedAt: string | null;
  status: RunStatus;
  trigger: RunTrigger;
  fetchedCount: number;
  filteredCount: number;
  shortlistedCount: number;
  sentCount: number;
  notes: string | null;
  sourceStatuses: SourceStatusRecord[];
}

export interface RunRepository {
  startRun(trigger: RunTrigger): number;
  finishRun(runId: number, status: FinishedRunStatus, counts: RunCounts, notes?: string): void;
  addSourceStatus(runId: number, record: SourceStatusRecord): void;
  getLastRun(): RunRecord | null;
}
