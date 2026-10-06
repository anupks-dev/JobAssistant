export interface SchemaMigrationRow {
  version: number;
  applied_at: string;
}

export interface JobRow {
  id: number;
  source: string;
  external_id: string;
  title: string;
  company: string;
  location: string;
  remote_type: string;
  salary_min: number | null;
  salary_max: number | null;
  currency: string | null;
  salary_known: number;
  salary_is_estimated: number;
  url: string;
  posted_at: string | null;
  fetched_at: string;
  description: string;
  description_is_snippet: number;
  dedupe_key: string;
  status: string;
  rejection_reason: string | null;
  score: number | null;
  score_reason: string | null;
  region_eligibility: string | null;
  is_bangalore_gcc: number;
  salary_usd_min: number | null;
  salary_usd_max: number | null;
  filter_notes: string | null;
  score_details: string | null;
}

export interface SentJobRow {
  id: number;
  job_id: number;
  dedupe_key: string;
  run_id: number;
  sent_at: string;
  rank: number;
  score: number;
  section: string;
}

export interface CompanyRow {
  id: number;
  name: string;
  name_key: string;
  is_gcc: number;
  is_preferred: number;
  is_blocked: number;
  ats_type: string | null;
  board_slug: string | null;
  first_seen_at: string;
}

export interface RunRow {
  id: number;
  started_at: string;
  finished_at: string | null;
  status: string;
  trigger: string;
  fetched_count: number;
  filtered_count: number;
  shortlisted_count: number;
  sent_count: number;
  notes: string | null;
}

export interface RunSourceStatusRow {
  id: number;
  run_id: number;
  source: string;
  status: string;
  job_count: number;
  error_message: string | null;
  duration_ms: number;
}

export interface ConfigHistoryRow {
  id: number;
  changed_at: string;
  changed_by: string;
  key: string;
  old_value: string | null;
  new_value: string;
}

export interface AppStateRow {
  key: string;
  value: string;
  updated_at: string;
}

export interface ApiUsageRow {
  source: string;
  day: string;
  call_count: number;
}

export interface JobOutputRow {
  id: number;
  job_id: number;
  run_id: number | null;
  cover_letter: string | null;
  resume_tweaks: string | null;
  prompt_versions: string;
  created_at: string;
}
