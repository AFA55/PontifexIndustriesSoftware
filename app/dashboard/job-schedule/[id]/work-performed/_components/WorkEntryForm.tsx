'use client';

/**
 * WORK PERFORMED, SHAPED LIKE THE OFFICE'S SCOPE OF WORK.
 *
 * The founder, Aug 15 2026, after using both screens back to back:
 *   "Once the project manager inputs core drilling or electric floor sawing or
 *    hydraulic core drilling, I would like the operator's page when they're
 *    trying to submit work performed to look exactly like this, because
 *    literally they're just inputting information as well… they could put
 *    recommended service types, or they could choose from others and search it
 *    and type it out and find it, and if it's not one that's on there they
 *    could add it… This is what I was saying — they just click on all the
 *    things, and then they could input the information later."
 *
 * So: tiles first (RECOMMENDED — what the office actually scoped — then a
 * searchable Other list, then add-your-own), one measurement card per ticked
 * type below, then material removal. Same order, same controls, same words as
 * `app/dashboard/admin/schedule-form/page.tsx` step 3.
 *
 * TWO THINGS THIS DESIGN DELIBERATELY FIXES
 *  1. Nothing is held in a transient panel any more. Every keystroke commits
 *     straight into the submitted item list, so there is no "I typed the holes,
 *     pressed Next, and it said add measurements" state to get stranded in.
 *  2. There is still exactly ONE write path. This component only ever produces
 *     `WorkItem[]` in the shape `lib/work-items-format.ts` already renders; the
 *     page POSTs them to /api/job-orders/[id]/work-items with the work date.
 *
 * FIELD CONSTRAINTS (do not shrink): operators are on phones, outdoors, in
 * gloves. Tap targets ≥44px, inputs ≥16px (below that iOS zooms the page), and
 * nothing may overflow horizontally at 375px.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Trash2, Search, Truck, X, Sparkles, ChevronDown, ChevronUp } from 'lucide-react';
import { RebarSizePicker } from '@/components/ui/RebarSizePicker';
import {
  ALL_WORK_TYPES,
  POPULAR_WORK_TYPES,
  UNIT_CHOICES,
  REMOVAL_METHODS,
  REMOVAL_EQUIPMENT,
  buildWorkItemFromEntry,
  emptyAreaRow,
  emptyCutRow,
  emptyHoleRow,
  emptyWorkEntry,
  entryHasMeasurements,
  removalFromWorkItems,
  totalLinearFeet,
  totalSquareFeet,
  workEntryFromWorkItem,
  workEntryMode,
  type AreaRow,
  type HoleRow,
  type LinearCutRow,
  type MaterialRemoval,
  type WorkEntry,
  type WorkItem,
} from '@/lib/work-types';

interface WorkEntryFormProps {
  /** The day's items — the page's source of truth (draft, or already submitted). */
  items: WorkItem[];
  /** Bumped by the page once an async hydration lands, to re-seed the form. */
  hydrationToken: number;
  /** Work types the office scoped for this job. Shown first. */
  recommended: string[];
  onChange: (items: WorkItem[], pendingNames: string[]) => void;
}

// ── Tile colour by which builder the type gets ───────────────────────────────
const MODE_STYLE: Record<string, { gradient: string; light: string }> = {
  holes: { gradient: 'from-orange-500 to-amber-600', light: 'bg-orange-50 border-orange-200 text-orange-700' },
  sawing: { gradient: 'from-blue-500 to-indigo-600', light: 'bg-blue-50 border-blue-200 text-blue-700' },
  demo: { gradient: 'from-slate-600 to-slate-800', light: 'bg-slate-50 border-slate-300 text-slate-700' },
  generic: { gradient: 'from-emerald-500 to-teal-600', light: 'bg-emerald-50 border-emerald-200 text-emerald-700' },
};

/** "BREAK & REMOVE" → "BR". The scope form's two-letter service badge, for a
 *  vocabulary that has names instead of codes. */
function initialsOf(name: string): string {
  const words = name.replace(/[^A-Za-z0-9 /]/g, ' ').split(/[\s/]+/).filter(Boolean);
  if (words.length === 0) return '??';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

const INPUT =
  'w-full px-3 py-3 bg-white dark:bg-white/[0.05] border border-slate-200 dark:border-white/10 rounded-xl ' +
  'text-base font-semibold text-slate-800 dark:text-white placeholder-slate-400 dark:placeholder-white/30 ' +
  'focus:outline-none focus:ring-2 focus:ring-brand/25 focus:border-brand transition-all';

const FIELD_LABEL =
  'text-[11px] font-bold text-slate-500 dark:text-white/40 uppercase tracking-widest';

function Suffix({ children }: { children: React.ReactNode }) {
  return (
    <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] font-bold text-slate-400 dark:text-white/30 pointer-events-none">
      {children}
    </span>
  );
}

