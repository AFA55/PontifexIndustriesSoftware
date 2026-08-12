'use client';

export const dynamic = 'force-dynamic';

/**
 * WORK TICKET — the printable replacement for the customer's carbon-copy field
 * ticket, with a DAY / WEEK toggle.
 *
 * Founder's ask (Aug 2026): "clear work performed for EACH DAY separated, so I
 * can print out their ticket in the format Patriot has now… give me the option
 * to print SAME DAY or PRINT ENTIRE WEEK with their TOTAL TIME… and if I
 * duplicate a job it should separate work performed BY OPERATOR."
 *
 * SUPERSEDES app/dashboard/admin/jobs/[id]/completed-print (now a redirect
 * here): same fields, but per-day + per-operator separation, the real paper
 * structure (4 day blocks, three-copy footer), and a range picker.
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
import { supabase } from '@/lib/supabase';
import { useBranding } from '@/lib/branding-context';
import { workItemDetailLine, workItemQuickNote, type WorkItemLike } from '@/lib/work-items-format';
import { formatDay, formatTime, parseYMDLocal, toLocalYMD } from '@/lib/dates';
import {
  CREW_ROLE_LABEL,
  allPrintedWork,
  sumFootage,
  ticketWorkDetail,
  workTypeUnit,
  type TicketDay,
  type TicketMode,
  type TicketPersonDay,
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
      <span style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>
        {label}
      </span>
      {value ? (
        <span
          style={{
            flex: 1,
            borderBottom: '1px solid #000',
            fontWeight: bold ? 700 : 600,
            fontSize: 11,
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
    padding: '0 5px',
    border: on ? '1.5px solid #000' : '1px solid #bbb',
    fontWeight: on ? 800 : 400,
    color: on ? '#000' : '#888',
    borderRadius: 2,
  });
  return (
    <div>
      <div style={{ fontSize: 7.5, textTransform: 'uppercase', letterSpacing: 0.4, color: '#444' }}>
        {label}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2, fontSize: 10 }}>
        {notRequired ? (
          <span style={{ fontSize: 9.5, color: '#555' }}>Not required</span>
        ) : (
          <>
            <span style={box(signed)}>YES</span>
            <span style={box(!signed)}>NO</span>
          </>
        )}
      </div>
      {signed && (at || by) && (
        <div style={{ fontSize: 7.5, color: '#444', marginTop: 1 }}>
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
        fontSize: 10,
        fontWeight: 800,
        letterSpacing: '0.12em',
        textTransform: 'uppercase',
        padding: '3px 8px',
        marginTop: 6,
        marginBottom: 4,
      }}
    >
      {children}
    </div>
  );
}

/** One work line, rendered with the SHARED formatter (never re-implemented). */
function WorkLine({ item, showNote }: { item: WorkItemLike; showNote: boolean }) {
  const detail = ticketWorkDetail(item, workItemDetailLine);
  const qty = Number(item.quantity);
  // A bare "×54" tells the customer nothing — label it when the work type
  // implies the unit (sawing → LF, coring → holes). Never guessed otherwise.
  const unit = workTypeUnit(item.work_type);
  const parts = [
    item.work_type || 'Work',
    Number.isFinite(qty) && qty > 0 ? (unit ? `${qty} ${unit}` : `×${qty}`) : null,
    detail || null,
  ].filter(Boolean);
  // The operator's quick note is the INTERNAL conditions narrative. This sheet
  // is signed by the customer, so it is OFF by default and only shown when the
  // office explicitly ticks "office notes" in the toolbar.
  const note = showNote ? workItemQuickNote(item) : '';
  return (
    <li style={{ fontSize: 11, lineHeight: 1.45 }}>
      {parts.join(' — ')}
      {note && (
        <span style={{ display: 'block', fontSize: 9.5, fontStyle: 'italic', paddingLeft: 10 }}>
          office note: {note}
        </span>
      )}
    </li>
  );
}

