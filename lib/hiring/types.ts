/**
 * Hiring module ("Pontifex Industries Job Board") — shared types & constants.
 * Plan: docs/plans/HIRELINE_MODULE_PLAN.md
 * Schema: supabase/migrations/20260703_hiring_module.sql
 *
 * This file is the contract between the API layer (app/api/hiring/*), the
 * admin UI (app/dashboard/hiring/*), and the public surfaces (app/apply/*,
 * app/jobs/*). Builders: import from here, don't redeclare.
 */

export const AD_CHANNELS = ['facebook', 'instagram', 'tiktok'] as const;
export type AdChannel = (typeof AD_CHANNELS)[number];

export const HIRING_JOB_STATUSES = ['draft', 'active', 'paused', 'closed'] as const;
export type HiringJobStatus = (typeof HIRING_JOB_STATUSES)[number];

export const CANDIDATE_STATUSES = ['unreviewed', 'shortlisted', 'rejected'] as const;
export type CandidateStatus = (typeof CANDIDATE_STATUSES)[number];

export const SCREENER_TYPES = ['free_response', 'single_choice'] as const;
export type ScreenerType = (typeof SCREENER_TYPES)[number];

/** Roles allowed to manage hiring (mirrors RLS policies in the migration). */
export const HIRING_ADMIN_ROLES = ['admin', 'super_admin', 'operations_manager'];

/** The front-door tenant for the job-board product Opifex (company code OPIFEX). */
export const HIRE_TENANT_ID = '32d26561-0b88-4b4f-b879-ec0b33b033ea';
export const HIRE_COMPANY_CODE = 'OPIFEX'; // Opifex — the Latin -fex family: Pontifex, Artifex, Opifex

/**
 * ⚖️ ADEA LEGAL GUARDRAIL — age-based screening is prohibited.
 * The screener generator and any manual question save MUST run through
 * containsProhibitedScreenerContent(). Capability/eligibility questions
 * (18+ floor, essential job functions) are the lawful equivalents —
 * see docs/plans/HIRELINE_MODULE_PLAN.md §2.2.
 */
