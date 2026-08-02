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

import { ratingToDifficultyLabel, workItemDetailLine } from '@/lib/work-items-format';

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
          {h?.cutSteel && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300 font-semibold">
              steel{h?.steelEncountered ? `: ${h.steelEncountered}` : ''}
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
              {c?.cutSteel && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300 font-semibold">
                  steel{c?.steelEncountered ? `: ${c.steelEncountered}` : ''}
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
        // Flat-column fallback line only when there's no structured detail.
        const flatDetail = !holes && !cuts ? workItemDetailLine(item) : '';
        const difficulty = ratingToDifficultyLabel(item.accessibility_rating);
        const detailNote = d?.notes && d.notes !== item.notes ? String(d.notes) : null;

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
              {flatDetail && (
                <p className="text-xs font-mono text-slate-500 dark:text-white/50 mt-0.5">{flatDetail}</p>
              )}

              {item.notes && (
                <p className="text-xs text-slate-400 dark:text-white/40 italic mt-0.5">{item.notes}</p>
              )}
              {detailNote && (
                <p className="text-xs text-slate-400 dark:text-white/40 italic mt-0.5">{detailNote}</p>
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