function PersonBlock({
  person,
  showNotes,
  accent,
}: {
  person: TicketPersonDay;
  showNotes: boolean;
  accent: string;
}) {
  const work: WorkItemLike[] = [...person.work_items, ...person.logged_work];
  const times = [
    person.clock_in ? formatTime(person.clock_in) : null,
    person.clock_out ? formatTime(person.clock_out) : null,
  ];
  const timeText =
    times[0] || times[1] ? `${times[0] || '—'} – ${times[1] || 'open'}` : null;

  return (
    <div style={{ breakInside: 'avoid', paddingLeft: 8, borderLeft: `2px solid ${accent}`, marginBottom: 7 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11.5, fontWeight: 800 }}>{person.name}</span>
        <span
          style={{
            fontSize: 8.5,
            fontWeight: 800,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            border: '1px solid #000',
            padding: '0 4px',
          }}
        >
          {CREW_ROLE_LABEL[person.role]}
        </span>
        {timeText && <span style={{ fontSize: 10 }}>{timeText}</span>}
        {person.lunch_minutes != null && person.lunch_minutes > 0 && (
          <span style={{ fontSize: 10 }}>· {person.lunch_minutes} min lunch</span>
        )}
        {person.hours != null && (
          <span style={{ fontSize: 10, fontWeight: 700 }}>· {person.hours.toFixed(2)} hrs</span>
        )}
      </div>

      {(work || []).length > 0 ? (
        <ul style={{ margin: '2px 0 0 14px', listStyle: 'disc' }}>
          {(work || []).map((item, i) => (
            <WorkLine key={(item as { id?: string }).id || `w${i}`} item={item} showNote={showNotes} />
          ))}
        </ul>
      ) : (
        // Nothing was submitted digitally for this person on this day — leave the
        // crew two ruled lines, exactly like the paper ticket.
        <div style={{ margin: '3px 0 0 14px' }}>
          <Blank />
          <div style={{ height: 6 }} />
          <Blank />
        </div>
      )}

      {showNotes && (person.log_note || person.helper_note) && (
        <p style={{ fontSize: 9.5, fontStyle: 'italic', margin: '3px 0 0 14px' }}>
          office note: {[person.log_note, person.helper_note].filter(Boolean).join(' · ')}
        </p>
      )}
    </div>
  );
}

