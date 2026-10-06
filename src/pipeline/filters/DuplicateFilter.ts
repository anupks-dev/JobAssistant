import { StoredJob } from "../../db/repositories/JobRepository";
import { FilterContext } from "../FilterContext";
import { FilterDecision, JobFilter } from "../JobFilter";

const SOURCE_ORDER: string[] = [
  "greenhouse",
  "lever",
  "ashby",
  "remoteok",
  "remotive",
  "weworkremotely",
  "himalayas",
  "arbeitnow",
  "hackernews",
  "adzuna",
];

export class DuplicateFilter implements JobFilter {
  public getName(): string {
    return "DuplicateFilter";
  }

  public evaluate(job: StoredJob, context: FilterContext): FilterDecision {
    if (context.sentJobs.hasBeenSent(job.dedupeKey)) {
      const sent: FilterDecision = { passed: false, reasonCode: "already_sent" };
      return sent;
    }
    if (this.wasRetained(job.dedupeKey, context.retainedDedupeKeys)) {
      const retained: FilterDecision = { passed: false, reasonCode: "duplicate" };
      return retained;
    }
    if (!this.isBestCopy(job, context.competingJobs)) {
      const duplicate: FilterDecision = { passed: false, reasonCode: "duplicate" };
      return duplicate;
    }
    const passed: FilterDecision = { passed: true };
    return passed;
  }

  private wasRetained(dedupeKey: string, retainedKeys: string[]): boolean {
    for (let index: number = 0; index < retainedKeys.length; index++) {
      if (retainedKeys[index] === dedupeKey) {
        return true;
      }
    }
    return false;
  }

  private isBestCopy(job: StoredJob, competingJobs: StoredJob[]): boolean {
    for (let index: number = 0; index < competingJobs.length; index++) {
      const other: StoredJob = competingJobs[index];
      if (other.id === job.id || other.dedupeKey !== job.dedupeKey) {
        continue;
      }
      if (this.isBetter(other, job)) {
        return false;
      }
    }
    return true;
  }

  private isBetter(candidate: StoredJob, current: StoredJob): boolean {
    if (candidate.descriptionIsSnippet !== current.descriptionIsSnippet) {
      return !candidate.descriptionIsSnippet;
    }
    if (candidate.description.length !== current.description.length) {
      return candidate.description.length > current.description.length;
    }
    const candidateRank: number = this.sourceRank(candidate.source);
    const currentRank: number = this.sourceRank(current.source);
    if (candidateRank !== currentRank) {
      return candidateRank < currentRank;
    }
    return candidate.id < current.id;
  }

  private sourceRank(source: string): number {
    for (let index: number = 0; index < SOURCE_ORDER.length; index++) {
      if (SOURCE_ORDER[index] === source) {
        return index;
      }
    }
    return SOURCE_ORDER.length;
  }
}
