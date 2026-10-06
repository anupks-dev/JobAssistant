// A single job posting, normalized from any source into one common shape.

export type RemoteType = "remote" | "hybrid" | "onsite" | "unknown";

export interface Job {
  source: string;
  externalId: string;
  title: string;
  company: string;
  location: string;
  remoteType: RemoteType;
  salaryMin: number | null;
  salaryMax: number | null;
  currency: string | null;
  salaryKnown: boolean;
  // True when the source says the figure is a prediction, not a posted range.
  salaryIsEstimated: boolean;
  url: string;
  postedAt: Date | null;
  description: string;
  // True when the source only returned a truncated description.
  descriptionIsSnippet: boolean;
}
