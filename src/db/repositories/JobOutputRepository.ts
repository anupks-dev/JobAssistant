export interface JobOutputInput {
  jobId: number;
  runId: number | null;
  // Stored with placeholders such as {{NAME}}, never real personal data.
  coverLetter: string | null;
  // JSON text of the suggestions.
  resumeTweaks: string | null;
  // JSON text mapping prompt name to version.
  promptVersions: string;
  createdAtIso: string;
}

export interface JobOutput {
  id: number;
  jobId: number;
  runId: number | null;
  coverLetter: string | null;
  resumeTweaks: string | null;
  promptVersions: string;
  createdAt: Date;
}

export interface JobOutputRepository {
  save(input: JobOutputInput): void;
  findByJobId(jobId: number): JobOutput | null;
}
