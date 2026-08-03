/**
 * lib/operator-rating.ts — THE canonical composite operator rating.
 *
 * An operator is graded by three independent audiences, each writing to its own
 * table:
 *
 *   1. supervisor_visits   — performance / safety / cleanliness (1-5 each)
 *   2. customer_surveys    — overall / communication / cleanliness (1-5 each)
 *   3. job_helper_reviews  — a single rating (1-5) from the helper on the crew
 *
 * This module turns those into ONE number plus the breakdown that explains it.
 * It is pure (no I/O, no Supabase, no `Date.now()` unless you let it) so the
 * weighting can be unit-tested and tuned without touching a route.
 *
 * ── Design rules (why it looks like this) ──────────────────────────────────
 *
 * • AVERAGE WITHIN A SOURCE FIRST, THEN ACROSS SOURCES.
 *   `cleanliness_rating` exists on BOTH supervisor_visits and customer_surveys.
 *   If every dimension were dumped into one pool, cleanliness would count twice
 *   and a source with more columns would silently out-vote a source with one.
 *   Instead each review collapses to its own mean, each source collapses to the
 *   mean of its reviews, and only then are the (at most three) source scores
 *   combined by the weights below. Cleanliness therefore influences the
 *   supervisor score and the customer score — never the same score twice.
 *
 * • MISSING SOURCES DON'T PENALISE. Source weights are renormalised over the
 *   sources that actually have data. An operator with only supervisor visits
 *   gets a composite equal to their supervisor score, not a score dragged to
 *   zero by two empty tables.
 *
 * • NO REVIEWS → `null`, NEVER `0`. "Not yet graded" and "graded badly" are
 *   different facts and the UI must be able to tell them apart.
 *
 * • RECENCY: exponential half-life decay. A review's weight halves every
 *   RECENCY_HALF_LIFE_DAYS, floored at MIN_RECENCY_WEIGHT so history never
 *   disappears entirely. Chosen over "last N reviews" (cliff-edge, gameable)
 *   and over linear decay (goes negative / needs clamping anyway). Undated
 *   reviews get full weight rather than being dropped.
 *
 * • `likely_to_use_again_rating` (customer, 1-10 NPS-style) is deliberately
 *   EXCLUDED — mixing a 1-10 scale into a 1-5 mean silently inflates it.
 *   Surface it separately if the founder wants it.
 *
 * Tune the constants below; do not fork the algorithm.
 */

// ── Tunables ────────────────────────────────────────────────────────────────

export type RatingSourceKey = 'supervisor' | 'customer' | 'helper';

/**
 * Relative importance of each audience, BEFORE renormalisation over the
 * sources that have data.
 *   supervisor 0.50 — trained management observing the work in person.
 *   customer   0.30 — the client's experience; directly revenue-relevant.
 *   helper     0.20 — peer signal; smallest sample and the most bias-prone.
 */
export const SOURCE_WEIGHTS: Record<RatingSourceKey, number> = {
  supervisor: 0.5,
  customer: 0.3,
  helper: 0.2,
};

/** A review's weight halves every this many days. */
export const RECENCY_HALF_LIFE_DAYS = 180;

/** Floor on recency weight so old reviews still count for something. */
export const MIN_RECENCY_WEIGHT = 0.1;

/**
 * Minimum number of reviews before a headline score is published at all.
 *
 * Why this exists: because source weights RENORMALISE over the sources that
 * have data, a single review from the LEAST-trusted source becomes 100% of the
 * number. One 1-star helper review would otherwise render as an authoritative
 * "1.00 — Needs focus" standing. With supervisor_visits at 1 row and
 * job_helper_reviews at 0 rows in production, the first person graded would be
 * judged off a single walkthrough.
 *
 * Below this threshold (or when only ONE source has data) the result is marked
 * `provisional` and `composite` is withheld (null) — the individual reviews
 * still show, but no headline score. Change these two constants to retune.
 */
export const MIN_REVIEWS_FOR_COMPOSITE = 3;
/** Require corroboration from more than one audience before publishing a score. */
export const REQUIRE_MULTIPLE_SOURCES = true;