function RowDelete({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="w-11 h-11 flex items-center justify-center rounded-xl text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10 transition-all shrink-0"
    >
      <Trash2 size={18} />
    </button>
  );
}

function AddRowButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-2 min-h-[44px] px-4 py-2.5 rounded-xl text-sm font-bold text-brand bg-brand/10 hover:bg-brand/20 border border-brand/30 transition-all"
    >
      <Plus size={16} />
      {children}
    </button>
  );
}

function TotalPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap items-center gap-2 px-3 py-2 bg-slate-50 dark:bg-white/[0.05] rounded-xl border border-slate-200 dark:border-white/10">
      <span className="text-xs font-bold text-slate-500 dark:text-white/40 uppercase tracking-wider">{label}</span>
      <span className="text-sm font-bold text-slate-800 dark:text-white">{value}</span>
    </div>
  );
}

/**
 * A work-type tile. MODULE LEVEL on purpose: declared inside the form it would
 * be a new component type on every render, so all ~30 tiles would unmount and
 * remount on every keystroke in a notes box — visible lag on the phones this
 * screen actually runs on.
 */
function TypeTile({
  name,
  selected,
  onToggle,
}: {
  name: string;
  selected: boolean;
  onToggle: (name: string) => void;
}) {
  const style = MODE_STYLE[workEntryMode(name)] ?? MODE_STYLE.generic;
  return (
    <button
      type="button"
      onClick={() => onToggle(name)}
      aria-pressed={selected}
      className={`flex items-center gap-2.5 px-3 py-3 min-h-[56px] rounded-xl text-sm font-semibold border-2 transition-all duration-200 text-left ${
        selected
          ? `bg-gradient-to-r ${style.gradient} text-white border-transparent shadow-lg`
          : `bg-white dark:bg-white/[0.05] ${style.light} dark:border-white/10 dark:text-white/70 hover:shadow-md`
      }`}
    >
      <div
        className={`w-8 h-8 rounded-lg flex items-center justify-center text-[11px] font-black flex-shrink-0 ${
          selected ? 'bg-white/20 text-white' : `bg-gradient-to-br ${style.gradient} text-white`
        }`}
      >
        {initialsOf(name)}
      </div>
      <span className="leading-tight min-w-0 break-words">{name}</span>
    </button>
  );
}

