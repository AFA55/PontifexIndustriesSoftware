'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState, use } from 'react';
import { authedFetch, isSessionExpired } from '@/lib/authed-fetch';
import { useBranding } from '@/lib/branding-context';

// ─── Types (subset of /api/admin/jobs/[id]/summary `data`) ─────────────────────

interface PrintJob {
  job_number: string;
  customer_name: string;
  contact_name: string | null;
  customer_phone: string | null;
  job_type: string | null;
  location: string | null;
  address: string | null;
  description: string | null;
  scope_of_work: string | null;
  scheduled_date: string | null;
  end_date: string | null;
  arrival_time: string | null;
  is_will_call: boolean;
  po_number: string | null;
  permit_number: string | null;
  permit_required: boolean;
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
  jobsite_conditions?: Record<string, unknown> | null;
  site_compliance?: Record<string, unknown> | null;
}

// Human labels for the jobsite_conditions jsonb (+ optional footage keys).
const CONDITION_FIELDS: { key: string; label: string; ftKey?: string }[] = [
  { key: 'water_available', label: 'Water available', ftKey: 'water_available_ft' },
  { key: 'electricity_available', label: 'Power available', ftKey: 'electricity_available_ft' },
  { key: 'cord_480', label: '480 cord req’d', ftKey: 'cord_480_ft' },
  { key: 'hyd_hose', label: 'Hyd hose', ftKey: 'hyd_hose_ft' },
  { key: 'water_control', label: 'Vac water' },
  { key: 'plastic_needed', label: 'Hang poly' },
  { key: 'clean_up_required', label: 'Cleanup required' },
  { key: 'overcutting_allowed', label: 'Overcutting OK' },
  { key: 'high_work', label: 'High work', ftKey: 'high_work_ft' },
  { key: 'scaffolding_provided', label: 'Scaffold/lift avail' },
  { key: 'manpower_provided', label: 'Manpower provided' },
  { key: 'proper_ventilation', label: 'Proper ventilation' },
];

function activeConditions(jc: Record<string, unknown> | null | undefined): string[] {
  if (!jc) return [];
  const out: string[] = [];
  for (const { key, label, ftKey } of CONDITION_FIELDS) {
    if (jc[key]) {
      const ft = ftKey ? jc[ftKey] : null;
      out.push(ft ? `${label} (${ft}ft)` : label);
    }
  }
  return out;
}

function activeEquipmentSelections(sel: Record<string, Record<string, unknown>> | null | undefined): string[] {
  if (!sel) return [];
  const out: string[] = [];
  for (const group of Object.values(sel)) {
    if (!group || typeof group !== 'object') continue;
    for (const [key, val] of Object.entries(group)) {
      if (val && val !== 'no' && val !== 'false' && val !== '0' && val !== false) {
        const label = key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
        out.push(typeof val === 'string' && val !== 'yes' && val !== 'true' ? `${label}: ${val}` : label);
      }
    }
  }
  return out;
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
  const scopeText = job.scope_of_work || job.description;
  const conditions = activeConditions(job.jobsite_conditions);
  const insideOutside = (job.jobsite_conditions?.inside_outside as string | undefined) || null;
  const equipmentNeeded = (job.equipment_needed || []).filter(Boolean);
  const equipmentSelections = activeEquipmentSelections(job.equipment_selections);
  const ppe = (job.ppe_required || []).filter(Boolean);
  const safety = (job.additional_safety_requirements || []).filter(Boolean);
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

      <div className="max-w-6xl mx-auto px-8 py-6">
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
              {job.customer_phone && <Field label="Phone" value={job.customer_phone} />}
            </Section>

            <Section title="Site">
              <Field label="Address" value={siteAddress} />
              {job.job_type && <Field label="Job Type" value={job.job_type} />}
              {job.po_number && <Field label="PO Number" value={job.po_number} />}
            </Section>

            <Section title="Compliance & Permits">
              <Field label="Permit Required" value={job.permit_required ? 'Yes' : 'No'} />
              {job.permit_number && <Field label="Permit #" value={job.permit_number} />}
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
              ) : (
                <p className="text-sm text-gray-600 italic">No scope description provided.</p>
              )}
            </Section>

            {scope.length > 0 && (
              <Section title="Service Items">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="border-b border-black">
                      <th className="text-left py-1 pr-2 font-semibold">Type</th>
                      <th className="text-left py-1 pr-2 font-semibold">Description</th>
                      <th className="text-right py-1 font-semibold">Target Qty</th>
                    </tr>
                  </thead>
                  <tbody>
                    {scope.map((item) => (
                      <tr key={item.id} className="border-b border-gray-300">
                        <td className="py-1.5 pr-2 align-top font-medium">{item.work_type}</td>
                        <td className="py-1.5 pr-2 align-top">{item.description || '—'}</td>
                        <td className="py-1.5 align-top text-right whitespace-nowrap">
                          {item.target_quantity} {item.unit}
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
                M27b and is deliberately NOT guessed at here.) */}
            <Section title="Equipment Required">
              {equipmentNeeded.length > 0 || equipmentSelections.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {[...equipmentNeeded, ...equipmentSelections].map((e, i) => (
                    <span key={i} className="text-sm border border-gray-500 rounded px-2 py-0.5">{e}</span>
                  ))}
                </div>
              ) : (
                <div className="space-y-3 pt-1">
                  <div className="border-b border-black h-4" />
                  <div className="border-b border-black h-4" />
                </div>
              )}
            </Section>

            {(conditions.length > 0 || insideOutside) && (
              <Section title="Jobsite Conditions">
                {insideOutside && <Field label="Location" value={insideOutside === 'inside' ? 'Inside' : 'Outside'} />}
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {conditions.map((c, i) => (
                    <span key={i} className="text-xs border border-gray-400 rounded px-2 py-0.5">{c}</span>
                  ))}
                </div>
              </Section>
            )}

            {(ppe.length > 0 || safety.length > 0) && (
              <Section title="PPE & Safety">
                <div className="flex flex-wrap gap-1.5">
                  {[...ppe, ...safety].map((p, i) => (
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
    <div className="mb-5">
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
