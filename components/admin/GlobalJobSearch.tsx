'use client';

/**
 * The header search box — the working one.
 *
 * What was here before was an `<input>` with a placeholder and no `onChange`,
 * no state, no query and no results. It looked like a search bar and did
 * nothing, while the founder read job numbers out of chat messages with no way
 * to look them up.
 *
 * Behaviour, in the order it matters:
 *  - Job number first. `JOB-2026-793440`, `793440`, `2026-793440` and lowercase
 *    all find the same job (see `lib/job-search.ts`), as do the QA, TEST and
 *    DEMO prefixes.
 *  - Customer name and site address too, because the placeholder promised them.
 *  - Every result is a real `<Link>`, so cmd-click and "open in new tab" work.
 *    Not a div with an onClick.
 *  - 300 ms debounce, and an in-flight request whose query is stale is
 *    discarded rather than allowed to overwrite a newer one.
 *  - Escape closes. Arrow keys move. Enter opens.
 *  - An empty result set SAYS "No jobs match" — a dropdown that renders nothing
 *    reads as broken.
 *
 * Layout: an inline field from `sm:` up (unchanged from the dead input's
 * breakpoint, so the crowded header does not overflow at 375 px), and below
 * that a 44 px icon button that opens a full-width sheet.
 *
 * WHY BOTH PANELS GO THROUGH A PORTAL
 * ───────────────────────────────────
 * This component is mounted inside `app/dashboard/admin/layout.tsx`'s
 * `<header className="sticky top-0 z-30">`. `position: sticky` with a numeric
 * z-index CREATES A STACKING CONTEXT, which means nothing rendered inside that
 * header can paint above z-30 relative to the page, no matter what z-index it
 * declares for itself. Two things then sit on top of the results:
 *
 *  - Eight admin pages open with their own `sticky top-0 z-40` toolbar inside
 *    `<main>` — and `<main>` has no z-index, so those bars live in the ROOT
 *    stacking context where z-40 beats the whole header. On /dashboard/admin/
 *    billing the founder types a job number and the results render BEHIND an
 *    opaque bar, which reads as "the search returned nothing".
 *  - `components/DashboardSidebar.tsx` renders its mobile hamburger
 *    `fixed top-safe-3 left-3 z-50`, also in the root context. It covers
 *    x=12–56, y=12–56 — exactly where the sheet's search input starts — so it
 *    swallowed the tap on the field.
 *
 * Raising the header to z-50 is NOT the fix: the sidebar is earlier in the DOM,
 * so at equal z its drawer panel would lose the tie and slide under the header.
 * Instead both panels are portalled to `document.body` at z-[60], above the
 * sticky page bars (z-40) and the sidebar (z-50) alike. The desktop panel is
 * positioned from the anchor's `getBoundingClientRect()` and re-measured on
 * scroll (capture phase, so the `<main>` scroller counts) and resize.
 */

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Search, Loader2, X, MapPin, Building2, Hash } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { canSearchJobs, type JobSearchResult } from '@/lib/job-search';
import { formatDay } from '@/lib/dates';

const DEBOUNCE_MS = 300;
const MIN_QUERY_LENGTH = 2;

/** Panels sit above the sticky page toolbars (z-40) and the sidebar (z-50). */
const PANEL_Z = 60;

interface Props {
  /** The signed-in user's role. Undefined while auth is still resolving. */
  role: string | null | undefined;
  /**
   * Render the below-`sm:` icon trigger. The header has room for it only when
   * the role carries ONE action button; `supervisor` carries two (New Visit and
   * New Job) and a 360 px viewport then overflows, which the parent's
   * `overflow-hidden` clips rather than scrolls. Defaults to true. See the note
   * at the call site in `app/dashboard/admin/layout.tsx`.
   */
  showMobileTrigger?: boolean;
}

// ── Data ────────────────────────────────────────────────────────────────────