const PROHIBITED_PATTERNS: RegExp[] = [
  /\bhow old\b/i,
  /\byour age\b/i,
  /\bwhat(?:'s| is) your age\b/i,
  /\bdate of birth\b/i,
  /\bbirth ?date\b/i,
  /\bbirth ?year\b/i,
  /\byear (?:were you|you were) born\b/i,
  /\bdob\b/i,
  /\bage range\b/i,
  /\bover (?:4[0-9]|[5-9][0-9])\b/i, // "over 40/50/..." style ceilings
  /\bunder (?:4[0-9]|[5-9][0-9])\b/i,
];

/** "Are you 18 or older?" is the ONE lawful age floor — explicitly allowed. */
const ALLOWED_PATTERNS: RegExp[] = [
  /\b(?:18|eighteen)\s*(?:years?\s*(?:old|of age))?\s*or\s*older\b/i,
  /\bat least (?:18|eighteen)\b/i,
  /\blegally authorized to work\b/i,
];

export function containsProhibitedScreenerContent(text: string): boolean {
  if (ALLOWED_PATTERNS.some((p) => p.test(text))) return false;
  return PROHIBITED_PATTERNS.some((p) => p.test(text));
}

// ---------------------------------------------------------------------------
// Row shapes (match the migration exactly)
// ---------------------------------------------------------------------------

export interface HiringJob {
  id: string;
  tenant_id: string;
  title: string;
  description: string;
  location: string | null;
  status: HiringJobStatus;
  slug: string;
  pay_min: number | null;
  pay_max: number | null;
  pay_period: 'hour' | 'year' | 'week' | 'day' | 'project' | null;
  schedule_text: string | null;
  requirements: string[];
  benefits: string[];
  ad_headline: string | null;
  ad_primary_text: string | null;
  ad_tiktok_caption: string | null;
  ad_bullets: string[];
  generation_instructions: string | null;
  target_areas: string[];
  channels: AdChannel[];
  language: string;
  parent_job_id: string | null;
  daily_budget: number | null;
  impressions: number;
  clicks: number;
  total_spend: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface HiringScreenerQuestion {
  id: string;
  tenant_id: string;
  job_id: string;
  position: number;
  question: string;
  qtype: ScreenerType;
  options: string[];
  auto_reject: boolean;
  auto_reject_answers: string[];
  required: boolean;
  is_followup: boolean;
}

export interface HiringCandidate {
  id: string;
  tenant_id: string;
  job_id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  status: CandidateStatus;
  auto_rejected: boolean;
  resume_url: string | null;
  candidate_location: string | null;
  language: string;
  source: string;
  applied_at: string;
}

export interface HiringCandidateResponse {
  id: string;
  candidate_id: string;
  question_id: string | null;
  question_text: string;
  answer: string;
}

export interface HiringComment {
  id: string;
  candidate_id: string;
  author_id: string | null;
  author_name?: string;
  body: string;
  created_at: string;
}

export interface HiringEvent {
  id: string;
  job_id: string | null;
  candidate_id: string | null;
  event_type: string;
  meta: Record<string, unknown>;
  created_at: string;
}

export const PUBLISH_REQUEST_STATUSES = ['pending', 'approved', 'rejected', 'published'] as const;
export type PublishRequestStatus = (typeof PUBLISH_REQUEST_STATUSES)[number];

/** Row shape for hiring_publish_requests (20260703c migration). */
export interface HiringPublishRequest {
  id: string;
  tenant_id: string;
  job_id: string;
  status: PublishRequestStatus;
  requested_by: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  channels: AdChannel[];
  daily_budget: number | null;
  created_at: string;
  updated_at: string;
}

export interface HiringBilling {
  tenant_id: string;
  stripe_customer_id: string | null;
  default_payment_method: string | null;
  threshold: number;
  lifetime_billed: number;
  balance_owed: number;
  ad_spend_markup: number;
}

// ---------------------------------------------------------------------------
// API contract (all routes require Authorization: Bearer <token> unless PUBLIC)
// ---------------------------------------------------------------------------
// GET    /api/hiring/jobs                     -> { success, data: { jobs: HiringJob[] } }
// POST   /api/hiring/jobs                     -> body { title, description, location?, language? } -> { success, data: { job } }
// GET    /api/hiring/jobs/[id]                -> { success, data: { job, screeners, stats } }
// PATCH  /api/hiring/jobs/[id]                -> partial job fields -> { success, data: { job } }
// POST   /api/hiring/jobs/[id]/generate       -> AI (re)generates ad kit + suggested screeners -> { success, data: { job, screeners } }
// POST   /api/hiring/jobs/[id]/translate      -> body { language } -> creates linked variant job -> { success, data: { job } }
// POST   /api/hiring/jobs/[id]/duplicate      -> { success, data: { job } }
// PUT    /api/hiring/jobs/[id]/screeners      -> body { screeners: [...] } (validates ADEA blocklist) -> { success, data: { screeners } }
// GET    /api/hiring/jobs/[id]/candidates     -> { success, data: { candidates } }
// GET    /api/hiring/jobs/[id]/export         -> CSV download
// GET    /api/hiring/candidates/[id]          -> { success, data: { candidate, responses, events, comments } }
// PATCH  /api/hiring/candidates/[id]          -> body { status } -> { success, data: { candidate } }
// POST   /api/hiring/candidates/[id]/comments -> body { body } -> { success, data: { comment } }
// PUBLIC GET  /api/hiring/public/jobs/[slug]  -> { success, data: { job: PublicJob, screeners } } (active jobs only)
// PUBLIC POST /api/hiring/public/apply        -> body { slug, full_name, phone, email, answers: [{question_id, answer}] }
//                                             -> evaluates auto-reject server-side -> { success, data: { candidateId } }
//                                                (NEVER return autoRejected publicly - it is an oracle for the
//                                                 disqualifying answers; guardian finding Jul 3)
// PUBLIC POST /api/hiring/public/signup       -> body { company_name, contact_name, email } -> creates hiring-only tenant + setup email
// GET    /api/hiring/publish-requests          -> SUPER_ADMIN. ?status= filter. { success, data: { requests: [{ ...req, tenant_name, job }] } }
// GET    /api/hiring/publish-requests/mine     -> ?jobId= (tenant-scoped) -> { success, data: { request: HiringPublishRequest | null } }
// PATCH  /api/hiring/publish-requests/[id]     -> SUPER_ADMIN. body { action: 'approve'|'reject'|'mark_published', note? }
//                                              -> reject requires note + pauses the job; { success, data: { request } }
