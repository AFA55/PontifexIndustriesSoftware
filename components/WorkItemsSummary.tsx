'use client';

/**
 * WorkItemsSummary — the ONE renderer for operator-submitted work_items rows.
 *
 * Expands details_json into what the operator actually reported: every core
 * hole (bit size, depth, qty, steel), every cut (LF, depth, wet/dry, areas),
 * per-item notes, and the submission difficulty badge. Falls back to the flat
 * back-compat columns when details_json is absent (older rows).
 *
 * Used by: admin job detail (Daily Progress), Active Jobs "Daily work"
 * expandable, so the two surfaces can't drift apart.
 */

import { rebarLabel, ratingToDifficultyLabel, workItemDetailLine, workItemQuickNote } from '@/lib/work-items-format';

export interface WorkItemRow {
  id: string;
  work_type: string | null;
  quantity: number | null;
  notes: string | null;
  day_number: number | null;
  core_quantity: number | null;
  core_size?: string | null;
  core_depth_inches?: number | null;
  linear_feet_cut: number | null;
  cut_depth_inches?: number | null;
  accessibility_rating?: number | null;
  accessibility_description?: string | null;
  details_json?: any;
  operator_name?: string | null;
  created_at?: string;
}

const DIFFICULTY_BADGE: Record<string, string> = {
  Easy: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
  Moderate: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
  Difficult: 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300',
};