export const SOURCE_LABELS: Record<RatingSourceKey, string> = {
  supervisor: 'Supervisor visits',
  customer: 'Customer surveys',
  helper: 'Helper feedback',
};

// ── Input shapes (match the DB columns 1:1 so routes can pass rows straight in) ──

export interface SupervisorVisitRating {
  performance_rating?: number | null;
  safety_rating?: number | null;
  cleanliness_rating?: number | null;
  /** bare 'YYYY-MM-DD' date column */
  visit_date?: string | null;
  created_at?: string | null;
}

export interface CustomerSurveyRating {
  overall_rating?: number | null;
  communication_rating?: number | null;
  cleanliness_rating?: number | null;
  submitted_at?: string | null;
}

export interface HelperReviewRating {
  rating?: number | null;
  created_at?: string | null;
}

export interface OperatorRatingInput {
  supervisorVisits?: SupervisorVisitRating[] | null;
  customerSurveys?: CustomerSurveyRating[] | null;
  helperReviews?: HelperReviewRating[] | null;
  /** "Now" for recency weighting. Injectable so tests are deterministic. */
  now?: Date | number;
}

// ── Output shapes ───────────────────────────────────────────────────────────

export interface DimensionSummary {
  /** stable machine key, e.g. 'supervisor.safety' */
  key: string;
  label: string;
  source: RatingSourceKey;
  /** unweighted 1-5 mean across every review that scored this dimension */
  average: number;
  count: number;
}

export interface SourceSummary {
  key: RatingSourceKey;
  label: string;
  /** number of reviews from this source that carried at least one score */
  count: number;
  /** recency-weighted 1-5 mean, or null when this source has no scores */
  average: number | null;
  /** share of the composite this source actually contributed (0-1, sums to 1) */
  weight: number;
  dimensions: DimensionSummary[];
}

export interface OperatorRatingResult {
  /**
   * The PUBLISHABLE headline score, 1-5 at 2dp.
   *
   * null when nobody has graded this person yet OR when the sample is too thin
   * to publish (see `provisional`). Deliberately fail-safe: a consumer that
   * naively renders `composite` can never show an authoritative-looking score
   * built from one review. Use `rawComposite` if you need the number anyway.
   */
  composite: number | null;
  /** The computed score regardless of sample size — for tuning + diagnostics. */
  rawComposite: number | null;
  /** True when there is a score but the sample is too thin to publish it. */
  provisional: boolean;
  /** Why it's provisional, for UI copy. null when it isn't. */
  provisionalReason: 'insufficient_reviews' | 'single_source' | null;
  /** total scored reviews across all sources */
  totalReviews: number;
  sources: Record<RatingSourceKey, SourceSummary>;
  /** highest-scoring dimension (what's carrying the score), null when ungraded */
  strongest: DimensionSummary | null;
  /** lowest-scoring dimension (what's dragging it down), null when ungraded */
  weakest: DimensionSummary | null;
  /** ISO timestamp / YMD of the most recent scored review, null when ungraded */
  lastReviewedAt: string | null;
}

// ── Internals ───────────────────────────────────────────────────────────────

const DAY_MS = 86_400_000;
const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

/** A valid grade is a finite number in [1,5]. Anything else is "not scored". */
function score(v: unknown): number | null {
  const n = typeof v === 'string' ? Number(v) : v;
  if (typeof n !== 'number' || !Number.isFinite(n)) return null;
  if (n < 1 || n > 5) return null;
  return n;
}

/**
 * Parse a review timestamp to epoch ms.
 * Bare 'YYYY-MM-DD' is parsed as LOCAL midnight (see CLAUDE.md — `new Date('…')`
 * on a bare date is UTC and lands on the previous day in US timezones).
 * Returns null for missing/unparseable values; callers treat that as "undated".
 */
