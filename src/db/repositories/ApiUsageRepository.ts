export interface ApiUsageRepository {
  increment(source: string, dayIso: string): void;
  getDayCount(source: string, dayIso: string): number;
  getMonthCount(source: string, monthPrefix: string): number;
}