async function fetchResults(q: string, signal: AbortSignal): Promise<JobSearchResult[]> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return [];
  const res = await fetch(`/api/admin/search/jobs?q=${encodeURIComponent(q)}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal,
  });
  if (!res.ok) throw new Error(`Search failed (HTTP ${res.status})`);
  const json = await res.json();
  return (json?.data?.results ?? []) as JobSearchResult[];
}

// ── Result row ──────────────────────────────────────────────────────────────

function MatchIcon({ matchedOn }: { matchedOn: JobSearchResult['matched_on'] }) {
  const cls = 'w-4 h-4 flex-shrink-0';
  if (matchedOn === 'customer') return <Building2 className={`${cls} text-sky-500`} aria-hidden />;
  if (matchedOn === 'address') return <MapPin className={`${cls} text-emerald-500`} aria-hidden />;
  return <Hash className={`${cls} text-brand`} aria-hidden />;
}

function ResultRow({
  job,
  active,
  optionId,
  onNavigate,
}: {
  job: JobSearchResult;
  active: boolean;
  optionId: string;
  onNavigate: () => void;
}) {
  // A bare 'YYYY-MM-DD' from a `date` column. `formatDay` parses it at LOCAL
  // midnight — `new Date(str)` here would render the previous day.
  const dateLabel = job.scheduled_date ? formatDay(job.scheduled_date) : null;
  const subtitle = job.customer_name || job.project_name || null;

  return (
    <li id={optionId} role="option" aria-selected={active}>
      <Link
        href={`/dashboard/admin/jobs/${job.id}`}
        onClick={onNavigate}
        tabIndex={-1}
        className={`
          flex items-start gap-3 px-3 py-2.5 min-h-[44px] rounded-lg transition-colors
          ${active
            ? 'bg-brand/10 dark:bg-brand/20'
            : 'hover:bg-slate-100 dark:hover:bg-white/10'}
        `}
      >
        <span className="mt-0.5">
          <MatchIcon matchedOn={job.matched_on} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-slate-900 dark:text-white truncate">
            {job.job_number || 'No job number'}
          </span>
          {subtitle && (
            <span className="block text-sm text-slate-600 dark:text-white/65 truncate">
              {subtitle}
            </span>
          )}
          {job.matched_on === 'address' && job.address && (
            <span className="block text-sm text-slate-500 dark:text-white/50 truncate">
              {job.address}
            </span>
          )}
        </span>
        {dateLabel && (
          <span className="text-sm text-slate-400 dark:text-white/40 flex-shrink-0 whitespace-nowrap">
            {dateLabel}
          </span>
        )}
      </Link>
    </li>
  );
}

// ── Component ───────────────────────────────────────────────────────────────

export default function GlobalJobSearch({ role, showMobileTrigger = true }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const listboxId = useId();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<JobSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  /** The query the current `results` belong to — drives the empty-state copy. */
  const [resultsFor, setResultsFor] = useState('');
  const [sheetOpen, setSheetOpen] = useState(false);

  /** Where the portalled desktop panel should sit, in viewport coordinates. */
  const [anchor, setAnchor] = useState<{ top: number; left: number; width: number } | null>(null);
  /** Portals need a DOM; this stays false through SSR and the first render. */
  const [mounted, setMounted] = useState(false);

  const rootRef = useRef<HTMLDivElement>(null);
  const anchorRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const desktopInputRef = useRef<HTMLInputElement>(null);
  const sheetInputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => setMounted(true), []);

  const allowed = canSearchJobs(role);
  const trimmed = query.trim();
  const longEnough = trimmed.length >= MIN_QUERY_LENGTH;

  // ── Debounced fetch ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!allowed) return;
    if (!longEnough) {
      abortRef.current?.abort();
      setResults([]);
      setResultsFor('');
      setLoading(false);
      setError(null);
      return;
    }

    setError(null);
    // `loading` is raised INSIDE the debounce, not on the keystroke. Setting it
    // per-character swapped the clear (X) button for a spinner on every letter
    // typed, so the X flickered in and out while the founder was still typing.
    const timer = setTimeout(() => {
      setLoading(true);
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      fetchResults(trimmed, controller.signal)
        .then((rows) => {
          if (controller.signal.aborted) return;
          setResults(rows);
          setResultsFor(trimmed);
          setActiveIndex(rows.length > 0 ? 0 : -1);
          setLoading(false);
        })
        .catch((e: unknown) => {
          if (controller.signal.aborted) return;
          setResults([]);
          setResultsFor(trimmed);
          setError(e instanceof Error ? e.message : 'Search failed.');
          setLoading(false);
        });
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [trimmed, longEnough, allowed]);

  useEffect(() => () => abortRef.current?.abort(), []);

  // Close the dropdown when the route changes — otherwise clicking a result
  // navigates and leaves the panel hanging over the new page.
  const reset = useCallback(() => {
    setOpen(false);
    setSheetOpen(false);
    setQuery('');
    setResults([]);
    setResultsFor('');
    setActiveIndex(-1);
    setError(null);
  }, []);

  useEffect(() => {
    setOpen(false);
    setSheetOpen(false);
  }, [pathname]);

  // Click outside closes the desktop dropdown. The panel is PORTALLED, so it is
  // no longer a DOM descendant of `rootRef` — testing only the root would treat
  // a click on a result as an outside click and close the panel before the
  // <Link> ever fired. Both subtrees count as "inside".
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (rootRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  // ── Where the portalled desktop panel goes ────────────────────────────────
  // A portal to <body> leaves the panel with no relationship to the input, so
  // its position is measured rather than inherited. Re-measured on scroll in the
  // CAPTURE phase — the page scrolls inside <main>, not on window, and a
  // bubbling scroll listener on window never hears it.
  const measure = useCallback(() => {
    const el = anchorRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setAnchor({ top: r.bottom + 8, left: r.left, width: r.width });
  }, []);

  // `useEffect`, not `useLayoutEffect`: this component is server-rendered inside
  // the admin layout and `useLayoutEffect` warns there. Nothing flashes in the
  // wrong place either way — the panel is not rendered at all until `anchor` has
  // been measured.
  useEffect(() => {
    if (!open) return;
    measure();
    window.addEventListener('scroll', measure, true);
    window.addEventListener('resize', measure);
    return () => {
      window.removeEventListener('scroll', measure, true);
      window.removeEventListener('resize', measure);
    };
  }, [open, measure]);

  // Lock body scroll while the mobile sheet is up.
  useEffect(() => {
    if (!sheetOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    sheetInputRef.current?.focus();
    return () => {
      document.body.style.overflow = prev;
    };
  }, [sheetOpen]);

  const panelVisible = open || sheetOpen;

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      if (sheetOpen) reset();
      else setOpen(false);
      return;
    }
    if (!panelVisible) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => (results.length === 0 ? -1 : (i + 1) % results.length));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) =>
        results.length === 0 ? -1 : (i - 1 + results.length) % results.length
      );
    } else if (e.key === 'Enter') {
      const job = results[activeIndex];
      if (job) {
        e.preventDefault();
        // Programmatic navigation for the keyboard path only; the visible
        // control is still a real <Link>, so mouse users keep cmd-click,
        // middle-click and "open in new tab".
        reset();
        router.push(`/dashboard/admin/jobs/${job.id}`);
      }
    }
  };

  const panel = useMemo(() => {
    if (!longEnough) {
      return (
        <p className="px-3 py-3 text-sm text-slate-500 dark:text-white/55">
          Type a job number, customer or address — at least {MIN_QUERY_LENGTH} characters.
        </p>
      );
    }
    // "Searching" covers the debounce window too — `resultsFor` still names an
    // older query, and `loading` alone would leave the panel claiming "No jobs
    // match" for 300 ms before the request had even been sent.
    if (loading || resultsFor !== trimmed) {
      return (
        <p className="flex items-center gap-2 px-3 py-3 text-sm text-slate-500 dark:text-white/55">
          <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
          Searching…
        </p>
      );
    }
    if (error) {
      return (
        <p className="px-3 py-3 text-sm text-rose-600 dark:text-rose-300" role="alert">
          {error}
        </p>
      );
    }
    if (results.length === 0) {
      // Never render an empty panel — an empty dropdown reads as broken.
      return (
        <p className="px-3 py-3 text-sm text-slate-500 dark:text-white/55">
          No jobs match <span className="font-semibold text-slate-700 dark:text-white/80">{resultsFor}</span>.
        </p>
      );
    }
    return (
      <ul id={listboxId} role="listbox" aria-label="Job search results" className="py-1 space-y-0.5">
        {results.map((job, i) => (
          <ResultRow
            key={job.id}
            job={job}
            active={i === activeIndex}
            optionId={`${listboxId}-opt-${i}`}
            onNavigate={reset}
          />
        ))}
      </ul>
    );
  }, [longEnough, loading, error, results, resultsFor, trimmed, activeIndex, listboxId, reset]);

  // A role the search API refuses gets no box at all, rather than a box that
  // 403s. Conditional render, never `hidden={...}` — Tailwind's flex utilities
  // beat `[hidden]{display:none}` at equal specificity.
  if (!allowed) return null;

  const inputClasses = `
    bg-transparent text-sm outline-none flex-1 min-w-0
    text-gray-700 placeholder-gray-400
    dark:text-white dark:placeholder-white/40
  `;

  return (
    <>
      {/* ── Mobile trigger (below sm) ───────────────────────────────────── */}
      {/* Conditional render, never `hidden={...}`: Tailwind's `inline-flex`
          beats `[hidden]{display:none}` at equal specificity and the button
          would show anyway. */}
      {showMobileTrigger && (
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          aria-label="Search jobs"
          className="
            sm:hidden inline-flex items-center justify-center w-11 h-11 rounded-lg flex-shrink-0
            text-gray-500 hover:bg-gray-100
            dark:text-white/60 dark:hover:bg-white/10 transition-colors
          "
        >
          <Search className="w-5 h-5" aria-hidden />
        </button>
      )}

      {/* ── Desktop inline field (sm and up) ────────────────────────────── */}
      <div ref={rootRef} className="hidden sm:block relative w-64 xl:w-80">
        <div
          ref={anchorRef}
          className="
            flex items-center gap-2 rounded-lg px-3 py-2 min-h-[44px]
            bg-gray-100
            dark:bg-white/5 dark:border dark:border-white/10
          "
        >
          <Search className="w-4 h-4 text-gray-400 dark:text-white/45 flex-shrink-0" aria-hidden />
          <input
            ref={desktopInputRef}
            type="text"
            role="combobox"
            aria-expanded={open}
            aria-controls={listboxId}
            aria-autocomplete="list"
            aria-activedescendant={
              open && activeIndex >= 0 ? `${listboxId}-opt-${activeIndex}` : undefined
            }
            aria-label="Search jobs by number, customer or address"
            placeholder="Search job #, customer, address"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={onKeyDown}
            className={inputClasses}
          />
          {loading && (
            <Loader2 className="w-4 h-4 animate-spin text-gray-400 dark:text-white/45 flex-shrink-0" aria-hidden />
          )}
          {query.length > 0 && !loading && (
            <button
              type="button"
              onClick={() => {
                setQuery('');
                desktopInputRef.current?.focus();
              }}
              aria-label="Clear search"
              className="p-1 -mr-1 rounded text-gray-400 hover:text-gray-600 dark:text-white/45 dark:hover:text-white"
            >
              <X className="w-4 h-4" aria-hidden />
            </button>
          )}
        </div>

      </div>

      {/* ── Desktop results, portalled out of the sticky header ─────────── */}
      {/* `position: fixed` + measured coordinates rather than `absolute`: the
          panel's containing block is now <body>, not the input's wrapper. */}
      {mounted && open && anchor &&
        createPortal(
          <div
            ref={panelRef}
            style={{
              position: 'fixed',
              top: anchor.top,
              left: anchor.left,
              width: anchor.width,
              zIndex: PANEL_Z,
            }}
            className="
              hidden sm:block rounded-xl shadow-lg overflow-hidden
              max-h-[70vh] overflow-y-auto
              bg-white border border-slate-200
              dark:bg-[#140a26] dark:border-white/10
            "
          >
            {panel}
          </div>,
          document.body
        )}

      {/* ── Mobile full-width sheet ─────────────────────────────────────── */}
      {mounted && sheetOpen &&
        createPortal(
        <div
          className="sm:hidden fixed inset-0 bg-black/40 dark:bg-black/60"
          style={{ zIndex: PANEL_Z }}
          onClick={(e) => {
            if (e.target === e.currentTarget) reset();
          }}
          role="dialog"
          aria-modal="true"
          aria-label="Search jobs"
        >
          <div className="bg-white dark:bg-[#140a26] pt-safe-3 pb-3 px-3 shadow-xl">
            <div className="flex items-center gap-2">
              <div
                className="
                  flex items-center gap-2 flex-1 min-w-0 rounded-lg px-3 min-h-[44px]
                  bg-gray-100 dark:bg-white/5 dark:border dark:border-white/10
                "
              >
                <Search className="w-4 h-4 text-gray-400 dark:text-white/45 flex-shrink-0" aria-hidden />
                <input
                  ref={sheetInputRef}
                  type="text"
                  role="combobox"
                  aria-expanded
                  aria-controls={listboxId}
                  aria-autocomplete="list"
                  aria-activedescendant={
                    activeIndex >= 0 ? `${listboxId}-opt-${activeIndex}` : undefined
                  }
                  aria-label="Search jobs by number, customer or address"
                  placeholder="Job #, customer, address"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={onKeyDown}
                  className={inputClasses}
                />
                {loading && (
                  <Loader2 className="w-4 h-4 animate-spin text-gray-400 dark:text-white/45 flex-shrink-0" aria-hidden />
                )}
              </div>
              <button
                type="button"
                onClick={reset}
                className="
                  inline-flex items-center justify-center min-w-[44px] min-h-[44px] px-2 rounded-lg
                  text-sm font-medium text-slate-600 hover:bg-slate-100
                  dark:text-white/70 dark:hover:bg-white/10
                "
              >
                Cancel
              </button>
            </div>
            <div className="mt-2 max-h-[60vh] overflow-y-auto">{panel}</div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
