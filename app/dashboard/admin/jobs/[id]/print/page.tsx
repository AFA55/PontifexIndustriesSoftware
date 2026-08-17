'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState, use } from 'react';
import { authedFetch, isSessionExpired } from '@/lib/authed-fetch';
import { useBranding } from '@/lib/branding-context';
// The measurement + equipment + conditions wording is SHARED with the crew's
// digital ticket (components/ScopeDetailsDisplay). See lib/job-ticket-format.ts
// for why: two screens formatting the same row differently is a recurring bug
// class here, and this sheet gets signed by a customer.
import {
  formatScopeDetails,
  groupJobEquipment,
  layoutEquipmentColumns,
  formatJobsiteConditions,
  formatScopeItems,
  scopeItemsHaveDetail,
  formatPpeAndSafety,
  formatPermits,
} from '@/lib/job-ticket-format';

// ─── Types (subset of /api/admin/jobs/[id]/summary `data`) ─────────────────────

interface PrintJob {
  job_number: string;
  customer_name: string;
  contact_name: string | null;
  customer_phone: string | null;
  /** site_contact_phone, falling back to foreman_phone — what the PDF prints. */
  contact_phone?: string | null;
  job_type: string | null;
  location: string | null;
  address: string | null;
  /** The RAW `job_orders.salesman_name` column — fallback only. */
  salesman_name?: string | null;
  /** Who quoted the job: the column, else the profile behind `created_by`.
   *  Same DERIVED field, same fallback rule, as the react-pdf ticket. */
  quoted_by?: string | null;
  directions?: string | null;
  description: string | null;
  scope_of_work: string | null;
  scheduled_date: string | null;
  end_date: string | null;
  arrival_time: string | null;
  is_will_call: boolean;
  po_number: string | null;
  permit_number: string | null;
  permit_required: boolean;
  /** The RAW permit array. Already in the summary payload; this sheet never
   *  declared it, so the named permit TYPES the react-pdf ticket prints were
   *  loaded and thrown away — "Permit Required: Yes" with no hint it is a HOT
   *  WORK permit. */
  permits?: { type?: string | null; details?: string | null; number?: string | null }[] | null;
  operator_name: string | null;
  project_name?: string | null;
  // Added to the printed ticket (founder: missing jobsite/equipment/details)
  helper_name?: string | null;
  project_manager_name?: string | null;
  difficulty_rating?: number | null;
  additional_notes?: string | null;
  ppe_required?: string[] | null;
  additional_safety_requirements?: string[] | null;
  equipment_needed?: string[] | null;
  equipment_selections?: Record<string, Record<string, unknown>> | null;
  equipment_rentals?: string[] | null;
  equipment_rental_flags?: Record<string, unknown> | null;
  /** Per-service measurements from the schedule form (areas / cuts / holes). */
  scope_details?: Record<string, unknown> | null;
  jobsite_conditions?: Record<string, unknown> | null;
  site_compliance?: Record<string, unknown> | null;
}