function toTime(value: string | null | undefined): number | null {
  if (!value) return null;
  if (YMD_RE.test(value)) {
    const [y, m, d] = value.split('-').map(Number);
    return new Date(y, m - 1, d).getTime();
  }
  const t = Date.parse(value);
  return Number.isFinite(t) ? t : null;
}

/** Exponential half-life decay, floored. Undated (null) reviews get full weight. */
function recencyWeight(reviewTime: number | null, nowMs: number): number {
  if (reviewTime === null) return 1;
  const ageDays = (nowMs - reviewTime) / DAY_MS;
  if (!Number.isFinite(ageDays) || ageDays <= 0) return 1; // today / future-dated
  const w = Math.pow(0.5, ageDays / RECENCY_HALF_LIFE_DAYS);
  return Math.max(MIN_RECENCY_WEIGHT, w);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Weights are rendered as percentages, so keep a third digit (0.625, not 0.63). */
function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/** One review reduced to a single score plus its recency weight + timestamp. */
interface ScoredReview {
  value: number;
  weight: number;
  time: number | null;
  raw: string | null;
}

interface DimAccumulator {
  key: string;
  label: string;
  sum: number;
  count: number;
}

function bumpDim(
  acc: Map<string, DimAccumulator>,
  key: string,
  label: string,
  value: number | null
) {
  if (value === null) return;
  const cur = acc.get(key) ?? { key, label, sum: 0, count: 0 };
  cur.sum += value;
  cur.count += 1;
  acc.set(key, cur);
}

function buildSource(
  key: RatingSourceKey,
  reviews: ScoredReview[],
  dims: Map<string, DimAccumulator>
): SourceSummary {
  const weightSum = reviews.reduce((a, r) => a + r.weight, 0);
  const average =
    reviews.length > 0 && weightSum > 0
      ? round2(reviews.reduce((a, r) => a + r.value * r.weight, 0) / weightSum)
      : null;

  return {
    key,
    label: SOURCE_LABELS[key],
    count: reviews.length,
    average,
    weight: 0, // filled in once we know which sources are present
    dimensions: [...dims.values()].map((d) => ({
      key: d.key,
      label: d.label,
      source: key,
      average: round2(d.sum / d.count),
      count: d.count,
    })),
  };
}

// ── The one public entry point ──────────────────────────────────────────────

/**
 * Compute an operator's composite standing from every grading source.
 * Pure: same input → same output. Pass `now` to pin recency weighting.
 */
export function computeOperatorRating(input: OperatorRatingInput): OperatorRatingResult {
  const nowMs =
    input.now instanceof Date ? input.now.getTime() : typeof input.now === 'number' ? input.now : Date.now();

  // ── 1. Supervisor visits: mean of performance/safety/cleanliness per visit ──
  const supReviews: ScoredReview[] = [];
  const supDims = new Map<string, DimAccumulator>();
  for (const v of input.supervisorVisits ?? []) {
    if (!v) continue;
    const perf = score(v.performance_rating);
    const safety = score(v.safety_rating);
    const clean = score(v.cleanliness_rating);
    bumpDim(supDims, 'supervisor.performance', 'Performance', perf);
    bumpDim(supDims, 'supervisor.safety', 'Safety', safety);
    bumpDim(supDims, 'supervisor.cleanliness', 'Cleanliness (supervisor)', clean);

    const parts = [perf, safety, clean].filter((n): n is number => n !== null);
    if (parts.length === 0) continue; // a visit with no ratings is not a grade
    const raw = v.visit_date ?? v.created_at ?? null;
    const time = toTime(raw);
    supReviews.push({
      value: parts.reduce((a, b) => a + b, 0) / parts.length,
      weight: recencyWeight(time, nowMs),
      time,
      raw,
    });
  }

  // ── 2. Customer surveys: mean of overall/communication/cleanliness ─────────
  const custReviews: ScoredReview[] = [];
  const custDims = new Map<string, DimAccumulator>();
  for (const s of input.customerSurveys ?? []) {
    if (!s) continue;
    const overall = score(s.overall_rating);
    const comm = score(s.communication_rating);
    const clean = score(s.cleanliness_rating);
    bumpDim(custDims, 'customer.overall', 'Overall', overall);
    bumpDim(custDims, 'customer.communication', 'Communication', comm);
    bumpDim(custDims, 'customer.cleanliness', 'Cleanliness (customer)', clean);

    const parts = [overall, comm, clean].filter((n): n is number => n !== null);
    if (parts.length === 0) continue;
    const raw = s.submitted_at ?? null;
    const time = toTime(raw);
    custReviews.push({
      value: parts.reduce((a, b) => a + b, 0) / parts.length,
      weight: recencyWeight(time, nowMs),
      time,
      raw,
    });
  }

  // ── 3. Helper reviews: a single 1-5 rating ────────────────────────────────
  const helpReviews: ScoredReview[] = [];
  const helpDims = new Map<string, DimAccumulator>();
  for (const r of input.helperReviews ?? []) {
    if (!r) continue;
    const rating = score(r.rating);
    bumpDim(helpDims, 'helper.rating', 'Crew feedback', rating);
    if (rating === null) continue;
    const raw = r.created_at ?? null;
    const time = toTime(raw);
    helpReviews.push({ value: rating, weight: recencyWeight(time, nowMs), time, raw });
  }

  const sources: Record<RatingSourceKey, SourceSummary> = {
    supervisor: buildSource('supervisor', supReviews, supDims),
    customer: buildSource('customer', custReviews, custDims),
    helper: buildSource('helper', helpReviews, helpDims),
  };

  // ── 4. Combine across the sources that actually have data ─────────────────
  const present = (Object.keys(sources) as RatingSourceKey[]).filter(
    (k) => sources[k].average !== null
  );
  const weightTotal = present.reduce((a, k) => a + SOURCE_WEIGHTS[k], 0);

  let rawComposite: number | null = null;
  if (present.length > 0 && weightTotal > 0) {
    let acc = 0;
    for (const k of present) {
      const share = SOURCE_WEIGHTS[k] / weightTotal;
      sources[k].weight = round3(share);
      acc += (sources[k].average as number) * share;
    }
    rawComposite = round2(acc);
  }

  const allDims = present.flatMap((k) => sources[k].dimensions);
  const sortedDims = [...allDims].sort((a, b) => a.average - b.average || a.key.localeCompare(b.key));

  const allReviews = [...supReviews, ...custReviews, ...helpReviews];
  const dated = allReviews.filter((r) => r.time !== null);
  const lastReviewedAt = dated.length
    ? dated.reduce((best, r) => ((r.time as number) > (best.time as number) ? r : best)).raw
    : null;

  // Withhold the headline score until the sample can support one.
  let provisionalReason: OperatorRatingResult['provisionalReason'] = null;
  if (rawComposite !== null) {
    if (allReviews.length < MIN_REVIEWS_FOR_COMPOSITE) provisionalReason = 'insufficient_reviews';
    else if (REQUIRE_MULTIPLE_SOURCES && present.length < 2) provisionalReason = 'single_source';
  }
  const provisional = provisionalReason !== null;

  return {
    composite: provisional ? null : rawComposite,
    rawComposite,
    provisional,
    provisionalReason,
    totalReviews: allReviews.length,
    sources,
    strongest: sortedDims.length ? sortedDims[sortedDims.length - 1] : null,
    weakest: sortedDims.length ? sortedDims[0] : null,
    lastReviewedAt,
  };
}

/**
 * Plain-English band for a composite score. Deliberately constructive wording —
 * operators read this about themselves.
 */
export function ratingBand(composite: number | null): {
  key: 'none' | 'needs_focus' | 'developing' | 'solid' | 'strong';
  label: string;
} {
  if (composite === null) return { key: 'none', label: 'Not yet graded' };
  if (composite < 2.5) return { key: 'needs_focus', label: 'Needs focus' };
  if (composite < 3.5) return { key: 'developing', label: 'Developing' };
  if (composite < 4.5) return { key: 'solid', label: 'Solid' };
  return { key: 'strong', label: 'Strong' };
}