function HoleList({ holes }: { holes: any[] }) {
  return (
    <ul className="mt-1 space-y-0.5">
      {holes.map((h, i) => (
        <li key={i} className="text-xs text-slate-600 dark:text-white/60 flex items-center gap-1.5">
          <span className="w-1 h-1 rounded-full bg-slate-300 dark:bg-white/25 flex-shrink-0" />
          <span className="font-mono">
            {(Number(h?.quantity) || 1)}× {h?.bitSize ? `${String(h.bitSize).replace(/"$/, '')}"` : '?'}
            {Number(h?.depthInches) > 0 ? ` @ ${Number(h.depthInches)}" deep` : ''}
          </span>
          {rebarLabel(h) && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300 font-semibold">
              {rebarLabel(h)}
            </span>
          )}
          {h?.plasticSetup && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300 font-semibold">
              plastic setup
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

function CutList({ cuts, cutType }: { cuts: any[]; cutType?: string }) {
  return (
    <ul className="mt-1 space-y-0.5">
      {cuts.map((c, i) => {
        const areas = Array.isArray(c?.areas) ? c.areas : [];
        return (
          <li key={i} className="text-xs text-slate-600 dark:text-white/60">
            <span className="flex items-center gap-1.5 flex-wrap">
              <span className="w-1 h-1 rounded-full bg-slate-300 dark:bg-white/25 flex-shrink-0" />
              <span className="font-mono">
                {Number(c?.linearFeet) > 0 ? `${Number(c.linearFeet)} LF` : 'Cut'}
                {Number(c?.cutDepth) > 0 ? ` @ ${Number(c.cutDepth)}" deep` : ''}
              </span>
              {cutType && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300 font-semibold uppercase">
                  {cutType}
                </span>
              )}
              {rebarLabel(c) && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300 font-semibold">
                  {rebarLabel(c)}
                </span>
              )}
              {c?.overcut && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300 font-semibold">
                  overcut
                </span>
              )}
              {c?.chainsawed && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-teal-100 text-teal-700 dark:bg-teal-500/15 dark:text-teal-300 font-semibold">
                  chainsawed{Number(c?.chainsawAreas) > 0 ? ` ×${Number(c.chainsawAreas)}` : ''}
                </span>
              )}
              {Array.isArray(c?.bladesUsed) && c.bladesUsed.length > 0 && (
                <span className="text-[10px] text-slate-400 dark:text-white/35">
                  blades: {c.bladesUsed.join(', ')}
                </span>
              )}
            </span>
            {areas.length > 0 && (
              <span className="block pl-2.5 text-[11px] text-slate-400 dark:text-white/35">
                {areas
                  .map(
                    (a: any) =>
                      `${Number(a?.quantity) || 1}× ${Number(a?.length) || 0}' × ${Number(a?.width) || 0}' @ ${Number(a?.depth) || 0}"`
                  )
                  .join(' · ')}
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** Demolition / removal quick entries (break & remove, jack hammering,
 *  chipping, Brokk) store a TOP-LEVEL `areas[]` + sq-ft total. */
function DemoAreaList({ details }: { details: any }) {
  const areas: any[] = Array.isArray(details?.areas) ? details.areas : [];
  const total =
    Number(details?.totalSquareFeet) ||
    areas.reduce((s, a) => s + (Number(a?.length) || 0) * (Number(a?.width) || 0), 0);
  return (
    <div className="mt-1">
      <span className="flex items-center gap-1.5 flex-wrap text-xs text-slate-600 dark:text-white/60">
        <span className="w-1 h-1 rounded-full bg-slate-300 dark:bg-white/25 flex-shrink-0" />
        <span className="font-mono">{Math.round(total * 100) / 100} sq ft</span>
        {details?.method && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300 font-semibold">
            {details.method}
          </span>
        )}
        {details?.equipment && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300 font-semibold">
            {details.equipment}
          </span>
        )}
      </span>
      {areas.length > 0 && (
        <span className="block pl-2.5 text-[11px] text-slate-400 dark:text-white/35">
          {areas
            .map((a: any) => {
              const thick = Number(a?.thickness) || Number(a?.depth) || 0;
              return `${Number(a?.length) || 0}' × ${Number(a?.width) || 0}'${thick > 0 ? ` @ ${thick}"` : ''}`;
            })
            .join(' · ')}
        </span>
      )}
    </div>
  );
}

export default function WorkItemsSummary({
  items,
  showOperator = false,
}: {
  items: WorkItemRow[];
  showOperator?: boolean;
}) {
  if (!items || items.length === 0) {
    return (
      <p className="text-xs text-slate-400 dark:text-white/35 italic">
        No work items recorded.
      </p>
    );
  }

  return (
    <ul className="space-y-2.5">
      {items.map((item) => {
        const d = item.details_json;
        const holes = d && Array.isArray(d.holes) && d.holes.length > 0 ? d.holes : null;
        const cuts = d && Array.isArray(d.cuts) && d.cuts.length > 0 ? d.cuts : null;
        const demoAreas = !holes && !cuts && d && Array.isArray(d.areas) && d.areas.length > 0 ? d : null;
        // Flat-column fallback line only when there's no structured detail.
        const flatDetail = !holes && !cuts && !demoAreas ? workItemDetailLine(item) : '';
        const difficulty = ratingToDifficultyLabel(item.accessibility_rating);
        // The operator's quick note — canonical `notes` column, falling back to
        // the legacy details_json.notes so pre-Aug-2026 rows still show it.
        const quickNote = workItemQuickNote(item);

        return (
          <li key={item.id} className="flex items-start gap-2 text-sm">
            <span className="w-1.5 h-1.5 mt-2 rounded-full bg-brand-accent flex-shrink-0" />
            <div className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5 flex-wrap">
                <span className="font-medium text-slate-800 dark:text-white/85">
                  {item.work_type || 'Work Item'}
                </span>
                <span className="text-xs font-mono text-brand dark:text-brand">
                  ×{Number(item.quantity) || 1}
                </span>
                {difficulty && (
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${DIFFICULTY_BADGE[difficulty] || ''}`}
                    title={item.accessibility_description || undefined}
                  >
                    {difficulty}
                  </span>
                )}
                {showOperator && item.operator_name && (
                  <span className="text-[11px] text-slate-400 dark:text-white/35">
                    — {item.operator_name}
                  </span>
                )}
              </span>

              {holes && <HoleList holes={holes} />}
              {cuts && <CutList cuts={cuts} cutType={d?.cutType} />}
              {demoAreas && <DemoAreaList details={demoAreas} />}
              {flatDetail && (
                <p className="text-xs font-mono text-slate-500 dark:text-white/50 mt-0.5">{flatDetail}</p>
              )}

              {/* Quick note — the founder's headline field. Full text on its own
                  line (never truncated, never a chip), pre-wrapped so voice
                  dictation's line breaks survive. */}
              {quickNote && (
                <p className="mt-1.5 border-l-2 border-brand/40 pl-2 text-xs leading-relaxed whitespace-pre-wrap text-slate-600 dark:text-white/65">
                  {quickNote}
                </p>
              )}
              {item.accessibility_description && (
                <p className="text-xs text-slate-400 dark:text-white/40 mt-0.5">
                  <span className="font-semibold not-italic">Difficulty note:</span>{' '}
                  {item.accessibility_description}
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
