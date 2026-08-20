'use client';

export const dynamic = 'force-dynamic';

/**
 * WORK TICKET — the printable replacement for the customer's carbon-copy field
 * ticket. TWO COLUMNS: work performed on the left, job hours on the right.
 *
 * THE LAYOUT (founder, Aug 19, having asked for it once before):
 *
 *   "I told you previously to change layout — work performed on one side and
 *    time and dates on other. We don't need to see what they did every day when
 *    we print ticket. We need to see work performed on one side, and their
 *    times for each day and total times on another side. We need to get this
 *    fully functional and correct so we don't have issues trying to figure out
 *    who was where and when."
 *
 * LEFT is the scope — cut types, quantities, depths, totals, added up across
 * the whole ticket. Which day a measurement was typed on is an accident of when
 * the operator opened the app, so the sheet no longer organises the scope by it.
 * RIGHT is the roster — every person, every day, in / out / lunch / total, then
 * the grand total. That is the "who was where and when" answer.
 *
 * THE WINDOW is the ENTIRE JOB by default. It used to be a single day, anchored
 * on the last day worked, and that is the whole of the bug the founder hit:
 * JOB-2026-793440 printed Tuesday while Monday's 22.75 hours sat untouched in
 * the database. "Same day" and "Entire week" remain in the toolbar for printing
 * a slice on purpose.
 *
 * SUPERSEDES app/dashboard/admin/jobs/[id]/completed-print (now a redirect
 * here): same fields, plus the two-column split and a range picker.
 *
 * FILLED vs BLANK — a carbon form is half pre-printed, half hand-written. What
 * the SYSTEM knows prints FILLED (customer, address, job no., dates, clock
 * times, lunch, totals, work performed + measurements, footage, subsistence,
 * captured signature). What the CREW writes in the field stays a ruled blank
 * line (paper ticket no., standby initials, temp labor, disposal loads, slurry
 * barrels, removal dimensions, the customer's wet-ink signatures). Every choice
 * is commented at its render site.
 *
 * PRINT: letter LANDSCAPE, one page, print-isolated, forced white background / black text
 * (never inherit the app's dark theme). Tenant-branded via useBranding() — no
 * tenant name or color is hardcoded.
 */

import { useCallback, useEffect, useMemo, useState, use } from 'react';
import Link from 'next/link';
import { Printer, ChevronLeft, ChevronRight, ArrowLeft } from 'lucide-react';
import { authedFetch } from '@/lib/authed-fetch';
import { describePrintError } from '@/lib/print-failure';
import { reportClientFailure } from '@/lib/report-error';
import { useBranding } from '@/lib/branding-context';
import { workItemQuickNote } from '@/lib/work-items-format';
import { formatDay, formatTime, parseYMDLocal, toLocalYMD } from '@/lib/dates';
import { currentPathForNext, loginHrefForPath } from '@/lib/login-redirect';
import {
  CREW_ROLE_LABEL,
  aggregateWorkPerformed,
  allPrintedWork,
  closeoutFilingDates,
  sumFootage,
  type TicketDay,
  type TicketMode,
  type TicketRange,
} from '@/lib/work-ticket';
import { TICKET_COPY_FOOTER } from '@/lib/legal/prework-understandings';

interface TicketJob {
  id: string;
  job_number: string;
  status: string | null;
  customer_name: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  address: string | null;
  location: string | null;
  description: string | null;
  po_number: string | null;
  job_site_number: string | null;
  project_name: string | null;
  scheduled_date: string | null;
  end_date: string | null;
  lead_name: string | null;
  helper_name: string | null;
  signature_url: string | null;
  signer_name: string | null;
  signed_at: string | null;
  waiver_required: boolean;
  waiver_signed: boolean;
  waiver_signed_at: string | null;
  waiver_signer_name: string | null;
  completion_signed: boolean;
  parent_job: { id: string; job_number: string } | null;
  sibling_jobs: Array<{ id: string; job_number: string }>;
}

interface TicketPayload {
  job: TicketJob;
  mode: TicketMode;
  anchor_date: string;
  range: TicketRange;
  dates_worked: string[];
  days: TicketDay[];
  totals: { hours: number; standby_hours: number; subsistence_nights: number };
  standby: Array<{
    id: string;
    started_at: string | null;
    duration_hours: number | null;
    reason: string | null;
    client_representative_name: string | null;
  }>;
  standby_rate: number;
  standby_minimum_hours: number;
}

/** Ruled write-in line — what the crew fills by hand on the carbon form. */
function Blank({ w = '100%' }: { w?: string }) {
  return (
    <span
      style={{ display: 'inline-block', width: w, borderBottom: '1px solid #000', height: '0.9em' }}
    />
  );
}

/** A labelled field: prints the value when we know it, a ruled blank when we don't. */
function Field({
  label,
  value,
  w = '100%',
  bold,
}: {
  label: string;
  value?: string | null;
  w?: string;
  bold?: boolean;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, minWidth: 0 }}>
      <span style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap', color: '#333' }}>
        {label}
      </span>
      {value ? (
        <span
          style={{
            flex: 1,
            borderBottom: '1px solid #000',
            fontWeight: bold ? 800 : 600,
            fontSize: 13,
            lineHeight: 1.3,
            minWidth: 0,
            overflowWrap: 'anywhere',
          }}
        >
          {value}
        </span>
      ) : (
        <span style={{ flex: 1 }}>
          <Blank w={w} />
        </span>
      )}
    </div>
  );
}

/**
 * "Signed: YES / no" with the box round the answer that applies — the founder
 * reads this at a glance to know whether a document is outstanding, so the
 * answer has to be visible without reading the label. Prints in black only.
 */
function SignedFlag({
  label,
  signed,
  notRequired,
  at,
  by,
}: {
  label: string;
  signed: boolean;
  notRequired?: boolean;
  at?: string | null;
  by?: string | null;
}) {
  const box = (on: boolean) => ({
    padding: '1px 8px',
    border: on ? '2px solid #000' : '1px solid #ccc',
    fontWeight: on ? 800 : 400,
    color: on ? '#000' : '#888',
    borderRadius: 2,
  });
  return (
    <div>
      <div style={{ fontSize: 9.5, textTransform: 'uppercase', letterSpacing: 0.4, color: '#333', fontWeight: 700 }}>
        {label}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 3, fontSize: 12.5 }}>
        {notRequired ? (
          <span style={{ fontSize: 11.5, color: '#555' }}>Not required</span>
        ) : (
          <>
            <span style={box(signed)}>YES</span>
            <span style={box(!signed)}>NO</span>
          </>
        )}
      </div>
      {signed && (at || by) && (
        <div style={{ fontSize: 9.5, color: '#444', marginTop: 2 }}>
          {[by, at ? new Date(at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : null]
            .filter(Boolean)
            .join(' · ')}
        </div>
      )}
    </div>
  );
}

