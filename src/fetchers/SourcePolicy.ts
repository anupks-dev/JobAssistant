export interface SourcePolicy {
  enabled: boolean;
  minIntervalMinutes: number;
  maxPages: number;
  requestDelayMs: number;
}
