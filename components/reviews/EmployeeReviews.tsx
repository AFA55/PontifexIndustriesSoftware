'use client';

/**
 * EmployeeReviews — the single review-history surface, rendered in two places:
 *
 *   variant="self"        → "My Reviews" on /dashboard/my-profile. The operator
 *                           sees their own grades so they know where they stand
 *                           and where they fell short. Wording is deliberately
 *                           constructive — this is feedback, not a punishment.
 *   variant="management"  → "Previous Reviews" on the employee record, for the
 *                           office and for salespeople.
 *
 * Both read GET /api/employee-reviews/[id], which enforces who may see whose
 * reviews server-side. If the caller isn't allowed, this renders nothing.
 *
 * Every entry is LABELLED BY SOURCE (supervisor walkthrough / customer survey /
 * crew feedback) so a customer's opinion is never mistaken for a supervisor's
 * grade — they are weighted differently in the composite for exactly that reason.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  Star, ClipboardCheck, MessageSquare, HardHat, AlertTriangle, Flag,
  TrendingUp, Target, Loader2, Award, ChevronDown,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { ratingBand, type OperatorRatingResult } from '@/lib/operator-rating';

// ── Types mirroring /api/employee-reviews/[id] ──────────────────────────────

interface SupervisorItem {
  id: string; source: 'supervisor'; visitDate: string; supervisorName: string | null;
  jobOrderId: string | null; jobNumber: string | null; customer: string | null;
  performance: number | null; safety: number | null; cleanliness: number | null;
  average: number | null; observations: string | null; issuesFlagged: string | null;
  followUpRequired: boolean; followUpNotes: string | null;
}
interface CustomerItem {
  id: string; source: 'customer'; submittedAt: string | null;
  overall: number | null; communication: number | null; cleanliness: number | null;
  average: number | null; wouldRecommend: boolean | null; feedback: string | null;
  operatorNotes: string | null; jobNumber?: string | null; customer?: string | null;
}
interface HelperItem {
  id: string; source: 'helper'; createdAt: string | null; rating: number | null;
  comment: string | null; reviewer: string; jobNumber?: string | null; customer?: string | null;
}

interface ReviewsPayload {
  employee: { id: string; name: string | null; role: string | null };
  viewer: { isSelf: boolean; role: string };
  rating: OperatorRatingResult;
  supervisorVisits: SupervisorItem[];
  customerSurveys: CustomerItem[];
  helperReviews: HelperItem[];
}

type TimelineItem =
  | { key: string; time: number; kind: 'supervisor'; item: SupervisorItem }
  | { key: string; time: number; kind: 'customer'; item: CustomerItem }
  | { key: string; time: number; kind: 'helper'; item: HelperItem };

// ── Date helpers (bare YYYY-MM-DD must parse LOCAL — see CLAUDE.md) ─────────

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

function toDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  if (YMD_RE.test(value)) {
    const [y, m, d] = value.split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatWhen(value: string | null | undefined): string {
  const d = toDate(value);
  if (!d) return 'Date not recorded';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ── Small presentational bits ───────────────────────────────────────────────

function Stars({ value, className = 'w-3.5 h-3.5' }: { value: number; className?: string }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${value} out of 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          className={`${className} ${n <= Math.round(value) ? 'text-amber-500' : 'text-gray-200 dark:text-white/15'}`}
          fill={n <= Math.round(value) ? 'currentColor' : 'none'}
        />
      ))}
    </span>
  );
}

function ScoreLine({ label, value }: { label: string; value: number | null }) {
  if (value === null) return null;
  return (
    <div className="flex items-center justify-between gap-3 py-1">
      <span className="text-sm font-medium text-gray-600 dark:text-white/70">{label}</span>
      <span className="flex items-center gap-1.5">
        <Stars value={value} />
        <span className="text-sm font-semibold text-gray-900 dark:text-white tabular-nums">{value}/5</span>
      </span>
    </div>
  );
}

const SOURCE_META = {
  supervisor: {
    label: 'Supervisor walkthrough',
    Icon: ClipboardCheck,
    chip: 'bg-brand/10 text-brand dark:bg-brand/20 dark:text-brand',
  },
  customer: {
    label: 'Customer survey',
    Icon: MessageSquare,
    chip: 'bg-sky-50 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300',
  },
  helper: {
    label: 'Crew feedback',
    Icon: HardHat,
    chip: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
  },
} as const;

const BAND_CLASSES: Record<string, string> = {
  none: 'text-gray-400 dark:text-white/40',
  needs_focus: 'text-rose-600 dark:text-rose-400',
  developing: 'text-amber-600 dark:text-amber-400',
  solid: 'text-brand dark:text-brand',
  strong: 'text-emerald-600 dark:text-emerald-400',
};

// ── Component ───────────────────────────────────────────────────────────────

export default function EmployeeReviews({
  employeeId,
  variant,
  className = '',
}: {
  employeeId: string;
  variant: 'self' | 'management';
  className?: string;
}) {
  const [data, setData] = useState<ReviewsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) { setDenied(true); return; }
      const res = await fetch(`/api/employee-reviews/${employeeId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) { setDenied(true); return; }
      const json = await res.json();
      setData(json.data ?? null);
    } catch {
      setDenied(true);
    } finally {
      setLoading(false);
    }
  }, [employeeId]);

  useEffect(() => { load(); }, [load]);

  // Caller isn't permitted (or the fetch failed) — stay out of the way entirely.
  if (denied) return null;

  const isSelf = variant === 'self';
  const heading = isSelf ? 'My Reviews' : 'Previous Reviews';

  if (loading) {
    return (
      <div className={`rounded-2xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/[0.05] p-6 ${className}`}>
        <div className="flex items-center gap-2 text-sm text-gray-400 dark:text-white/40">
          <Loader2 className="w-4 h-4 animate-spin" />
          Loading {heading.toLowerCase()}…
        </div>
      </div>
    );
  }

  if (!data) return null;

  const { rating } = data;
  const band = ratingBand(rating.composite);

  // Merge every source into one newest-first timeline.
  const timeline: TimelineItem[] = [
    ...data.supervisorVisits.map((item): TimelineItem => ({
      key: `sv-${item.id}`, time: toDate(item.visitDate)?.getTime() ?? 0, kind: 'supervisor', item,
    })),
    ...data.customerSurveys.map((item): TimelineItem => ({
      key: `cs-${item.id}`, time: toDate(item.submittedAt)?.getTime() ?? 0, kind: 'customer', item,
    })),
    ...data.helperReviews.map((item): TimelineItem => ({
      key: `hr-${item.id}`, time: toDate(item.createdAt)?.getTime() ?? 0, kind: 'helper', item,
    })),
  ].sort((a, b) => b.time - a.time);

  const visible = expanded ? timeline : timeline.slice(0, 3);
  const presentSources = (['supervisor', 'customer', 'helper'] as const).filter(
    (k) => rating.sources[k].average !== null
  );

  return (
    <section
      className={`rounded-2xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/[0.05] p-5 sm:p-6 space-y-5 shadow-sm ${className}`}
    >
      {/* Heading */}
      <div className="flex items-center gap-2">
        <Award className="w-5 h-5 text-brand" />
        <h3 className="text-sm font-bold text-gray-700 dark:text-gray-200 uppercase tracking-wider">
          {heading}
        </h3>
        {timeline.length > 0 && (
          <span className="ml-auto px-2 py-0.5 rounded-full bg-brand/10 dark:bg-brand/20 text-brand text-xs font-bold">
            {timeline.length}
          </span>
        )}
      </div>

      {/* ── Empty state ─────────────────────────────────────────────────── */}
      {timeline.length === 0 ? (
        <div className="text-center py-8">
          <ClipboardCheck className="w-9 h-9 mx-auto mb-3 text-gray-200 dark:text-white/15" />
          <p className="text-sm text-gray-500 dark:text-white/50">
            {isSelf
              ? 'No reviews yet. When a supervisor walks your jobsite or a customer fills out a survey, their feedback shows up here.'
              : 'No reviews on file for this employee yet.'}
          </p>
        </div>
      ) : (
        <>
          {/* ── Composite standing ─────────────────────────────────────────
              When the sample is too thin the LIB withholds the score (composite
              is null) and sets `provisional`. Show the reviews, never a headline
              number — one 1-star review must not read as an official standing. */}
          <div className="rounded-xl border border-gray-100 dark:border-white/10 bg-gray-50 dark:bg-white/[0.04] p-4 space-y-3">
            {rating.provisional ? (
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-gray-500 dark:text-white/50">
                  {isSelf ? 'Where you stand' : 'Overall standing'}
                </p>
                <p className="mt-1 text-base font-bold text-gray-700 dark:text-white/85">
                  Provisional — based on {rating.totalReviews} review{rating.totalReviews === 1 ? '' : 's'}
                </p>
                <p className="mt-1 text-sm text-gray-600 dark:text-white/60 leading-relaxed">
                  {rating.provisionalReason === 'single_source'
                    ? 'Only one kind of reviewer has weighed in so far, so there’s no overall score yet.'
                    : 'There aren’t enough reviews yet to put a number on it.'}{' '}
                  {isSelf
                    ? 'The feedback below is still worth reading.'
                    : 'The individual reviews are below.'}
                </p>
              </div>
            ) : (
              <>
                <div className="flex items-end gap-3 flex-wrap">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-widest text-gray-500 dark:text-white/50">
                      {isSelf ? 'Where you stand' : 'Overall standing'}
                    </p>
                    <p className={`text-3xl font-bold leading-none mt-1 tabular-nums ${BAND_CLASSES[band.key]}`}>
                      {rating.composite !== null ? rating.composite.toFixed(2) : '—'}
                      <span className="text-base font-semibold text-gray-500 dark:text-white/50"> / 5</span>
                    </p>
                  </div>
                  <div className="pb-0.5">
                    <span className={`text-sm font-semibold ${BAND_CLASSES[band.key]}`}>{band.label}</span>
                    <p className="text-sm text-gray-600 dark:text-white/60">
                      {rating.totalReviews} review{rating.totalReviews === 1 ? '' : 's'}
                      {rating.lastReviewedAt ? ` · latest ${formatWhen(rating.lastReviewedAt)}` : ''}
                    </p>
                  </div>
                </div>

                {/* Per-source contribution — makes the weighting legible instead of magic */}
                <div className="flex flex-wrap gap-1.5">
                  {presentSources.map((k) => {
                    const s = rating.sources[k];
                    const { Icon, chip } = SOURCE_META[k];
                    return (
                      <span
                        key={k}
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-sm font-semibold ${chip}`}
                        title={`${s.count} review${s.count === 1 ? '' : 's'} · ${Math.round(s.weight * 100)}% of the overall score`}
                      >
                        <Icon className="w-3.5 h-3.5" />
                        {s.label}: {s.average?.toFixed(2)}
                        <span className="font-normal opacity-70">({Math.round(s.weight * 100)}%)</span>
                      </span>
                    );
                  })}
                </div>

                {/* Strongest / focus area */}
                {(rating.strongest || rating.weakest) && (
                  <div className="grid sm:grid-cols-2 gap-2 pt-1">
                    {rating.strongest && (
                      <div className="flex items-start gap-2 text-sm">
                        <TrendingUp className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" />
                        <span className="text-gray-600 dark:text-white/70">
                          <span className="font-semibold text-gray-900 dark:text-white">Strongest:</span>{' '}
                          {rating.strongest.label} ({rating.strongest.average}/5)
                        </span>
                      </div>
                    )}
                    {rating.weakest && rating.weakest.key !== rating.strongest?.key && (
                      <div className="flex items-start gap-2 text-sm">
                        <Target className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                        <span className="text-gray-600 dark:text-white/70">
                          <span className="font-semibold text-gray-900 dark:text-white">
                            {isSelf ? 'Where to focus:' : 'Lowest area:'}
                          </span>{' '}
                          {rating.weakest.label} ({rating.weakest.average}/5)
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}

            {isSelf && (
              <p className="text-sm text-gray-500 dark:text-white/50 leading-relaxed pt-1">
                This updates automatically as new reviews come in. Recent reviews count for more
                than old ones, so a rough stretch doesn&apos;t follow you forever.
              </p>
            )}
          </div>

          {/* ── Timeline ─────────────────────────────────────────────────── */}
          <div className="space-y-3">
            {visible.map((entry) => {
              const meta = SOURCE_META[entry.kind];
              const when =
                entry.kind === 'supervisor' ? entry.item.visitDate
                : entry.kind === 'customer' ? entry.item.submittedAt
                : entry.item.createdAt;
              const jobNumber =
                entry.kind === 'supervisor' ? entry.item.jobNumber : entry.item.jobNumber ?? null;
              const avg =
                entry.kind === 'helper' ? entry.item.rating : entry.item.average;

              return (
                <article
                  key={entry.key}
                  className="rounded-xl border border-gray-100 dark:border-white/10 bg-white dark:bg-white/[0.03] p-4 space-y-2.5"
                >
                  <header className="flex items-start justify-between gap-3 flex-wrap">
                    <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-bold ${meta.chip}`}>
                      <meta.Icon className="w-3.5 h-3.5" />
                      {meta.label}
                    </span>
                    <span className="text-sm text-gray-500 dark:text-white/55">{formatWhen(when)}</span>
                  </header>

                  <div className="flex items-center gap-2 flex-wrap text-sm text-gray-500 dark:text-white/60">
                    {entry.kind === 'supervisor' && entry.item.supervisorName && (
                      <span>By {entry.item.supervisorName}</span>
                    )}
                    {entry.kind === 'helper' && <span>From {entry.item.reviewer}</span>}
                    {jobNumber && (
                      <span className="font-medium text-gray-600 dark:text-white/60">{jobNumber}</span>
                    )}
                    {avg !== null && avg !== undefined && (
                      <span className="inline-flex items-center gap-1 ml-auto">
                        <Stars value={avg} />
                        <span className="font-semibold text-gray-700 dark:text-white/80 tabular-nums">
                          {Number(avg).toFixed(avg % 1 === 0 ? 0 : 2)}/5
                        </span>
                      </span>
                    )}
                  </div>

                  {/* Per-dimension scores */}
                  {entry.kind === 'supervisor' && (
                    <div className="divide-y divide-gray-100 dark:divide-white/10">
                      <ScoreLine label="Performance" value={entry.item.performance} />
                      <ScoreLine label="Safety" value={entry.item.safety} />
                      <ScoreLine label="Cleanliness" value={entry.item.cleanliness} />
                    </div>
                  )}
                  {entry.kind === 'customer' && (
                    <div className="divide-y divide-gray-100 dark:divide-white/10">
                      <ScoreLine label="Overall" value={entry.item.overall} />
                      <ScoreLine label="Communication" value={entry.item.communication} />
                      <ScoreLine label="Cleanliness" value={entry.item.cleanliness} />
                    </div>
                  )}

                  {/* Words */}
                  {entry.kind === 'supervisor' && entry.item.observations && (
                    <p className="text-sm text-gray-700 dark:text-white/80 whitespace-pre-wrap leading-relaxed">
                      {entry.item.observations}
                    </p>
                  )}
                  {entry.kind === 'customer' && (entry.item.feedback || entry.item.operatorNotes) && (
                    <p className="text-sm text-gray-700 dark:text-white/80 whitespace-pre-wrap leading-relaxed">
                      {entry.item.feedback || entry.item.operatorNotes}
                    </p>
                  )}
                  {entry.kind === 'helper' && entry.item.comment && (
                    <p className="text-sm text-gray-700 dark:text-white/80 whitespace-pre-wrap leading-relaxed">
                      {entry.item.comment}
                    </p>
                  )}

                  {/* Issues + follow-up */}
                  {entry.kind === 'supervisor' && entry.item.issuesFlagged && (
                    <div className="rounded-lg bg-amber-50 dark:bg-amber-900/15 border border-amber-200 dark:border-amber-700/30 p-3">
                      <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-amber-700 dark:text-amber-300 mb-1">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        Issues raised
                      </p>
                      <p className="text-sm text-amber-800 dark:text-amber-200 whitespace-pre-wrap">
                        {entry.item.issuesFlagged}
                      </p>
                    </div>
                  )}
                  {entry.kind === 'supervisor' && entry.item.followUpRequired && (
                    <div className="rounded-lg bg-amber-50/60 dark:bg-amber-900/10 border border-amber-300 dark:border-amber-700/40 p-3">
                      <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-amber-700 dark:text-amber-300 mb-1">
                        <Flag className="w-3.5 h-3.5" />
                        {isSelf ? 'What to work on next' : 'Follow-up required'}
                      </p>
                      <p className="text-sm text-gray-700 dark:text-white/80 whitespace-pre-wrap">
                        {entry.item.followUpNotes || 'No notes were added.'}
                      </p>
                    </div>
                  )}
                </article>
              );
            })}
          </div>

          {timeline.length > 3 && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="w-full min-h-[44px] inline-flex items-center justify-center gap-1.5 rounded-xl border border-gray-200 dark:border-white/10 text-sm font-semibold text-gray-600 dark:text-white/70 hover:border-brand hover:text-brand transition"
            >
              {expanded ? 'Show less' : `Show all ${timeline.length} reviews`}
              <ChevronDown className={`w-4 h-4 transition-transform ${expanded ? 'rotate-180' : ''}`} />
            </button>
          )}
        </>
      )}
    </section>
  );
}