export default function WorkTicketPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: jobId } = use(params);
  const { branding } = useBranding();

  const [mode, setMode] = useState<TicketMode>('day');
  const [anchor, setAnchor] = useState<string>('');
  const [showNotes, setShowNotes] = useState(false);
  const [data, setData] = useState<TicketPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  // Read initial state off the URL (?mode=week&date=YYYY-MM-DD&notes=1). Done in
  // an effect rather than useSearchParams so the page needs no Suspense island.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    if (q.get('mode') === 'week') setMode('week');
    const d = q.get('date');
    if (d && /^\d{4}-\d{2}-\d{2}$/.test(d)) setAnchor(d);
    if (q.get('notes') === '1') setShowNotes(true);
    setReady(true);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token || '';
      const qs = new URLSearchParams({ mode });
      if (anchor) qs.set('date', anchor);
      const res = await fetch(`/api/admin/jobs/${jobId}/work-ticket?${qs.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      });
      const json = await res.json();
      if (!res.ok || !json?.success) {
        setError(json?.error || 'Could not load the ticket.');
        return;
      }
      setData(json.data as TicketPayload);
      // The API resolves the default anchor (today, else the last day worked) —
      // adopt it so the picker and the URL agree with what is on the page.
      if (!anchor && json.data?.anchor_date) setAnchor(json.data.anchor_date);
    } catch {
      setError('Could not load the ticket.');
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
    if (showNotes) q.set('notes', '1');
    window.history.replaceState(null, '', `${window.location.pathname}?${q.toString()}`);
  }, [ready, mode, anchor, showNotes]);

  const step = (dir: -1 | 1) => {
    const base = anchor || toLocalYMD();
    const d = parseYMDLocal(base);
    d.setDate(d.getDate() + dir * (mode === 'week' ? 7 : 1));
    setAnchor(toLocalYMD(d));
  };

  const accent = branding.primary_color || '#DC2626';
  const days = data?.days || [];
  const footage = useMemo(() => sumFootage(allPrintedWork(days)), [days]);

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

  // Flatten to the paper's day blocks: one row per person per day.
  const hourRows = (days || []).flatMap((d) => (d.people || []).map((p) => ({ date: d.date, p })));
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
            {(['day', 'week'] as TicketMode[]).map((m) => (
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
                {m === 'day' ? 'Same day' : 'Entire week'}
              </button>
            ))}
          </div>

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

          <label style={{ fontSize: 12, color: '#52525b', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <input type="checkbox" checked={showNotes} onChange={(e) => setShowNotes(e.target.checked)} />
            Office notes (not customer-facing)
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
                  onClick={() => setAnchor(d)}
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
      {error && !loading && <p style={{ padding: 24, fontSize: 13, color: '#b91c1c' }}>{error}</p>}

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
                {companyLine && <p style={{ fontSize: 9.5, margin: '2px 0 0' }}>{companyLine}</p>}
                {branding.support_phone && <p style={{ fontSize: 9.5, margin: 0 }}>{branding.support_phone}</p>}
              </div>
            </div>

            <div style={{ width: '2.5in', flexShrink: 0 }}>
              {/* Ticket No. = the PRE-PRINTED number on the paper pad. We can't
                  know it, so it stays a blank the office writes for cross-ref. */}
              <div style={{ marginBottom: 4 }}>
                <Field label="Ticket No." />
              </div>
              <div style={{ textAlign: 'right', marginBottom: 4 }}>
                <p style={{ fontSize: 8.5, fontWeight: 800, letterSpacing: '0.14em', margin: 0 }}>JOB NO.</p>
                <p style={{ fontSize: 19, fontWeight: 900, fontFamily: 'monospace', lineHeight: 1, margin: 0, color: accent }}>
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

          {/* ── Description of work performed — BY DAY, BY OPERATOR ── */}
          <SectionBar accent={accent}>
            Description of Work Performed{data.mode === 'week' ? ' — Week' : ''}
          </SectionBar>
          {data.job.description && (
            <p style={{ fontSize: 9.5, fontStyle: 'italic', margin: '0 0 6px' }}>
              Scope: {data.job.description}
            </p>
          )}

          {(days || []).length === 0 ? (
            // Nothing digital in this range — hand the crew a clean write-in area.
            <div style={{ border: '1px solid #000', padding: 8 }}>
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <div key={i} style={{ marginBottom: 9 }}>
                  <Blank />
                </div>
              ))}
            </div>
          ) : (
            /* TWO DAYS ACROSS (founder, Aug 12: "make it landscape mode… we
               gotta try to fit all of this in one page"). Landscape buys width,
               not height, so one day per full-width row spent the format's only
               advantage: a five-day week was five stacked blocks and three
               pages. Side by side it is three rows and one page. */
            <div
              style={{
                display: 'grid',
                // Adaptive: one day gets the full width, a short week goes
                // two across, a full week three. A busy five-day week still
                // runs to a second page — the work detail is the point of the
                // sheet and is not worth shrinking to illegibility to save
                // paper — but a single day and a light week now fit one.
                gridTemplateColumns:
                  (days || []).length >= 5 ? '1fr 1fr 1fr'
                  : (days || []).length > 1 ? '1fr 1fr'
                  : '1fr',
                columnGap: 18,
              }}
            >
            {(days || []).map((day) => (
              <div key={day.date} style={{ breakInside: 'avoid', marginBottom: 9 }}>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    borderBottom: '1.5px solid #000',
                    paddingBottom: 2,
                    marginBottom: 4,
                  }}
                >
                  <span style={{ fontSize: 11.5, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    {formatDay(day.date, { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' })}
                  </span>
                  <span style={{ fontSize: 11, fontWeight: 800 }}>{day.total_hours.toFixed(2)} hrs</span>
                </div>
                {(day.people || []).map((p) => (
                  <PersonBlock key={`${day.date}-${p.user_id}`} person={p} showNotes={showNotes} accent={accent} />
                ))}
              </div>
            ))}
            </div>
          )}

          {/* ── Day blocks (the paper's Date / Job Hours / Lunch / Total grid) ── */}
          <SectionBar accent={accent}>Job Hours</SectionBar>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
            <thead>
              <tr>
                {['Date', 'Employee', 'Start', 'End', 'Lunch', 'Total', 'Office Use Only'].map((h) => (
                  <th
                    key={h}
                    style={{
                      border: '1px solid #000',
                      padding: '2px 4px',
                      fontSize: 8.5,
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
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
                  <td style={cell}>{formatDay(date, { month: 'numeric', day: 'numeric', year: '2-digit' })}</td>
                  <td style={cell}>
                    {p.name} <span style={{ fontSize: 8 }}>({CREW_ROLE_LABEL[p.role]})</span>
                  </td>
                  <td style={cell}>{p.clock_in ? formatTime(p.clock_in) : ''}</td>
                  <td style={cell}>{p.clock_out ? formatTime(p.clock_out) : ''}</td>
                  <td style={cell}>{p.lunch_minutes != null && p.lunch_minutes > 0 ? `${p.lunch_minutes} min` : ''}</td>
                  <td style={{ ...cell, textAlign: 'right', fontWeight: 700 }}>
                    {p.hours != null ? p.hours.toFixed(2) : ''}
                  </td>
                  {/* Payroll/office writes here after the fact — always blank. */}
                  <td style={{ ...cell, height: 16 }} />
                </tr>
              ))}
              {Array.from({ length: padRows }).map((_, i) => (
                <tr key={`pad-${i}`}>
                  {Array.from({ length: 7 }).map((__, c) => (
                    <td key={c} style={{ ...cell, height: 18 }} />
                  ))}
                </tr>
              ))}
              <tr>
                <td colSpan={5} style={{ ...cell, textAlign: 'right', fontWeight: 800, textTransform: 'uppercase', fontSize: 9 }}>
                  Total time{data.mode === 'week' ? ' (week)' : ''}
                </td>
                <td style={{ ...cell, textAlign: 'right', fontWeight: 900, fontSize: 12 }}>
                  {data.totals.hours.toFixed(2)}
                </td>
                <td style={cell} />
              </tr>
            </tbody>
          </table>

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

          {/* ── Totals strip ── */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(6, 1fr)',
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
            <Field label="Total Hours" value={data.totals.hours.toFixed(2)} bold />
            {/* Total footage cut was the one answer the removed checklist knew.
                It belongs on the sheet, so it moved here instead of vanishing. */}
            <Field
              label="Total Cut"
              value={
                [
                  footage.linearFeet > 0 ? `${footage.linearFeet} LF` : null,
                  footage.cores > 0 ? `${footage.cores} cores` : null,
                ]
                  .filter(Boolean)
                  .join(' · ') || null
              }
              bold
            />
            <Field
              label="Standby Time"
              value={data.totals.standby_hours > 0 ? `${data.totals.standby_hours} hrs` : null}
            />
            {/* Crew initials the ticket in the field — always blank. */}
            <Field label="Initials" />
          </div>

          {/* ── Signatures ── */}
          <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 20, marginTop: 14, breakInside: 'avoid' }}>
            <div>
              {data.job.signature_url ? (
                <div style={{ height: 40, display: 'flex', alignItems: 'flex-end', borderBottom: '1px solid #000' }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={data.job.signature_url} alt="" style={{ maxHeight: 38, objectFit: 'contain' }} />
                </div>
              ) : (
                <div style={{ height: 40, borderBottom: '1px solid #000' }} />
              )}
              <p style={{ fontSize: 8.5, textTransform: 'uppercase', letterSpacing: '0.05em', margin: '2px 0 0' }}>
                Customer Approval Signature
              </p>
              {/* One row instead of two stacked — landscape has the width, and
                  the page does not have the height. */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 0.6fr', gap: 10, marginTop: 5 }}>
                <Field label="Print Name" value={data.job.signer_name} />
                {/* The customer's company is not stored — hand-written. */}
                <Field label="Company" />
                <Field
                  label="Date"
                  value={
                    data.job.signed_at
                      ? new Date(data.job.signed_at).toLocaleDateString('en-US', {
                          month: 'numeric',
                          day: 'numeric',
                          year: '2-digit',
                        })
                      : null
                  }
                />
              </div>
            </div>
            <div>
              {/* Wet-ink employee signature — always blank. */}
              <div style={{ height: 40, borderBottom: '1px solid #000' }} />
              <p style={{ fontSize: 8.5, textTransform: 'uppercase', letterSpacing: '0.05em', margin: '2px 0 0' }}>
                Employee Signature
              </p>
              <div style={{ marginTop: 8 }}>
                <Field label="Crew" value={[data.job.lead_name, data.job.helper_name].filter(Boolean).join(' + ') || null} />
              </div>
            </div>
          </div>

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