export default function WorkEntryForm({ items, hydrationToken, recommended, onChange }: WorkEntryFormProps) {
  const [entries, setEntries] = useState<WorkEntry[]>(() => items.map(workEntryFromWorkItem));
  const [removal, setRemoval] = useState<MaterialRemoval>(() => removalFromWorkItems(items));
  const [search, setSearch] = useState('');
  const [showOther, setShowOther] = useState(false);
  const [customName, setCustomName] = useState('');
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // ── Re-seed when the page finishes loading a draft / today's submission ────
  // Keyed on a token rather than on `items` itself: `items` is echoed back to
  // the page on every keystroke, and re-seeding from it would fight the typing.
  const seededRef = useRef(-1);
  useEffect(() => {
    if (seededRef.current === hydrationToken) return;
    seededRef.current = hydrationToken;
    setEntries(items.map(workEntryFromWorkItem));
    setRemoval(removalFromWorkItems(items));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrationToken]);

  // ── Publish upward on every change ────────────────────────────────────────
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  useEffect(() => {
    onChangeRef.current(
      entries.map((e) => buildWorkItemFromEntry(e, removal)),
      entries.filter((e) => !entryHasMeasurements(e)).map((e) => e.name)
    );
  }, [entries, removal]);

  const pickedNames = useMemo(() => entries.map((e) => e.name), [entries]);

  const updateEntry = useCallback((name: string, patch: Partial<WorkEntry>) => {
    setEntries((prev) => prev.map((e) => (e.name === name ? { ...e, ...patch } : e)));
  }, []);

  const addType = useCallback(
    (name: string) => {
      const clean = name.trim();
      if (!clean) return;
      setEntries((prev) => (prev.some((e) => e.name === clean) ? prev : [...prev, emptyWorkEntry(clean)]));
      setSearch('');
      // Bring the new card into view — same reason the old panel scrolled: on a
      // phone the tile you tapped is at the top and its fields are far below.
      setTimeout(() => {
        cardRefs.current[clean]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 90);
    },
    []
  );

  /**
   * Tapping a ticked tile UNTICKS it — but only while it is still empty.
   *
   * Tapping a tile that already holds real measurements would otherwise throw
   * every hole and cut behind it away on a tap that looks like "open it", with
   * no confirm and no undo. Removing filled-in work has a proper home: the ✕ on
   * its own card.
   */
  const toggleType = useCallback((name: string) => {
    setEntries((prev) => {
      const existing = prev.find((e) => e.name === name);
      if (!existing) return [...prev, emptyWorkEntry(name)];
      if (entryHasMeasurements(existing)) {
        cardRefs.current[name]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return prev;
      }
      return prev.filter((e) => e.name !== name);
    });
  }, []);

  const removeType = useCallback((name: string) => {
    setEntries((prev) => prev.filter((e) => e.name !== name));
  }, []);

  // ── Tiles ─────────────────────────────────────────────────────────────────
  // Recommended = the office's scope. When the office scoped nothing, fall back
  // to the crew's usual seven rather than showing an empty first section.
  const recommendedTiles = recommended.length > 0 ? recommended : POPULAR_WORK_TYPES;
  const otherTypes = useMemo(() => {
    const q = search.trim().toLowerCase();
    const pool = [...ALL_WORK_TYPES.filter((t) => !recommendedTiles.includes(t))];
    // Custom types the operator added earlier stay reachable in the list too.
    for (const name of pickedNames) {
      if (!ALL_WORK_TYPES.includes(name) && !pool.includes(name)) pool.push(name);
    }
    return q ? pool.filter((t) => t.toLowerCase().includes(q)) : pool;
  }, [search, recommendedTiles, pickedNames]);

  const searchHitsRecommended = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? recommendedTiles.filter((t) => t.toLowerCase().includes(q)) : [];
  }, [search, recommendedTiles]);

  const canAddCustom =
    customName.trim().length > 1 &&
    !ALL_WORK_TYPES.some((t) => t.toLowerCase() === customName.trim().toLowerCase()) &&
    !pickedNames.some((t) => t.toLowerCase() === customName.trim().toLowerCase());

  const selectedNames = useMemo(() => new Set(pickedNames), [pickedNames]);

  return (
    <div className="space-y-5">
      {/* ── 1. WHAT DID YOU DO? — recommended tiles ───────────────────────── */}
      <section className="bg-white dark:bg-white/[0.05] border border-slate-200 dark:border-white/10 rounded-2xl p-4 sm:p-5 shadow-sm">
        <div className="flex items-center gap-2 mb-1">
          <Sparkles className="w-4 h-4 text-brand flex-shrink-0" />
          <h2 className="text-base font-bold text-slate-900 dark:text-white">What did you do today?</h2>
        </div>
        <p className="text-xs text-slate-500 dark:text-white/50 mb-3">
          {recommended.length > 0
            ? 'What the office scheduled for this job. Tap everything you did — you fill in the numbers below.'
            : 'Tap everything you did — you fill in the numbers below.'}
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {recommendedTiles.map((name) => (
            <TypeTile key={name} name={name} selected={selectedNames.has(name)} onToggle={toggleType} />
          ))}
        </div>

        {/* ── 2. Other work types — searchable ──────────────────────────── */}
        <button
          type="button"
          onClick={() => setShowOther((v) => !v)}
          className="mt-4 w-full min-h-[44px] flex items-center justify-between gap-2 px-4 py-3 rounded-xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/10 hover:bg-slate-100 dark:hover:bg-white/[0.08] transition-colors"
        >
          <span className="text-sm font-bold text-slate-700 dark:text-white/80">
            Did something else? Search all work types
          </span>
          {showOther ? (
            <ChevronUp className="w-4 h-4 text-slate-400 flex-shrink-0" />
          ) : (
            <ChevronDown className="w-4 h-4 text-slate-400 flex-shrink-0" />
          )}
        </button>

        {showOther && (
          <div className="mt-3 space-y-3">
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 dark:text-white/30 pointer-events-none" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Type to search…"
                className={`${INPUT} pl-11 pr-11`}
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  aria-label="Clear search"
                  className="absolute right-0.5 top-1/2 -translate-y-1/2 w-11 h-11 flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-white rounded-xl"
                >
                  <X className="w-5 h-5" />
                </button>
              )}
            </div>

            {searchHitsRecommended.length > 0 && (
              <p className="text-xs font-semibold text-brand">
                Also above in Recommended: {searchHitsRecommended.join(', ')}
              </p>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-[26rem] overflow-y-auto">
              {otherTypes.map((name) => (
                <TypeTile key={name} name={name} selected={selectedNames.has(name)} onToggle={toggleType} />
              ))}
            </div>
            {otherTypes.length === 0 && (
              <p className="text-sm text-slate-500 dark:text-white/50">
                Nothing matches &ldquo;{search}&rdquo; — add it below.
              </p>
            )}

            {/* ── 3. Not on the list? Add it ────────────────────────────── */}
            <div className="pt-3 border-t border-slate-100 dark:border-white/10">
              <p className={`${FIELD_LABEL} mb-2`}>Not on the list? Add it</p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && canAddCustom) {
                      e.preventDefault();
                      addType(customName.trim().toUpperCase());
                      setCustomName('');
                    }
                  }}
                  placeholder="e.g. SLURRY CLEANUP"
                  className={INPUT}
                />
                <button
                  type="button"
                  disabled={!canAddCustom}
                  onClick={() => {
                    addType(customName.trim().toUpperCase());
                    setCustomName('');
                  }}
                  className="flex-shrink-0 min-h-[44px] px-4 rounded-xl bg-brand text-white font-bold text-sm disabled:opacity-40 disabled:cursor-not-allowed hover:bg-brand/90 transition-colors"
                >
                  Add
                </button>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* ── 4. One measurement card per ticked type ───────────────────────── */}
      {entries.length > 0 && (
        <div className="space-y-4">
          <p className="text-xs font-bold text-slate-400 dark:text-white/40 uppercase tracking-widest">
            What you did — fill in each one
          </p>

          {entries.map((entry) => {
            const style = MODE_STYLE[entry.mode] ?? MODE_STYLE.generic;
            const filled = entryHasMeasurements(entry);
            return (
              <div
                key={entry.name}
                ref={(el) => {
                  cardRefs.current[entry.name] = el;
                }}
                className={`bg-white dark:bg-white/[0.05] border rounded-2xl p-4 sm:p-5 shadow-sm ${
                  filled
                    ? 'border-slate-200 dark:border-white/10'
                    : 'border-amber-300 dark:border-amber-500/40'
                }`}
              >
                <div className="flex items-start justify-between gap-2 mb-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`w-9 h-9 rounded-xl flex items-center justify-center text-[11px] font-black bg-gradient-to-br ${style.gradient} text-white shadow-md flex-shrink-0`}
                    >
                      {initialsOf(entry.name)}
                    </div>
                    <div className="min-w-0">
                      <h4 className="text-base font-bold text-slate-800 dark:text-white break-words">
                        {entry.name}
                      </h4>
                      {!filled && (
                        <p className="text-xs font-semibold text-amber-700 dark:text-amber-300">
                          Needs measurements
                        </p>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeType(entry.name)}
                    aria-label={`Remove ${entry.name}`}
                    className="w-11 h-11 flex-shrink-0 flex items-center justify-center rounded-xl text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* ── HOLES (core drilling) ─────────────────────────────── */}
                {entry.mode === 'holes' && (
                  <HolesBuilder
                    holes={entry.holes}
                    onChange={(holes) => updateEntry(entry.name, { holes })}
                  />
                )}

                {/* ── SAWING ────────────────────────────────────────────── */}
                {entry.mode === 'sawing' && (
                  <SawingBuilder
                    entry={entry}
                    onChange={(patch) => updateEntry(entry.name, patch)}
                  />
                )}

                {/* ── DEMOLITION / BREAKING ─────────────────────────────── */}
                {entry.mode === 'demo' && (
                  <AreasBuilder
                    areas={entry.areas}
                    onChange={(areas) => updateEntry(entry.name, { areas })}
                    totalLabel={`${totalSquareFeet(entry).toLocaleString()} sq ft`}
                    showTotal={totalSquareFeet(entry) > 0}
                  />
                )}

                {/* ── GENERIC: how much + unit ──────────────────────────── */}
                {entry.mode === 'generic' && (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={`${FIELD_LABEL} mb-1.5 block`}>How much?</label>
                      <input
                        type="number"
                        inputMode="decimal"
                        value={entry.quantity}
                        onChange={(e) => updateEntry(entry.name, { quantity: e.target.value })}
                        placeholder="0"
                        className={INPUT}
                      />
                    </div>
                    <div>
                      <label className={`${FIELD_LABEL} mb-1.5 block`}>Unit</label>
                      <select
                        value={entry.unit}
                        onChange={(e) => updateEntry(entry.name, { unit: e.target.value })}
                        className={INPUT}
                      >
                        {UNIT_CHOICES.map((u) => (
                          <option key={u} value={u}>
                            {u}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}

                {/* ── Rebar — one answer per work type ──────────────────── */}
                {(entry.mode === 'holes' || entry.mode === 'sawing') && (
                  <div className="mt-4 pt-4 border-t border-slate-100 dark:border-white/10">
                    <RebarSizePicker
                      value={entry.rebarSize}
                      onChange={(rebarSize) => updateEntry(entry.name, { rebarSize })}
                    />
                  </div>
                )}

                {/* ── Quick notes — INTERNAL, never on a customer sheet ─── */}
                <div className="mt-4 pt-4 border-t border-slate-100 dark:border-white/10">
                  <label className={`${FIELD_LABEL} mb-1.5 block`}>
                    Quick notes <span className="normal-case tracking-normal font-medium text-slate-400">(office only)</span>
                  </label>
                  <textarea
                    rows={2}
                    value={entry.notes}
                    onChange={(e) => updateEntry(entry.name, { notes: e.target.value })}
                    placeholder="Prep, access, delays — anything that affected this work"
                    className={`${INPUT} resize-none`}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── 5. Material removal ───────────────────────────────────────────── */}
      {entries.length > 0 && (
        <section className="bg-white dark:bg-white/[0.05] border border-slate-200 dark:border-white/10 rounded-2xl p-4 sm:p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-gradient-to-br from-red-500 to-red-700 text-white shadow-md flex-shrink-0">
                <Truck className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <h4 className="text-base font-bold text-slate-800 dark:text-white">Material Removal</h4>
                <p className="text-xs text-slate-400 dark:text-white/40">Did you take material off the site?</p>
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={removal.removed}
              aria-label="Material removed from site"
              onClick={() =>
                setRemoval((r) =>
                  r.removed ? { removed: false, method: '', equipment: [] } : { ...r, removed: true }
                )
              }
              /* 44px tall, not 32 — this is the control that decides whether
                 the removal answer reaches the ticket at all, and it is pressed
                 with gloves on. */
              className={`relative w-[68px] h-11 flex-shrink-0 rounded-full transition-all duration-200 ${
                removal.removed ? 'bg-red-500' : 'bg-slate-300 dark:bg-white/20'
              }`}
            >
              <span
                className={`absolute top-1.5 left-1.5 w-8 h-8 rounded-full bg-white shadow-md transition-transform duration-200 ${
                  removal.removed ? 'translate-x-[26px]' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {removal.removed && (
            <div className="mt-4 space-y-4">
              <div>
                <label className={`${FIELD_LABEL} mb-2 block`}>How did it leave?</label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  {REMOVAL_METHODS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() =>
                        setRemoval((r) => ({ ...r, method: r.method === opt.value ? '' : opt.value }))
                      }
                      className={`min-h-[48px] px-4 py-3 rounded-xl text-sm font-bold transition-all border-2 ${
                        removal.method === opt.value
                          ? 'bg-red-500 text-white border-red-400 shadow-lg'
                          : 'bg-slate-50 dark:bg-white/[0.03] text-slate-600 dark:text-white/70 border-slate-200 dark:border-white/10 hover:bg-slate-100 dark:hover:bg-white/[0.08]'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className={`${FIELD_LABEL} mb-2 block`}>What did you use? (all that apply)</label>
                <div className="flex flex-wrap gap-2">
                  {REMOVAL_EQUIPMENT.map((equip) => {
                    const on = removal.equipment.includes(equip);
                    return (
                      <button
                        key={equip}
                        type="button"
                        onClick={() =>
                          setRemoval((r) => ({
                            ...r,
                            equipment: on
                              ? r.equipment.filter((e) => e !== equip)
                              : [...r.equipment, equip],
                          }))
                        }
                        className={`min-h-[44px] px-4 py-2.5 rounded-xl text-sm font-semibold transition-all border-2 ${
                          on
                            ? 'bg-orange-500 text-white border-orange-400 shadow-md'
                            : 'bg-white dark:bg-white/[0.03] text-slate-600 dark:text-white/70 border-slate-200 dark:border-white/10 hover:bg-slate-50 dark:hover:bg-white/[0.08]'
                        }`}
                      >
                        {equip}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

// ── Holes builder — the scope form's, with the same "Add Different Holes" ────
function HolesBuilder({ holes, onChange }: { holes: HoleRow[]; onChange: (h: HoleRow[]) => void }) {
  const rows = holes.length > 0 ? holes : [emptyHoleRow()];
  const patch = (idx: number, next: Partial<HoleRow>) =>
    onChange(rows.map((r, i) => (i === idx ? { ...r, ...next } : r)));
  const total = rows.reduce((sum, h) => sum + (parseInt(h.quantity, 10) || 0), 0);
  const sizes = [...new Set(rows.map((h) => h.bitSize.trim()).filter(Boolean))];
  const plastic = rows.some((h) => h.plasticSetup);

  return (
    <div className="space-y-3">
      {rows.map((hole, idx) => (
        <div key={idx} className={idx > 0 ? 'pt-3 border-t border-slate-100 dark:border-white/[0.06]' : ''}>
          {/* The header row used to be full-width while the inputs sat inside a
              flex-1 that shrinks by ~50px the moment a delete button appears —
              so on multi-row entries the labels drifted right of the columns
              they name. Sharing the same container keeps them aligned. */}
          <div className="flex items-center gap-1.5">
            <div className="flex-1 min-w-0">
              {idx === 0 && (
                <div className="grid grid-cols-3 gap-2 mb-1.5">
                  <label className={FIELD_LABEL}># of Holes</label>
                  <label className={FIELD_LABEL}>Bit Size</label>
                  <label className={FIELD_LABEL}>Depth</label>
                </div>
              )}
              <div className="grid grid-cols-3 gap-2">
              <input
                type="number"
                inputMode="numeric"
                placeholder="0"
                value={hole.quantity}
                onChange={(e) => patch(idx, { quantity: e.target.value })}
                className={INPUT}
              />
              <div className="relative">
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="4"
                  value={hole.bitSize}
                  onChange={(e) => patch(idx, { bitSize: e.target.value })}
                  className={`${INPUT} pr-6`}
                />
                <Suffix>&quot;</Suffix>
              </div>
              <div className="relative">
                <input
                  type="number"
                  inputMode="decimal"
                  placeholder="0"
                  value={hole.depthInches}
                  onChange={(e) => patch(idx, { depthInches: e.target.value })}
                  className={`${INPUT} pr-8`}
                />
                <Suffix>in.</Suffix>
              </div>
              </div>
            </div>
            {rows.length > 1 && (
              <RowDelete label={`Remove hole row ${idx + 1}`} onClick={() => onChange(rows.filter((_, i) => i !== idx))} />
            )}
          </div>
        </div>
      ))}

      <AddRowButton onClick={() => onChange([...rows, emptyHoleRow()])}>Add Different Holes</AddRowButton>

      {/* Plastic setup — the old screen asked this per hole. One answer for the
          work type is what the office reads it as, and it is one tap instead of
          one per row. Still stored on every hole, so nothing downstream changes. */}
      <button
        type="button"
        onClick={() => onChange(rows.map((r) => ({ ...r, plasticSetup: !plastic })))}
        aria-pressed={plastic}
        className={`min-h-[44px] px-4 py-2.5 rounded-xl text-sm font-semibold border-2 transition-all ${
          plastic
            ? 'bg-sky-500 text-white border-sky-400 shadow-md'
            : 'bg-white dark:bg-white/[0.03] text-slate-600 dark:text-white/70 border-slate-200 dark:border-white/10'
        }`}
      >
        {plastic ? '✓ Plastic setup used' : 'Plastic setup?'}
      </button>

      {total > 0 && (
        <TotalPill
          label="Total:"
          value={`${total} hole${total !== 1 ? 's' : ''}${sizes.length ? ` · ${sizes.map((s) => `${s}"`).join(', ')}` : ''}`}
        />
      )}
    </div>
  );
}

// ── Sawing builder — Linear Ft + Cut Depth, or Areas + Thickness ─────────────
function SawingBuilder({
  entry,
  onChange,
}: {
  entry: WorkEntry;
  onChange: (patch: Partial<WorkEntry>) => void;
}) {
  const cuts = entry.cuts.length > 0 ? entry.cuts : [emptyCutRow()];
  const patchCut = (idx: number, next: Partial<LinearCutRow>) =>
    onChange({ cuts: cuts.map((c, i) => (i === idx ? { ...c, ...next } : c)) });
  const lf = totalLinearFeet(entry);

  return (
    <div className="space-y-3">
      {/* Mode toggle — the office form's own two words */}
      <div className="flex gap-2">
        {(['linear', 'areas'] as const).map((mode) => (
          <button
            key={mode}
            type="button"
            onClick={() => onChange({ sawMode: mode })}
            className={`flex-1 min-h-[44px] px-3 py-2.5 rounded-xl text-sm font-semibold transition-all ${
              entry.sawMode === mode
                ? 'bg-brand text-white shadow-md'
                : 'bg-slate-100 dark:bg-white/[0.08] text-slate-500 dark:text-white/50 hover:bg-slate-200 dark:hover:bg-white/[0.12]'
            }`}
          >
            {mode === 'linear' ? 'Linear Ft + Cut Depth' : 'Areas + Thickness'}
          </button>
        ))}
      </div>

      {entry.sawMode === 'linear' ? (
        <>
          {/* LINEAR FEET + CUT DEPTH. Nothing else — no width, no cross-cuts.
              "When they input linear feet, you don't need to know the width.
              You just need to know total linear feet… you don't need to know
              cross cuts, none of that" (founder, Aug 15; commit 706d8c15 made
              the office form match). The two screens must ask the same
              question in the same words. */}
          {cuts.map((cut, idx) => (
            <div key={idx} className={idx > 0 ? 'pt-3 border-t border-slate-100 dark:border-white/[0.06]' : ''}>
              {idx === 0 && (
                <div className="grid grid-cols-2 gap-2 mb-1.5">
                  <label className={FIELD_LABEL}>Linear Feet</label>
                  <label className={FIELD_LABEL}>Cut Depth</label>
                </div>
              )}
              <div className="flex items-center gap-1.5">
                <div className="grid grid-cols-2 gap-2 flex-1 min-w-0">
                  <div className="relative">
                    <input
                      type="number"
                      inputMode="decimal"
                      placeholder="0"
                      value={cut.linearFeet}
                      onChange={(e) => patchCut(idx, { linearFeet: e.target.value })}
                      className={`${INPUT} pr-7`}
                    />
                    <Suffix>ft</Suffix>
                  </div>
                  <div className="relative">
                    <input
                      type="number"
                      inputMode="decimal"
                      placeholder="0"
                      value={cut.cutDepth}
                      onChange={(e) => patchCut(idx, { cutDepth: e.target.value })}
                      className={`${INPUT} pr-8`}
                    />
                    <Suffix>in.</Suffix>
                  </div>
                </div>
                {cuts.length > 1 && (
                  <RowDelete
                    label={`Remove cut row ${idx + 1}`}
                    onClick={() => onChange({ cuts: cuts.filter((_, i) => i !== idx) })}
                  />
                )}
              </div>
            </div>
          ))}
          <AddRowButton onClick={() => onChange({ cuts: [...cuts, emptyCutRow()] })}>Add Cut</AddRowButton>
        </>
      ) : (
        <AreasBuilder
          areas={entry.areas}
          onChange={(areas) => onChange({ areas })}
          totalLabel=""
          showTotal={false}
        />
      )}

      {/* Wet / dry */}
      <div className="pt-3 border-t border-slate-100 dark:border-white/10">
        <p className={`${FIELD_LABEL} mb-2`}>Cut method</p>
        <div className="grid grid-cols-2 gap-2">
          {(['wet', 'dry'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => onChange({ cutType: t })}
              className={`min-h-[44px] px-4 py-2.5 rounded-xl text-sm font-bold capitalize border-2 transition-all ${
                entry.cutType === t
                  ? t === 'wet'
                    ? 'bg-sky-500 text-white border-sky-400 shadow-md'
                    : 'bg-orange-500 text-white border-orange-400 shadow-md'
                  : 'bg-white dark:bg-white/[0.03] text-slate-600 dark:text-white/70 border-slate-200 dark:border-white/10'
              }`}
            >
              {t} cutting
            </button>
          ))}
        </div>
      </div>

      {lf > 0 && (
        <TotalPill label="Total:" value={`${lf.toLocaleString(undefined, { maximumFractionDigits: 1 })} linear ft`} />
      )}
      {entry.sawMode === 'areas' && totalSquareFeet(entry) > 0 && (
        <TotalPill label="Area:" value={`${totalSquareFeet(entry).toLocaleString()} sq ft`} />
      )}
    </div>
  );
}

// ── Areas builder — L × W × Thickness × Qty, the scope form's grid ───────────
function AreasBuilder({
  areas,
  onChange,
  totalLabel,
  showTotal,
}: {
  areas: AreaRow[];
  onChange: (a: AreaRow[]) => void;
  totalLabel: string;
  showTotal: boolean;
}) {
  const rows = areas.length > 0 ? areas : [emptyAreaRow()];
  const patch = (idx: number, next: Partial<AreaRow>) =>
    onChange(rows.map((r, i) => (i === idx ? { ...r, ...next } : r)));

  return (
    <div className="space-y-3">
      {rows.map((area, idx) => {
        const sq =
          (parseFloat(area.length) || 0) * (parseFloat(area.width) || 0) * (parseInt(area.quantity, 10) || 1);
        return (
          <div key={idx} className={idx > 0 ? 'pt-3 border-t border-slate-100 dark:border-white/[0.06]' : ''}>
            {/* EVERY LABEL SITS ON ITS OWN FIELD.
                A single 4-across header row above a 4-across input row looks
                right on a desk and falls apart on a phone: at 375px both grids
                wrap to 2 columns, so the labels stack Length/Width then
                Thickness/Qty in one block and the four boxes stack in another —
                putting the word "Thickness" directly above the LENGTH input. On
                the screen that becomes the invoice. Per-field labels cannot
                come apart from their input at any width. */}
            <div className="flex items-start gap-1.5">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 flex-1 min-w-0">
                <div>
                  <label className={FIELD_LABEL} htmlFor={`area-len-${idx}`}>Length</label>
                  <div className="relative mt-0.5">
                    <input
                      id={`area-len-${idx}`}
                      type="number"
                      inputMode="decimal"
                      placeholder="0"
                      value={area.length}
                      onChange={(e) => patch(idx, { length: e.target.value })}
                      className={`${INPUT} pr-7`}
                    />
                    <Suffix>ft</Suffix>
                  </div>
                </div>
                <div>
                  <label className={FIELD_LABEL} htmlFor={`area-wid-${idx}`}>Width</label>
                  <div className="relative mt-0.5">
                    <input
                      id={`area-wid-${idx}`}
                      type="number"
                      inputMode="decimal"
                      placeholder="0"
                      value={area.width}
                      onChange={(e) => patch(idx, { width: e.target.value })}
                      className={`${INPUT} pr-7`}
                    />
                    <Suffix>ft</Suffix>
                  </div>
                </div>
                <div>
                  <label className={FIELD_LABEL} htmlFor={`area-thk-${idx}`}>Thickness</label>
                  <div className="relative mt-0.5">
                    <input
                      id={`area-thk-${idx}`}
                      type="number"
                      inputMode="decimal"
                      placeholder="0"
                      value={area.thickness}
                      onChange={(e) => patch(idx, { thickness: e.target.value })}
                      className={`${INPUT} pr-8`}
                    />
                    <Suffix>in.</Suffix>
                  </div>
                </div>
                <div>
                  <label className={FIELD_LABEL} htmlFor={`area-qty-${idx}`}>How many</label>
                  <input
                    id={`area-qty-${idx}`}
                    type="number"
                    inputMode="numeric"
                    placeholder="1"
                    value={area.quantity}
                    onChange={(e) => patch(idx, { quantity: e.target.value })}
                    className={`${INPUT} mt-0.5`}
                  />
                </div>
              </div>
              {rows.length > 1 && (
                <RowDelete label={`Remove area row ${idx + 1}`} onClick={() => onChange(rows.filter((_, i) => i !== idx))} />
              )}
            </div>
            {sq > 0 && (
              <span className="mt-1.5 inline-block text-xs font-semibold text-brand bg-brand/10 px-2 py-0.5 rounded-lg">
                {sq.toLocaleString(undefined, { maximumFractionDigits: 0 })} sq ft
              </span>
            )}
          </div>
        );
      })}

      <AddRowButton onClick={() => onChange([...rows, emptyAreaRow()])}>Add Area</AddRowButton>

      {showTotal && totalLabel && <TotalPill label="Total:" value={totalLabel} />}
    </div>
  );
}