function SectionBar({ accent, children }: { accent: string; children: React.ReactNode }) {
  return (
    <div
      className="ticket-accent"
      style={{
        background: accent,
        color: '#fff',
        fontSize: 11.5,
        fontWeight: 800,
        letterSpacing: '0.12em',
        textTransform: 'uppercase',
        padding: '4px 9px',
        marginTop: 8,
        marginBottom: 4,
      }}
    >
      {children}
    </div>
  );
}

/** `5" · 6"` — the depths recorded against one work type, or '' when none. */
function depthLabel(depths: number[]): string {
  return depths.map((d) => `${d}"`).join(' · ');
}

/**
 * THE CREW'S OWN WORDS, ONCE FOR THE WHOLE TICKET.
 *
 * Collected across every person and every day, de-duplicated, and printed under
 * the work column — not repeated per day, and never mixed into the hours table.
 * The same sentence usually sits on the work item AND on the day's log, and on
 * a two-day job it also sits on both days.
 *
 * ALWAYS rendered, filled or empty (founder, Aug 12: "leave space blank if they
 * didn't put anything — just so that can be our standard ticket"), so the sheet
 * keeps one shape and the crew knows where to write.
 */
function TicketNotes({ lines, show }: { lines: string[]; show: boolean }) {
  return (
    <div style={{ marginTop: 6 }}>
      <p
        style={{
          fontSize: 8.5,
          fontWeight: 800,
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          color: '#444',
          margin: '0 0 2px',
        }}
      >
        Notes
      </p>
      {show && lines.length > 0 ? (
        lines.map((t, i) => (
          <p key={i} style={{ fontSize: 10.5, lineHeight: 1.35, margin: i === 0 ? 0 : '2px 0 0' }}>
            {t}
          </p>
        ))
      ) : (
        <>
          <Blank />
          <div style={{ height: 6 }} />
          <Blank />
        </>
      )}
    </div>
  );
}