interface PrintScopeItem {
  id: string;
  work_type: string;
  description: string | null;
  unit: string;
  target_quantity: number;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(dateStr: string | null) {
  if (!dateStr) return '—';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

function formatTime(time: string | null) {
  if (!time) return null;
  const [hours, minutes] = time.split(':');
  const hour = parseInt(hours);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${minutes} ${ampm}`;
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function PrintJobTicketPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: jobId } = use(params);
  const { branding } = useBranding();

  const [job, setJob] = useState<PrintJob | null>(null);
  const [scope, setScope] = useState<PrintScopeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        // Opened in a new tab from the job view — same session-recovery reason
        // as the work ticket. See lib/authed-fetch.ts.
        const res = await authedFetch(`/api/admin/jobs/${jobId}/summary`);
        if (!res.ok) {
          setError('Could not load job ticket.');
          return;
        }
        const json = await res.json();
        const data = json.data;
        setJob(data?.job ?? null);
        setScope(Array.isArray(data?.scope?.items) ? data.scope.items : []);
      } catch (e) {
        setError(
          isSessionExpired(e)
            ? 'Your session expired in this tab. Sign in again and re-open the job order — nothing has been lost.'
            : 'Could not load job ticket.'
        );
      } finally {
        setLoading(false);
      }
    })();
  }, [jobId]);

  // Auto-open the browser print dialog once the ticket has rendered.
  useEffect(() => {
    if (!loading && job) {
      const t = setTimeout(() => window.print(), 400);
      return () => clearTimeout(t);
    }
  }, [loading, job]);

  if (loading) {
    return <div className="p-8 text-sm text-gray-600">Loading ticket…</div>;
  }

  if (error || !job) {
    return <div className="p-8 text-sm text-red-600">{error || 'Job not found.'}</div>;
  }

  const arrival = formatTime(job.arrival_time);
  const siteAddress = job.address || job.location || '—';
  const siteName =
    job.location && job.location.trim() && job.location.trim() !== (job.address || '').trim()
      ? job.location.trim()
      : '';
  const scopeText = job.scope_of_work || job.description;
  // WORK CONDITIONS. `jobsite_conditions` is `{}` on jobs saved while a separate
  // save bug was live; the shared formatter simply returns [] for that, and the
  // section hides. When the data IS there it prints every ticked condition —
  // including its distance run under EITHER key spelling (`*_ft` today,
  // `*_distance_ft` from the concurrent change): "Power available — 75 ft".
  const conditions = formatJobsiteConditions(job.jobsite_conditions);
  // EVERYTHING selected, grouped by service (founder, Aug 16). The old code
  // showed only the three free-text items and dropped ~16 real picks.
  const equipmentGroups = groupJobEquipment({
    equipment_selections: job.equipment_selections,
    equipment_needed: job.equipment_needed,
    equipment_rentals: job.equipment_rentals,
    equipment_rental_flags: job.equipment_rental_flags,
  });
  // Two balanced newspaper columns, ONE ITEM PER LINE — the same helper the
  // react-pdf ticket uses, so the two sheets cannot drift. This box used to
  // print `group.items.join(' · ')`, i.e. one wrapped paragraph:
  //   "apron · plastic · 32" guard · 480 cord — 200 ft · chain saw (15') · …"
  // Nobody can find a single tool in that at 7am (founder, Aug 17).
  const equipmentColumns = layoutEquipmentColumns(equipmentGroups, 2);
  // The measured scope: areas as dimensions + a computed total, not raw JSON.
  const scopeSections = formatScopeDetails(job.scope_details);
  // SERVICE ITEMS as one resolved measure per row — `48 LF`, not
  // "48 linear_ft" beside a description that repeats the service name.
  const scopeLines = formatScopeItems(scope);
  const showScopeDetail = scopeItemsHaveDetail(scopeLines);
  // PPE — humanised. This sheet printed the raw storage token, so the same job's
  // PPE box read "gloves_cut_3" here and "Gloves Cut Level 3" on the react-pdf
  // ticket. One helper now, so they cannot say different things.
  const ppeAndSafety = formatPpeAndSafety(job.ppe_required, job.additional_safety_requirements);
  // The named permits — same helper, same words, as the react-pdf ticket.
  const permitList = formatPermits(job.permits);
  // QUOTED BY — the DERIVED value, not the raw `salesman_name` column. See the
  // summary route: emitting the derived guess under the column's own name is how
  // an editor pre-filled from that endpoint would persist a guess as fact.
  const quotedBy = job.quoted_by || job.salesman_name || '';
  const compliance = job.site_compliance || {};
  const orientationReq = !!compliance.orientation_required;
  const badgingReq = !!compliance.badging_required;
  const specialInstructions = (compliance.special_instructions as string | undefined) || null;

  return (
    <div className="print-ticket bg-white text-black min-h-screen">
      {/* Print-only styles: LANDSCAPE + hide everything else, show only the ticket */}
      <style>{`
        @media print {
          @page { size: landscape; margin: 0.4in; }
          body * { visibility: hidden; }
          .print-ticket, .print-ticket * { visibility: visible; }
          .print-ticket { position: absolute; left: 0; top: 0; width: 100%; }
          .no-print { display: none !important; }
        }
      `}</style>

      {/* On-screen print button (hidden when printing) */}
      <div className="no-print bg-gray-100 border-b border-gray-300 px-6 py-3 flex items-center justify-between">
        <span className="text-sm text-gray-600">Job ticket — {job.job_number}</span>
        <button
          onClick={() => window.print()}
          className="px-4 py-2 bg-gray-900 text-white text-sm font-semibold rounded-lg hover:bg-gray-800"
        >
          Print
        </button>
      </div>

      {/* py-4 (was py-6) — see the note on `Section`: the sheet was 7px over one
          landscape page and this is part of the 29px that fixed it. */}
      <div className="max-w-6xl mx-auto px-8 py-4">
        {/* Header */}
        <div className="border-b-2 border-black pb-3 mb-4">
          <div className="flex items-start justify-between gap-6">
            {/* WHITE-LABEL. This was the literal string "PATRIOT CONCRETE
                CUTTING", so every tenant's printed job order would have said
                Patriot — a direct breach of the CLAUDE.md non-negotiable that no
                Patriot-specific branding is hardcoded, and awkward in a pitch
                that mentions multi-tenancy. The work ticket already does this
                correctly; this sheet had been missed. */}
            <h1 className="text-2xl font-bold tracking-wide uppercase">
              {branding.company_name || 'Job Ticket'}
            </h1>
            {/* Founder, Aug 13: "it needs to have the job number ID — I wanna
                hand out the ticket just so we know what ticket goes with what
                work-performed ticket, and I just need to have that more
                visible." Boxed and set large, the same treatment the work
                ticket got, so the two sheets pair up on the desk. Black, not
                brand colour — a coloured number goes grey on a mono printer.
                whitespace-nowrap because a broken job number is unusable. */}
            <div className="border-[2.5px] border-black rounded px-3 py-1 text-right shrink-0">
              <p className="text-[10px] font-bold tracking-[0.18em] text-gray-700 leading-none">JOB ID</p>
              <p className="text-2xl font-black font-mono leading-tight whitespace-nowrap">{job.job_number}</p>
            </div>
          </div>
          <p className="text-sm uppercase tracking-wide text-gray-700 mt-0.5">Job Ticket</p>
        </div>

        {/* Two-column body so more fits in landscape */}
        <div className="grid grid-cols-2 gap-x-10 gap-y-0 items-start">
          {/* LEFT column */}
          <div>
            <Section title="Schedule">
              <Field label="Date" value={formatDate(job.scheduled_date)} />
              {job.end_date && job.end_date !== job.scheduled_date && (
                <Field label="End Date" value={formatDate(job.end_date)} />
              )}
              <Field label="Arrival Time" value={job.is_will_call ? 'Will Call' : arrival || '—'} />
              {/* Crew names REMOVED (founder, Aug 13): "remove employees and
                  employee names — that is not required on the ticket when I
                  print it out… I can print that ticket out, but that doesn't
                  mean the same people are always going to be in the same
                  project." A sheet printed Monday must not assert who is on the
                  job Thursday. Who actually worked it is recorded per day on the
                  WORK ticket, from the clock cards. */}
              {job.project_manager_name && <Field label="Project Manager" value={job.project_manager_name} />}
              {/* Difficulty is an INTERNAL scheduling signal (it drives operator
                  skill matching and capacity), not something to hand a crew or
                  a customer. Removed from the printed sheet at the founder's
                  request, Aug 12. It still shows on the schedule board and the
                  approval modal, where the office actually uses it. */}
            </Section>

            <Section title="Customer">
              <Field label="Customer" value={job.customer_name || '—'} />
              {job.project_name && <Field label="Project" value={job.project_name} />}
              {job.contact_name && <Field label="Site Contact" value={job.contact_name} />}
              {(job.contact_phone || job.customer_phone) && (
                <Field label="Phone" value={job.contact_phone || job.customer_phone || '—'} />
              )}
              {/* QUOTED BY — the react-pdf ticket has printed this since Aug 16
                  ("it has submitted by blank but the schedule form shows Andres
                  Altamirano"). Unifying the two sheets by DROPPING it here would
                  have quietly undone that fix, so it is added rather than
                  removed. Same field, same created_by fallback — see
                  lib/job-ticket-quoted-by.ts. */}
              {quotedBy && <Field label="Quoted By" value={quotedBy} />}
            </Section>

            <Section title="Site">
              <Field label="Address" value={siteAddress} />
              {/* `location` differs from `address` on 13 of the 48 production
                  jobs — it holds the building or area name. It used to vanish
                  into the `address || location` fallback above. */}
              {siteName && <Field label="Job Site" value={siteName} />}
              {job.job_type && <Field label="Job Type" value={job.job_type} />}
              {job.po_number && <Field label="PO Number" value={job.po_number} />}
              {job.directions && <Field label="Directions" value={job.directions} />}
            </Section>

            <Section title="Compliance & Permits">
              <Field label="Permit Required" value={job.permit_required ? 'Yes' : 'No'} />
              {job.permit_number && <Field label="Permit #" value={job.permit_number} />}
              {/* The named permits. Shared table with the react-pdf ticket
                  (lib/job-ticket-format → formatPermits): "Yes" tells a crew
                  nothing about the fire watch a HOT WORK permit means. */}
              {permitList.length > 0 && <Field label="Permits" value={permitList.join(' | ')} />}
              {orientationReq && <Field label="Orientation" value="Required" />}
              {badgingReq && <Field label="Badging" value={(compliance.badging_type as string) || 'Required'} />}
              {specialInstructions && <Field label="Instructions" value={specialInstructions} />}
            </Section>

            {/* NOTES sits here, under Compliance & Permits (founder, Aug 13:
                "have notes under compliance and permits so it can all fit in one
                ticket"). It used to run full-width BELOW both columns, which
                pushed the sheet onto a second page while the bottom half of this
                left column sat empty. Same information, one page. */}
            <Section title="Notes">
              {job.additional_notes && (
                <p className="text-sm leading-relaxed whitespace-pre-wrap mb-2">{job.additional_notes}</p>
              )}
              <div className="border border-gray-400 h-20 rounded" />
            </Section>
          </div>

          {/* RIGHT column */}
          <div>
            <Section title="Scope of Work">
              {scopeText ? (
                <p className="text-sm leading-relaxed whitespace-pre-wrap">{scopeText}</p>
              ) : scopeSections.length === 0 ? (
                <p className="text-sm text-gray-600 italic">No scope description provided.</p>
              ) : null}

              {/* MEASURED SCOPE (founder, Aug 16): the office enters areas as
                  L × W × thickness × qty and this sheet printed none of it — the
                  crew got "HHS/PS — 10 LF" and nothing about the two 10×10 pads.
                  Rendered as dimensions PLUS the computed total, with the units
                  spelled out, because the source mixes feet (L/W) and inches
                  (thickness) and a bare "10 × 10 × 10" is a misread waiting to
                  happen. Same helper as the crew's digital ticket. */}
              {scopeSections.length > 0 && (
                <div className={`space-y-1 ${scopeText ? 'mt-2 pt-2 border-t border-gray-300' : ''}`}>
                  {scopeSections.map((section) => (
                    <div key={section.code} className="flex gap-2 text-sm leading-snug">
                      <span className="w-28 flex-shrink-0 font-semibold uppercase text-[10px] tracking-wide pt-0.5 text-gray-700">
                        {section.code === '_removal' ? 'Removal' : section.code}
                      </span>
                      <span className="flex-1 min-w-0">
                        {section.lines.map((line, i) => (
                          <span key={i} className="block break-words">{line}</span>
                        ))}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </Section>

            {/* SERVICE ITEMS — ONE resolved measure per service.
                Founder, Aug 17, reading his own printout:

                  Wall/Track Sawing      Wall/Track Sawing — linear ft   48 linear_ft
                  Handheld / Push Sawing Handheld / Push Sawing — %     100 percent

                Three faults. The unit was the RAW DATABASE KEY. Type and
                Description said the same words twice (the schedule form
                auto-writes `${label} — linear ft` as the description). And the
                "Target Qty" column implied a count that does not exist for
                linear feet: "no quantities needed because it's total linear ft,
                unless they add an area of a different size" — and that multiple-
                areas case is already carried by SCOPE OF WORK above ("2 areas —
                10' × 10' × 10" thick = 200 sq ft total").

                So: `48 LF`, `12 holes`, `100%`. The DETAIL column is drawn only
                when a human actually typed something ("12 conduit penetrations,
                4in bit, 8in SOG" — a real production row); otherwise it would be
                a column of dashes. Both decisions come from
                lib/job-ticket-format so the PDF cannot disagree. */}
            {scopeLines.length > 0 && (
              <Section title="Service Items">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="border-b border-black">
                      <th className="text-left py-1 pr-2 font-semibold">Service</th>
                      {showScopeDetail && <th className="text-left py-1 pr-2 font-semibold">Detail</th>}
                      <th className="text-right py-1 font-semibold">Quantity</th>
                    </tr>
                  </thead>
                  <tbody>
                    {scopeLines.map((item) => (
                      <tr key={item.key} className="border-b border-gray-300">
                        <td className="py-1.5 pr-2 align-top font-medium">{item.service || '—'}</td>
                        {showScopeDetail && (
                          <td className="py-1.5 pr-2 align-top">{item.detail || '—'}</td>
                        )}
                        <td className="py-1.5 align-top text-right whitespace-nowrap font-medium">
                          {item.quantity || '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Section>
            )}

            {/* EQUIPMENT REQUIRED — always printed, filled or blank.
                Founder, Aug 13: "show me the equipment that is required for that
                job… and if we can't do that, let's just have a space where the
                project manager can write out equipment that is required."
                A quick-add job carries no selections, so the crew gets ruled
                lines to write on rather than the section disappearing — the
                sheet keeps one shape. (Inferring a kit from the job type is
                M27b and is deliberately NOT guessed at here.)

                GROUPED BY SERVICE (founder, Aug 16). This box used to print ONLY
                `equipment_needed` — the three items he had TYPED — and dropped
                the ~16 items he had actually TICKED per service in
                `equipment_selections`. "I didn't even click wall saw or slab
                saw": the sheet named tools he didn't want and omitted the ones
                he did. CUSTOM is its own row precisely so a typed-in string is
                never again read as a per-service selection, and RENTAL only
                appears when there is something to rent.

                ── ONE ITEM PER LINE, TWO BALANCED COLUMNS (founder, Aug 17) ──
                This box used to render `group.items.join(' · ')`, which on his
                actual printout came out as:

                  apron · plastic · 32" guard · 480 cord — 200 ft · chain saw
                  (15') · duct tape · boots (Pentruder) ×3 · chalk line · track
                  (Pentruder) — 15 ft · clear spray

                Unreadable. The react-pdf ticket had already been fixed with
                `layoutEquipmentColumns` — a MEASURED, weight-balanced two-column
                split that never ends a column on a service heading and repeats
                the heading as "(cont.)" when a column opens mid-service. This
                sheet now calls the same helper with the same column count, so
                the two surfaces produce the same list in the same order and
                neither can drift. */}
            <Section title="Equipment Required">
              {equipmentColumns.length > 0 ? (
                <div className="flex gap-6">
                  {equipmentColumns.map((col, ci) => (
                    <div key={ci} className="flex-1 min-w-0">
                      {col.map((row, ri) =>
                        row.kind === 'heading' ? (
                          <p
                            key={ri}
                            className={`font-semibold uppercase text-[10px] tracking-wide text-gray-700 border-b border-gray-300 pb-0.5 mb-1 ${
                              ri === 0 ? '' : 'mt-2'
                            }`}
                          >
                            {row.text}
                          </p>
                        ) : (
                          <p key={ri} className="text-xs leading-snug break-words">
                            • {row.text}
                          </p>
                        )
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-3 pt-1">
                  <div className="border-b border-black h-4" />
                  <div className="border-b border-black h-4" />
                </div>
              )}
            </Section>

            {conditions.length > 0 && (
              <Section title="Work Conditions">
                <div className="flex flex-wrap gap-1.5">
                  {conditions.map((c, i) => (
                    <span key={i} className="text-xs border border-gray-400 rounded px-2 py-0.5">{c}</span>
                  ))}
                </div>
              </Section>
            )}

            {ppeAndSafety.length > 0 && (
              <Section title="PPE & Safety">
                <div className="flex flex-wrap gap-1.5">
                  {ppeAndSafety.map((p, i) => (
                    <span key={i} className="text-xs border border-gray-400 rounded px-2 py-0.5">{p}</span>
                  ))}
                </div>
              </Section>
            )}
          </div>
        </div>

        {/* Signatures — the only full-width block left, so the sheet ends here. */}
        <div className="mt-4 grid grid-cols-2 gap-8 break-inside-avoid">
          <div>
            <div className="border-b border-black h-8" />
            <p className="text-xs text-gray-700 mt-1">Customer Signature / Date</p>
          </div>
          <div>
            <div className="border-b border-black h-8" />
            <p className="text-xs text-gray-700 mt-1">Operator Signature / Date</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Presentational helpers ────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    // mb-4, not mb-5. Measured against letter LANDSCAPE minus the 0.4in margins
    // (979 × 739 CSS px): this job's sheet came to 746px — SEVEN pixels onto a
    // second page — before the measured scope was even added. Four pixels per
    // section boundary buys 29px of slack and the ticket lands on one page. The
    // gap is still visible; nothing was compressed to the point of being harder
    // to read at arm's length on a truck dash.
    <div className="mb-4">
      <p className="text-xs uppercase tracking-wide font-bold text-gray-700 border-b border-gray-300 pb-1 mb-2">
        {title}
      </p>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex text-sm">
      <span className="w-36 flex-shrink-0 text-gray-600">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