export default function WorkTicketPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: jobId } = use(params);
  const { branding } = useBranding();

  // ENTIRE JOB by default (founder, Aug 19). The sheet used to open on ONE day
  // — the last one worked — and JOB-2026-793440 printed Tuesday only while
  // Monday's ten and twelve hours sat in the database untouched. Day and week
  // are still here for printing a single day's ticket or a payroll week; they
  // are just no longer what you get without asking.
  const [mode, setMode] = useState<TicketMode>('job');
  const [anchor, setAnchor] = useState<string>('');
  // Default ON (Aug 12): the founder's standard ticket carries what the crew
  // typed. The toggle now suppresses that text for a customer-facing copy — the
  // SPACE is always there either way, so the sheet keeps one shape.
  const [showNotes, setShowNotes] = useState(true);
  const [data, setData] = useState<TicketPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  // Distinguished from a plain error: a dead session needs a login, not a retry.
  const [expired, setExpired] = useState(false);
  /**
   * Where "Sign in again" goes. It used to be a bare `/login`, which has no
   * tenant, so it bounced to /company-login → /dashboard — the OPERATOR
   * dashboard for an office admin, complete with its "Demo Operator"
   * placeholder — and never came back to the ticket. This carries the ticket's
   * own path AND its query (?mode=week&date=…) through the login chain, so
   * signing in returns to the exact sheet she was trying to print.
   *
   * In state rather than computed inline: it reads window.location, and the URL
   * is rewritten by the replaceState effect below whenever the day/week picker
   * moves — so it is recomputed on the same inputs.
   */
  const [loginHref, setLoginHref] = useState('/company-login');

  // Read initial state off the URL (?mode=week&date=YYYY-MM-DD&notes=1). Done in
  // an effect rather than useSearchParams so the page needs no Suspense island.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const m = q.get('mode');
    if (m === 'week' || m === 'day' || m === 'job') setMode(m);
    const d = q.get('date');
    if (d && /^\d{4}-\d{2}-\d{2}$/.test(d)) setAnchor(d);
    if (q.get('notes') === '0') setShowNotes(false);
    // Set the return destination HERE, unconditionally, not only in the URL-sync
    // effect below — that one returns early until `anchor` is filled, and
    // `anchor` is only filled by a SUCCESSFUL load. On the failure this panel
    // exists for (expired session → fetch throws → no anchor), the href would
    // still be its bare '/company-login' default and the sign-in would land her
    // on /dashboard/admin instead of the ticket. Same shape as print/page.tsx.
    setLoginHref(loginHrefForPath(currentPathForNext()));
    setReady(true);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setExpired(false);
    try {
      const qs = new URLSearchParams({ mode });
      if (anchor) qs.set('date', anchor);
      // authedFetch, not fetch: this page is opened in a NEW TAB from the job
      // view, and a print tab that mounts with a stale or unreadable token used
      // to print one red line — "Unauthorized. Invalid or expired session." —
      // with no way forward. It now refreshes and retries once before giving up.
      const res = await authedFetch(`/api/admin/jobs/${jobId}/work-ticket?${qs.toString()}`, {
        cache: 'no-store',
      });
      const json = await res.json();
      if (!res.ok || !json?.success) {
        const message = json?.error || 'Could not load the ticket.';
        reportClientFailure({
          type: 'print_failure',
          endpoint: `/api/admin/jobs/${jobId}/work-ticket`,
          status: res.status,
          errorClass: 'HttpError',
          message,
          surface: 'work-ticket:page',
        });
        setError(message);
        return;
      }
      setData(json.data as TicketPayload);
      // The API resolves the default anchor (today, else the last day worked) —
      // adopt it so the picker and the URL agree with what is on the page.
      if (!anchor && json.data?.anchor_date) setAnchor(json.data.anchor_date);
    } catch (e) {
      // Three outcomes, three different things for the reader to do. The middle
      // one used to be invisible: during an auth outage this said "could not
      // load the ticket", which reads as a broken ticket and sends whoever is
      // holding the phone looking for a problem with the JOB.
      const described = describePrintError(e);
      reportClientFailure({
        type: 'print_failure',
        endpoint: `/api/admin/jobs/${jobId}/work-ticket`,
        status: null,
        errorClass: described.errorClass,
        message: described.message,
        surface: 'work-ticket:page',
      });
      setExpired(described.needsLogin);
      setError(
        described.errorClass === 'NetworkError' ? 'Could not load the ticket.' : described.message
      );
    } finally {
      setLoading(false);
    }
  }, [jobId, mode, anchor]);

  useEffect(() => {
    if (ready) void load();
  }, [ready, load]);

  // Keep the URL in step so a chosen day/week can be bookmarked or re-printed.
  useEffect(() => {
    if (!ready || !anchor) return;
    const q = new URLSearchParams({ mode, date: anchor });
    if (!showNotes) q.set('notes', '0');
    window.history.replaceState(null, '', `${window.location.pathname}?${q.toString()}`);
    setLoginHref(loginHrefForPath(currentPathForNext()));
  }, [ready, mode, anchor, showNotes]);

  const step = (dir: -1 | 1) => {
    const base = anchor || toLocalYMD();
    const d = parseYMDLocal(base);
    d.setDate(d.getDate() + dir * (mode === 'week' ? 7 : 1));
    setAnchor(toLocalYMD(d));
  };

  const accent = branding.primary_color || '#DC2626';
  // Memoised so the four rollups below key off a stable array — `data?.days ||
  // []` produces a fresh [] every render and made all of them recompute.
  const days = useMemo<TicketDay[]>(() => data?.days || [], [data]);
  const printedWork = useMemo(() => allPrintedWork(days), [days]);
  const footage = useMemo(() => sumFootage(printedWork), [printedWork]);
  // THE LEFT COLUMN. Totalled across the whole ticket, never per day — see the
  // section comment at its render site.
  const workLines = useMemo(() => aggregateWorkPerformed(printedWork), [printedWork]);
  // The closeout fold's honesty stamp, moved off the (now deleted) per-person
  // blocks and onto a footnote under the work column.
  const filedAtCloseout = useMemo(() => closeoutFilingDates(days), [days]);
  // The crew's own words, once for the whole sheet rather than once per day.
  const noteLines = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    const push = (raw: string | null | undefined) => {
      const t = String(raw || '').trim();
      if (!t) return;
      const k = t.toLowerCase();
      if (seen.has(k)) return;
      seen.add(k);
      out.push(t);
    };
    for (const item of printedWork) push(workItemQuickNote(item));
    for (const day of days) {
      for (const p of day.people) {
        push(p.log_note);
        push(p.helper_note);
      }
    }
    return out;
  }, [days, printedWork]);

  const companyLine =
    [branding.company_address, [branding.company_city, branding.company_state, branding.company_zip]
      .filter(Boolean)
      .join(', ')]
      .filter(Boolean)
      .join(' · ') || branding.pdf_footer_text || '';

  // Printed Date = the days actually WORKED inside the range (a Mon–Sun window
  // where the crew was there Thu+Fri should read "Jul 30 – Jul 31", not the
  // whole calendar week). Falls back to the range when nothing was worked.
  const spanFrom = days.length > 0 ? days[0].date : data?.range.from;
  const spanTo = days.length > 0 ? days[days.length - 1].date : data?.range.to;
  const rangeLabel =
    spanFrom && spanTo
      ? spanFrom === spanTo
        ? formatDay(spanFrom, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
        : `${formatDay(spanFrom, { month: 'short', day: 'numeric' })} – ${formatDay(spanTo, { month: 'short', day: 'numeric', year: 'numeric' })}`
      : '';

  // THE RIGHT COLUMN: one row per person per day, every day anyone was here.
  //
  // `filed_off_job` days are deliberately absent: the office had that person on
  // another job that day and they only filed this job's closeout paperwork from
  // it. Their work still reaches the WORK PERFORMED column (it is often the
  // job's only record of what was cut), but a line in the HOURS table — even
  // one with a blank Total — is a line payroll and invoicing read as a day
  // worked here.
  const hourRows = (days || []).flatMap((d) =>
    (d.people || []).filter((p) => !p.filed_off_job).map((p) => ({ date: d.date, p }))
  );
  // Footnote markers, printed only when the sheet actually contains one.
  // `&& !p.hours_boundary` MIRRORS THE ROW MARK. On a row the ¶ suppresses the †
  // (a divided row is inferred by definition), so a sheet whose ONLY inferred
  // rows are divided ones would print "¶ †" on the grand total with no † row
  // above it and an orphaned † footnote underneath. Unreachable on today's data
  // — every divided card here also carries another job's tag — but the total's
  // test has to be the same test the rows use, or the two drift the first time
  // an untagged card divides.
  const hasAttributed = hourRows.some(({ p }) => p.hours_attributed && !p.hours_boundary);
  const hasScheduledOnly = hourRows.some(({ p }) => p.scheduled_only);
  // A card EXISTS on these days and could not be divided between two jobs. A
  // different fact from `scheduled_only`, and it needs its own mark — see
  // `hours_split` in lib/work-ticket.ts.
  const hasSplit = hourRows.some(({ p }) => p.hours_split);
  // THE DAY WAS SHARED AND THE IN-ROUTE PRESS DIVIDED IT. Its own mark, because
  // In/Out on these rows are the job's bounds rather than the person's clock,
  // the Total is that stretch rather than the card's paid hours, and Lunch is
  // deliberately blank. See `hours_boundary` in lib/work-ticket.ts.
  const hasBoundary = hourRows.some(({ p }) => p.hours_boundary && !p.hours_boundary_board);
  // THE DAY WAS SHARED AND THE OFFICE'S BOARD — NOT THE CREW'S PRESSES —
  // ORDERED IT. `‖` is the next mark in the classic footnote sequence
  // (* † ‡ § ¶ ‖) and it is separate from `¶` on purpose: the ¶ footnote states
  // that In/Out come from clock-in or the In Route press, and on a board-ordered
  // day at least one job on it recorded no press at all. See
  // `hours_boundary_board` in lib/work-ticket.ts for why it is worth a fifth mark.
  const hasBoundaryBoard = hourRows.some(({ p }) => p.hours_boundary_board);
  // A STRICT SUBSET OF THE ABOVE, and NOT a sixth mark. It only adds the
  // sentence in the ‖ footnote that names a sign-off as the line, because that
  // sentence names the stamp an admin would have to correct.
  const hasBoundaryClose = hourRows.some(({ p }) => p.hours_boundary_close);

  /**
   * ROW DENSITY, MEASURED — NOT GUESSED.
   *
   * Letter landscape at the ticket's own 0.3in margin is 998.4 × 758.4 px of
   * printable area. Measured in a browser against the real production row
   * counts (Aug 19 2026, 44 jobs that have any hours):
   *
   *   comfortable rows (2px padding / 10px / 14px office cell)  → 13 rows fit
   *   dense rows       (1px padding / 9.5px / no forced height) → 20 rows fit
   *
   * 43 of the 44 fit one page on that rule; the 44th (JOB-2026-424813, 28
   * person-days over twelve days) runs to 1.13 pages — down from 2.76 on the
   * per-day layout this replaces. Nobody's name clips or wraps at either
   * density: checked with `scrollWidth > clientWidth` on every employee cell.
   *
   * Switching at 10 leaves headroom for the other two variables on the page,
   * a long scope line and a stack of crew notes.
   *
   * THE FLOOR IS 10px, NOT 9.5. On paper a CSS pixel is 3/4 of a point, so 9.5
   * prints at 7.1 pt — below the 8 pt anyone sets a form in, in the Total column
   * the office hand-annotates and reads back to run payroll. Only 4 production
   * jobs cross the >10-row threshold at all, and the floor costs at most one
   * extra page on the largest of them. An unreadable number on the sheet the
   * invoice is written from is the more expensive of the two.
   */
  const denseRows = hourRows.length > 10;
  const hourCell: React.CSSProperties = {
    border: '1px solid #000',
    padding: denseRows ? '1px 3px' : '2px 3px',
    fontSize: 10,
    verticalAlign: 'bottom',
  };
  // The paper form has FOUR day blocks — always print at least four so the crew
  // can add days by hand on a light week.
  // Two spare write-in rows, not four — the old count came from the paper
  // form's fixed four day-blocks and is most of what pushed a short job onto a
  // second page in landscape.
  const padRows = Math.max(0, 2 - hourRows.length);

  // The pre-work understandings and the field checklist no longer PRINT (Aug 12
  // — signed digitally / captured in the app), so neither is built here any
  // more. lib/legal/prework-understandings remains the source of the wording
  // the customer agrees to on screen; don't delete it.

  return (
    <div style={{ background: '#fff', color: '#000', colorScheme: 'light', minHeight: '100vh' }}>
      <style>{`
        @media print {
          /* Landscape, one page (founder, Aug 12: "let's make it landscape mode…
             we gotta try to fit all of this in one page"). Dropping the legal
             verbiage and the Before You Leave checklist is what buys the room —
             both are on this sheet's own line items now or captured in the app. */
          @page { size: letter landscape; margin: 0.3in; }
          html, body { background: #fff !important; }
          body * { visibility: hidden; }
          .work-ticket, .work-ticket * { visibility: visible; }
          .work-ticket { position: absolute; left: 0; top: 0; width: 100%; color: #000 !important; }
          .no-print { display: none !important; }
          .ticket-accent { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      `}</style>

      {/* ── Office toolbar (never printed) ───────────────────────────────── */}
      <div className="no-print" style={{ borderBottom: '1px solid #d4d4d8', background: '#f4f4f5', padding: '10px 16px' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, maxWidth: 1100, margin: '0 auto' }}>
          <Link
            href={`/dashboard/admin/jobs/${jobId}`}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 13, color: '#3f3f46', textDecoration: 'none' }}
          >
            <ArrowLeft className="w-4 h-4" /> Job
          </Link>

          {/* DAY / WEEK — the founder's core control */}
          <div style={{ display: 'inline-flex', border: '1px solid #d4d4d8', borderRadius: 8, overflow: 'hidden' }}>
            {(['job', 'day', 'week'] as TicketMode[]).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                style={{
                  padding: '8px 16px',
                  minHeight: 40,
                  fontSize: 13,
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  border: 'none',
                  cursor: 'pointer',
                  background: mode === m ? accent : '#fff',
                  color: mode === m ? '#fff' : '#3f3f46',
                }}
              >
                {m === 'job' ? 'Entire job' : m === 'day' ? 'Same day' : 'Entire week'}
              </button>
            ))}
          </div>

          {/* The date picker only means something when the window is a day or a
              week. In ENTIRE JOB the range is the job, so it is removed rather
              than shown doing nothing. Conditional render, never `hidden` —
              that loses to `display:flex` at equal specificity. */}
          {mode !== 'job' && (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <button onClick={() => step(-1)} aria-label="Previous" style={navBtn}>
                <ChevronLeft className="w-4 h-4" />
              </button>
              <label style={{ fontSize: 12, color: '#52525b' }}>
                {mode === 'week' ? 'Week of' : 'Date'}{' '}
                <input
                  type="date"
                  value={anchor}
                  onChange={(e) => setAnchor(e.target.value)}
                  style={{ fontSize: 13, padding: '8px 8px', minHeight: 40, border: '1px solid #d4d4d8', borderRadius: 6 }}
                />
              </label>
              <button onClick={() => step(1)} aria-label="Next" style={navBtn}>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}

          <label style={{ fontSize: 12, color: '#52525b', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <input type="checkbox" checked={showNotes} onChange={(e) => setShowNotes(e.target.checked)} />
            Print crew notes (untick for the customer copy)
          </label>

          <button
            onClick={() => window.print()}
            style={{
              marginLeft: 'auto',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '10px 18px',
              minHeight: 44,
              borderRadius: 8,
              border: 'none',
              background: '#18181b',
              color: '#fff',
              fontSize: 14,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            <Printer className="w-4 h-4" /> Print
          </button>
        </div>

        {/* Quick picks — the days this crew was actually on the job */}
        {data && (data.dates_worked || []).length > 0 && (
          <div style={{ maxWidth: 1100, margin: '8px auto 0', display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
            <span style={{ fontSize: 11, color: '#71717a' }}>Days worked:</span>
            {(data.dates_worked || []).map((d) => {
              const active = d >= data.range.from && d <= data.range.to;
              return (
                <button
                  key={d}
                  // In ENTIRE JOB every chip is already in range, so a click
                  // that only moved the anchor would look broken. Treat it as
                  // "print just this day" and move the toggle with it.
                  onClick={() => {
                    if (mode === 'job') setMode('day');
                    setAnchor(d);
                  }}
                  style={{
                    padding: '6px 10px',
                    minHeight: 34,
                    fontSize: 12,
                    borderRadius: 6,
                    cursor: 'pointer',
                    border: `1px solid ${active ? accent : '#d4d4d8'}`,
                    background: active ? `${accent}18` : '#fff',
                    color: '#3f3f46',
                  }}
                >
                  {formatDay(d)}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {loading && <p style={{ padding: 24, fontSize: 13 }}>Loading ticket…</p>}

      {/* A ticket that won't load is someone in the office unable to print.
          Say which of the two problems it is, and give them the button that
          fixes it — the old version printed a red sentence and stopped. */}
      {error && !loading && (
        <div
          className="no-print"
          style={{
            margin: 24,
            padding: 20,
            maxWidth: 560,
            borderRadius: 12,
            border: '1px solid #FCD34D',
            background: '#FFFBEB',
            color: '#78350F',
          }}
        >
          <p style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>
            {expired ? 'Your session expired' : "This ticket didn't load"}
          </p>
          <p style={{ fontSize: 13, lineHeight: 1.5, marginBottom: 14 }}>
            {expired
              ? 'You were signed out in this tab, so the ticket could not be fetched. Signing in again will bring it straight back — nothing has been lost.'
              : error}
          </p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => void load()}
              style={{
                minHeight: 44,
                padding: '0 18px',
                borderRadius: 8,
                border: 'none',
                background: accent,
                color: '#fff',
                fontSize: 14,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Try again
            </button>
            {expired && (
              <Link
                href={loginHref}
                style={{
                  minHeight: 44,
                  display: 'inline-flex',
                  alignItems: 'center',
                  padding: '0 18px',
                  borderRadius: 8,
                  border: '1px solid #D97706',
                  color: '#92400E',
                  fontSize: 14,
                  fontWeight: 700,
                  textDecoration: 'none',
                }}
              >
                Sign in again
              </Link>
            )}
          </div>
        </div>
      )}

      {/* ── The ticket ───────────────────────────────────────────────────── */}
      {data && !loading && (
        <div
          className="work-ticket"
          style={{
            // 10.4in = letter landscape (11in) minus the 0.3in @page margins.
            // It was 8in, sized for the old portrait sheet, which wasted a fifth
            // of the width and pushed the ticket onto a second page.
            maxWidth: '10.4in',
            margin: '0 auto',
            padding: '12px 20px 18px',
            background: '#fff',
            color: '#000',
            fontFamily: 'Arial, Helvetica, sans-serif',
          }}
        >
          {/* ── Header ── */}
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start' }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', minWidth: 0 }}>
              {branding.logo_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={branding.logo_url} alt="" style={{ height: 38, width: 'auto', objectFit: 'contain' }} />
              )}
              <div style={{ minWidth: 0 }}>
                <h1 style={{ fontSize: 17, fontWeight: 900, letterSpacing: '0.02em', lineHeight: 1.1, margin: 0 }}>
                  {branding.company_name}
                </h1>
                {companyLine && <p style={{ fontSize: 11, margin: '2px 0 0' }}>{companyLine}</p>}
                {branding.support_phone && <p style={{ fontSize: 11, margin: 0 }}>{branding.support_phone}</p>}
              </div>
            </div>

            <div style={{ width: '3.1in', flexShrink: 0 }}>
              {/* Ticket No. = the PRE-PRINTED number on the paper pad. We can't
                  know it, so it stays a blank the office writes for cross-ref. */}
              <div style={{ marginBottom: 4 }}>
                <Field label="Ticket No." />
              </div>
              {/* THE JOB ID, unmissable (founder, Aug 12: "clear job ID… and
                  I'd like to add job ID when I print the tickets out as well").
                  It is the number the office files, invoices and searches by,
                  so it is boxed and set large rather than being one small line
                  among the header fields. Prints black-on-white — a coloured
                  number goes grey on a mono office printer. */}
              <div
                style={{
                  border: '2.5px solid #000',
                  borderRadius: 4,
                  padding: '4px 10px 5px',
                  marginBottom: 6,
                  textAlign: 'right',
                }}
              >
                <p style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: '0.18em', margin: 0, color: '#333' }}>
                  JOB ID
                </p>
                <p
                  style={{
                    fontSize: 21,
                    fontWeight: 900,
                    fontFamily: 'ui-monospace, Menlo, Consolas, monospace',
                    lineHeight: 1.1,
                    margin: 0,
                    letterSpacing: '-0.02em',
                    // A wrapped job number is unusable — it is the thing the
                    // office files and searches by. Never break it.
                    whiteSpace: 'nowrap',
                  }}
                >
                  {data.job.job_number}
                </p>
              </div>
              <div style={{ marginBottom: 3 }}>
                <Field label="Date" value={rangeLabel} bold />
              </div>
              {/* PO is filled when the office entered one, blank otherwise. */}
              <Field label="P.O. No." value={data.job.po_number} />
            </div>
          </div>

          <div className="ticket-accent" style={{ height: 3, background: accent, margin: '8px 0 0' }} />

          {/* ── Duplicated-job lineage ──
              One ticket PER JOB ID on purpose: the office duplicates a job to
              send a SECOND crew, and each crew signs their own ticket. We never
              merge the sibling job's work in — we point at it instead. */}
          {(data.job.parent_job || (data.job.sibling_jobs || []).length > 0) && (
            <div
              style={{
                border: `2px solid ${accent}`,
                padding: '4px 8px',
                marginTop: 8,
                fontSize: 10,
                fontWeight: 700,
              }}
            >
              {data.job.parent_job && (
                <span>
                  ADDITIONAL CREW TICKET — this ticket covers only the crew assigned to{' '}
                  {data.job.job_number} (continuation of {data.job.parent_job.job_number}).
                </span>
              )}
              {(data.job.sibling_jobs || []).length > 0 && (
                <span style={{ display: 'block' }}>
                  Other crew ticket{(data.job.sibling_jobs || []).length > 1 ? 's' : ''} on this job — print
                  separately: {(data.job.sibling_jobs || []).map((s) => s.job_number).join(', ')}
                </span>
              )}
            </div>
          )}

          {/* ── Customer / jobsite ── */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '5px 20px', marginTop: 10 }}>
            <Field label="Customer Name" value={data.job.customer_name} bold />
            <Field label="Job No." value={data.job.job_site_number || data.job.job_number} />
            <div style={{ gridColumn: '1 / -1' }}>
              <Field label="Job Address" value={data.job.address} />
            </div>
            {/* City has no column of its own — printed only when the address
                carries a comma-separated city, blank otherwise. */}
            <Field label="City" value={cityFromAddress(data.job.address)} />
            <Field label="Contact" value={data.job.contact_name} />
          </div>

          {/* ── Signatures: STATUS ONLY ──────────────────────────────────────
              Founder, Aug 12: "the pre-work understandings and customer
              agreement just has to show if it's been signed or not, because it
              gets signed digitally. I don't need the verbiage. It just needs to
              say pre-work understanding or liability waiver signed, checked off
              yes or no."

              The full text used to print here for a wet-ink signature. It is
              now signed in the app before the crew starts, so reprinting three
              paragraphs of indemnity language on every ticket wasted a third of
              the page and asked for a signature that already exists. The
              wording itself still lives in lib/legal/prework-understandings and
              is what the customer actually agrees to on screen. */}
          <SectionBar accent={accent}>Signatures</SectionBar>
          <div
            style={{
              border: '1px solid #000',
              padding: '5px 8px',
              display: 'grid',
              gridTemplateColumns: '1fr 1fr 1fr',
              gap: 12,
              breakInside: 'avoid',
            }}
          >
            <SignedFlag
              label="Utility / liability waiver"
              signed={data.job.waiver_signed}
              // A job that never required one is not "missing" it.
              notRequired={!data.job.waiver_required && !data.job.waiver_signed}
              at={data.job.waiver_signed_at}
              by={data.job.waiver_signer_name}
            />
            <SignedFlag
              label="Work completion sign-off"
              signed={data.job.completion_signed}
              at={data.job.signed_at}
              by={data.job.signer_name}
            />
            <Field label="Office initials" />
          </div>

          {/* ══ THE SHEET, IN TWO COLUMNS ═══════════════════════════════════
              Founder, twice — Aug 15 and again Aug 19:

                "I told you previously to change layout — work performed on one
                 side and time and dates on other. We don't need to see what
                 they did every day when we print ticket. We need to see work
                 performed on one side, and their times for each day and total
                 times on another side. We need to get this fully functional and
                 correct so we don't have issues trying to figure out who was
                 where and when."

              LEFT is the SCOPE: what was cut, how much, how deep, totalled
              across the whole ticket. Which day a measurement was typed on is
              an accident of when the operator opened the app, and breaking the
              scope up by that accident is what made a two-day job read as one.
              This is what the invoice is hand-written from.

              RIGHT is the ROSTER: every person, every day, in, out, lunch,
              total, then the grand total. This is "who was where and when", and
              it is now driven by the hours themselves — never by whether
              anybody filed work that day.

              The two are side by side and not interleaved, which is also what
              buys the page: the old sheet repeated a person's name, role,
              times, hours AND their measurements inside every day block. */}
          <div
            style={{
              display: 'grid',
              // The hours side gets the extra width: it carries seven columns and a
              // full name, while WORK PERFORMED is three short ones. Measured —
              // at 0.85/1.15 no employee name clips or wraps at either density.
              gridTemplateColumns: '0.85fr 1.15fr',
              columnGap: 14,
              alignItems: 'start',
            }}
          >
            {/* ══ LEFT — WORK PERFORMED ═══════════════════════════════════ */}
            <div style={{ minWidth: 0 }}>
              <SectionBar accent={accent}>Work Performed</SectionBar>
              {data.job.description && (
                <p style={{ fontSize: 11, fontStyle: 'italic', margin: '0 0 5px' }}>
                  Scope: {data.job.description}
                </p>
              )}

              {workLines.length > 0 ? (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr>
                      {['Work Type', 'Quantity', 'Depth'].map((h) => (
                        <th
                          key={h}
                          style={{
                            border: '1px solid #000',
                            padding: '2px 4px',
                            fontSize: 8.5,
                            textTransform: 'uppercase',
                            letterSpacing: '0.05em',
                            textAlign: h === 'Work Type' ? 'left' : 'right',
                          }}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {workLines.map((t) => (
                      <tr key={t.workType}>
                        <td style={{ ...cell, fontWeight: 700, fontSize: 11 }}>{t.workType}</td>
                        <td style={{ ...cell, textAlign: 'right', fontWeight: 800, width: 88 }}>
                          {t.quantity.toLocaleString(undefined, { maximumFractionDigits: 1 })}
                          {t.unit ? ` ${t.unit}` : ''}
                        </td>
                        {/* Depth priced the job as surely as the footage did.
                            Blank when the crew recorded none — never a guess. */}
                        <td style={{ ...cell, textAlign: 'right', width: 60 }}>
                          {depthLabel(t.depths)}
                        </td>
                      </tr>
                    ))}
                    <tr>
                      <td
                        style={{
                          ...cell,
                          textAlign: 'right',
                          fontWeight: 800,
                          textTransform: 'uppercase',
                          fontSize: 9,
                        }}
                      >
                        Total cut
                      </td>
                      <td colSpan={2} style={{ ...cell, textAlign: 'right', fontWeight: 900, fontSize: 11 }}>
                        {[
                          footage.linearFeet > 0 ? `${footage.linearFeet} LF` : null,
                          footage.cores > 0
                            ? `${footage.cores} core${footage.cores === 1 ? '' : 's'}`
                            : null,
                        ]
                          .filter(Boolean)
                          .join(' · ') || '—'}
                      </td>
                    </tr>
                  </tbody>
                </table>
              ) : (
                // Nothing was submitted digitally for this ticket — hand the
                // crew a clean write-in area, exactly like the paper form.
                <div style={{ border: '1px solid #000', padding: 8 }}>
                  {[0, 1, 2, 3, 4].map((i) => (
                    <div key={i} style={{ marginBottom: 9 }}>
                      <Blank />
                    </div>
                  ))}
                </div>
              )}

              {/* WHEN THE MEASUREMENTS ACTUALLY ARRIVED, when it was not the
                  day they were done. A closeout typed from the next job's truck
                  used to print as a work day here (Dante, 0.09 hrs on a
                  Wednesday he spent at AM King). The hours are gone; this line
                  is what replaced the per-person stamp when the day blocks
                  came off the sheet. Say it plainly rather than re-dating the
                  measurements silently. */}
              {filedAtCloseout.length > 0 && (
                <p style={{ fontSize: 9, fontStyle: 'italic', margin: '3px 0 0' }}>
                  Some measurements were filed at closeout on{' '}
                  {filedAtCloseout
                    .map((d) => formatDay(d, { weekday: 'short', month: 'numeric', day: 'numeric' }))
                    .join(', ')}
                  .
                </p>
              )}

              <TicketNotes lines={noteLines} show={showNotes} />
            </div>

            {/* ══ RIGHT — JOB HOURS ══════════════════════════════════════ */}
            <div style={{ minWidth: 0 }}>
              <SectionBar accent={accent}>
                Job Hours{data.mode === 'week' ? ' — Week' : data.mode === 'day' ? ' — Day' : ''}
              </SectionBar>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr>
                    {['Date', 'Employee', 'In', 'Out', 'Lunch', 'Total', 'Office'].map((h) => (
                      <th
                        key={h}
                        style={{
                          border: '1px solid #000',
                          padding: '2px 3px',
                          fontSize: 8,
                          textTransform: 'uppercase',
                          letterSpacing: '0.04em',
                          textAlign: h === 'Total' ? 'right' : 'left',
                        }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(hourRows || []).map(({ date, p }) => (
                    <tr key={`${date}-${p.user_id}-row`}>
                      <td style={hourCell}>
                        {formatDay(date, { weekday: 'short', month: 'numeric', day: 'numeric' })}
                      </td>
                      <td style={hourCell}>
                        {p.name} <span style={{ fontSize: 7.5 }}>({CREW_ROLE_LABEL[p.role]})</span>
                      </td>
                      <td style={hourCell}>{p.clock_in ? formatTime(p.clock_in) : ''}</td>
                      <td style={hourCell}>{p.clock_out ? formatTime(p.clock_out) : ''}</td>
                      <td style={hourCell}>
                        {p.lunch_minutes != null && p.lunch_minutes > 0 ? `${p.lunch_minutes}m` : ''}
                      </td>
                      <td style={{ ...hourCell, textAlign: 'right', fontWeight: 700 }}>
                        {p.hours != null ? p.hours.toFixed(2) : ''}
                        {/* AN INFERRED HOUR IS NOT A RECORDED ONE. The card
                            carried no job tag and is counted here because the
                            board placed this person on this job that day. The
                            founder writes invoices off this sheet, so the two
                            kinds must not look identical. */}
                        {/* ¶ is the more specific statement and swallows †: a
                            divided row is inferred BY DEFINITION, and two marks
                            on one figure sends the office to two footnotes to
                            learn one thing. */}
                        {/* ‖ where the day's ORDER came from the schedule board
                            because at least one job on it never recorded a
                            press — a weaker inference, and the ¶ footnote's
                            wording would not be supported on this row. One mark
                            or the other, never both: they answer the same
                            question. */}
                        {p.hours_boundary_board && <span style={{ fontWeight: 400 }}>&nbsp;‖</span>}
                        {p.hours_boundary && !p.hours_boundary_board && (
                          <span style={{ fontWeight: 400 }}>&nbsp;¶</span>
                        )}
                        {p.hours_attributed && !p.hours_boundary && (
                          <span style={{ fontWeight: 400 }}>&nbsp;†</span>
                        )}
                        {/* Sent here by the board, nothing clocked. The row
                            prints so the day is not silently missing. */}
                        {p.scheduled_only && <span style={{ fontWeight: 400 }}>‡</span>}
                        {/* A card EXISTS for this day and could not be divided
                            between the two jobs the board sent him to. Its own
                            mark, because "no card" and "card we cannot split"
                            send the office to two different places. */}
                        {p.hours_split && <span style={{ fontWeight: 400 }}>§</span>}
                      </td>
                      {/* Payroll/office writes here after the fact — always blank.
                          The forced write-in height is dropped on a long list; it
                          is what pushed a twelve-day job onto a second page. */}
                      <td style={denseRows ? hourCell : { ...hourCell, height: 14 }} />
                    </tr>
                  ))}
                  {Array.from({ length: padRows }).map((_, i) => (
                    <tr key={`pad-${i}`}>
                      {Array.from({ length: 7 }).map((__, c) => (
                        <td key={c} style={{ ...hourCell, height: 16 }} />
                      ))}
                    </tr>
                  ))}
                  <tr>
                    <td
                      colSpan={5}
                      style={{
                        ...hourCell,
                        textAlign: 'right',
                        fontWeight: 800,
                        textTransform: 'uppercase',
                        fontSize: 9,
                      }}
                    >
                      Total time
                      {data.mode === 'week' ? ' (week)' : data.mode === 'job' ? ' (job)' : ''}
                    </td>
                    <td style={{ ...hourCell, textAlign: 'right', fontWeight: 900, fontSize: 12 }}>
                      {data.totals.hours.toFixed(2)}
                      {/* THE FIGURE THAT GETS INVOICED carries the mark too when
                          any part of it was inferred. The row marks alone put
                          the caveat on the lines, and this is the number the
                          founder actually writes down — a total that looks
                          unqualified while its parts are qualified is where the
                          caveat gets lost. */}
                      {hasBoundaryBoard && (
                        <span style={{ fontWeight: 400, fontSize: 10 }}>&nbsp;‖</span>
                      )}
                      {hasBoundary && <span style={{ fontWeight: 400, fontSize: 10 }}>&nbsp;¶</span>}
                      {hasAttributed && <span style={{ fontWeight: 400, fontSize: 10 }}>&nbsp;†</span>}
                    </td>
                    <td style={hourCell} />
                  </tr>
                </tbody>
              </table>

              {hasAttributed && (
                <p style={{ fontSize: 8.5, margin: '3px 0 0', lineHeight: 1.35 }}>
                  † Hours matched to this job from the schedule — the clock card carried no job tag.
                </p>
              )}
              {/* NOT "no clock card was recorded" — that sentence was false on
                  about ten production person-days and sent payroll hunting for
                  a card that exists. A blank Total here means the hours could
                  not be TIED to this job, which covers all three ways it
                  happens: nothing was clocked at all, the card was tagged to
                  another job (Aiden 8/04, 9.89 hrs on QA-2026-942182), or the
                  day was split. The split case gets its own line below, because
                  it is the one where a card definitely exists. */}
              {hasScheduledOnly && (
                <p style={{ fontSize: 8.5, margin: '2px 0 0', lineHeight: 1.35 }}>
                  ‡ Scheduled on this job; no hours could be tied to it.
                </p>
              )}
              {hasSplit && (
                <p style={{ fontSize: 8.5, margin: '2px 0 0', lineHeight: 1.35 }}>
                  § Hours split across jobs that day — the clock card carried no job tag and the
                  schedule had this person on more than one job.
                </p>
              )}
              {/* The founder's own rule, printed where the number is read:
                  "from the moment they clicked en route to when they clock out
                  is when they were at the other job." IN and OUT on these rows
                  are this job's bounds, not the person's clock; the lunch
                  deduction belongs to the whole day and is not divided, so the
                  cell is blank rather than claiming a deduction was applied. */}
              {hasBoundary && (
                <p style={{ fontSize: 8.5, margin: '2px 0 0', lineHeight: 1.35 }}>
                  ¶ Shared day — In/Out are this job&apos;s hours, from clock-in or the In Route
                  press to the next job&apos;s In Route press or clock-out. That Total is the full
                  clocked stretch with lunch INCLUDED (billable); rows without ¶ show the payroll
                  figure with lunch already deducted. The day&apos;s one lunch is taken on the
                  timecard, not divided between the jobs.
                </p>
              )}
              {/* THE SAME KIND OF ROW, DRAWN FROM A WEAKER FACT — and the office
                  is told which it is looking at. At least one job on the day
                  recorded no In Route press (typically day 2+ of a job, which is
                  pressed once, ever), so the ORDER of the day comes from the
                  schedule board rather than from the crew's stamps.

                  The second sentence appears only when a boundary actually came
                  from a sign-off, because it names the stamp an admin would have
                  to correct. It is deliberately not a sixth mark: both shapes
                  are the same question — "is this division the crew's or the
                  office's?" — and two marks would send the office to two
                  footnotes to learn one thing. */}
              {hasBoundaryBoard && (
                <p style={{ fontSize: 8.5, margin: '2px 0 0', lineHeight: 1.35 }}>
                  ‖ Shared day the crew&apos;s In Route presses could not divide — at least one
                  job that day recorded no press. In/Out are this job&apos;s hours, and the ORDER
                  of the jobs comes from the schedule board; check it before invoicing.
                  {hasBoundaryClose
                    ? ' Where a press was missing the line falls at the moment the earlier job was CLOSED OUT.'
                    : ''}{' '}
                  Same basis as ¶: the full clocked stretch, lunch INCLUDED (billable), and the
                  day&apos;s one lunch stays on the timecard.
                </p>
              )}
            </div>
          </div>

          {/* ── "Before You Leave" checklist: REMOVED (founder, Aug 12) ──
              "Before you leave, we don't need that information."

              It was the paper ticket's numbered field checklist, reprinted
              verbatim for the crew to fill in by hand. The answers that matter
              — slurry disposed off site, concrete removed, barrels used,
              standby time — are moving into the operator's app at the end of
              work-performed entry, so they arrive typed instead of handwritten
              and land on this sheet already answered. Removing it is also most
              of what makes the ticket fit one landscape page.

              The one thing it uniquely surfaced, total footage cut, is already
              on every work line above and in the totals strip below. */}

          {/* ── Totals strip ──
              TOTAL HOURS and TOTAL CUT are NOT here any more. Each is now the
              closing row of the column it belongs to — hours at the foot of JOB
              HOURS, footage at the foot of WORK PERFORMED — and a second copy
              at the bottom of the page is one more number to reconcile when the
              two ever disagree. What is left is what has no column of its own. */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr 1fr 1fr',
              gap: 10,
              marginTop: 6,
              paddingTop: 5,
              borderTop: '1.5px solid #000',
              breakInside: 'avoid',
            }}
          >
            <Field
              label="Subsistence"
              value={data.totals.subsistence_nights > 0 ? String(data.totals.subsistence_nights) : null}
            />
            <Field label="Night Stayed" value={data.totals.subsistence_nights > 0 ? 'Yes' : null} />
            <Field
              label="Standby Time"
              value={data.totals.standby_hours > 0 ? `${data.totals.standby_hours} hrs` : null}
            />
            {/* Crew initials the ticket in the field — always blank. */}
            <Field label="Initials" />
          </div>

          {/* ── Wet-ink signature block: REMOVED (founder, Aug 12) ──────────
              "Let's remove approval signature again — they're supposed to get
               that digitally, so no need for him to have employee signature,
               print name, company and date."

              Customer approval, print name, company, date and the employee
              signature were all ruled lines for a pen. Both signatures are
              captured in the app now, and the SIGNATURES strip at the top of
              this sheet already states whether each one exists, who signed it
              and when — so this was asking the crew to re-collect, by hand, a
              signature the office already holds. The crew names are on every
              row of JOB HOURS above, so nothing is lost with it.

              This is also what finally gets a short week onto one page. */}

          {/* ── Three-copy carbon footer ── */}
          <p
            style={{
              textAlign: 'center',
              fontSize: 8,
              fontWeight: 700,
              letterSpacing: '0.08em',
              marginTop: 14,
              paddingTop: 5,
              borderTop: '1px solid #000',
              // Keep the paper form's wide gaps between the three copy labels.
              whiteSpace: 'pre-wrap',
            }}
          >
            {TICKET_COPY_FOOTER}
          </p>
        </div>
      )}
    </div>
  );
}

const cell: React.CSSProperties = {
  border: '1px solid #000',
  padding: '2px 4px',
  fontSize: 10,
  verticalAlign: 'bottom',
};

const navBtn: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 40,
  height: 40,
  borderRadius: 8,
  border: '1px solid #d4d4d8',
  background: '#fff',
  color: '#3f3f46',
  cursor: 'pointer',
};

/** Best-effort city from a free-text address ("123 Main St, Duncan, SC" → "Duncan, SC").
 *  Returns null when the address has no comma — then the field prints blank so
 *  the crew can write it, rather than printing a guess. */
function cityFromAddress(address: string | null): string | null {
  if (!address || !address.includes(',')) return null;
  const parts = address.split(',').map((s) => s.trim()).filter(Boolean);
  return parts.length > 1 ? parts.slice(1).join(', ') : null;
}
