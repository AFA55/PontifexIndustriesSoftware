'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState, use } from 'react';
import { supabase } from '@/lib/supabase';

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

  const [job, setJob] = useState<PrintJob | null>(null);
  const [scope, setScope] = useState<PrintScopeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData.session?.access_token || '';
        const res = await fetch(`/api/admin/jobs/${jobId}/summary`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          setError('Could not load job ticket.');
          return;
        }
        const json = await res.json();
        const data = json.data;
        setJob(data?.job ?? null);
        setScope(Array.isArray(data?.scope?.items) ? data.scope.items : []);
      } catch {
        setError('Could not load job ticket.');
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
          <div className="flex items-baseline justify-between">
            <h1 className="text-2xl font-bold tracking-wide">PATRIOT CONCRETE CUTTING</h1>
            <p className="text-xl font-bold font-mono">{job.job_number}</p>
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
              {job.operator_name && <Field label="Operator" value={job.helper_name ? `${job.operator_name} + ${job.helper_name}` : job.operator_name} />}
              {job.project_manager_name && <Field label="Project Manager" value={job.project_manager_name} />}
              {job.difficulty_rating ? <Field label="Difficulty" value={`${job.difficulty_rating} / 10`} /> : null}
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

            {(equipmentNeeded.length > 0 || equipmentSelections.length > 0) && (
              <Section title="Equipment">
                <div className="flex flex-wrap gap-1.5">
                  {[...equipmentNeeded, ...equipmentSelections].map((e, i) => (
                    <span key={i} className="text-xs border border-gray-400 rounded px-2 py-0.5">{e}</span>
                  ))}
                </div>
              </Section>
            )}

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

        {/* Notes + signatures — full width */}
        <div className="mt-4">
          <p className="text-xs uppercase tracking-wide font-bold text-gray-700 mb-2">Notes</p>
          {job.additional_notes && (
            <p className="text-sm leading-relaxed whitespace-pre-wrap mb-2">{job.additional_notes}</p>
          )}
          <div className="border border-gray-400 h-16 rounded" />
        </div>

        <div className="mt-6 grid grid-cols-2 gap-8">
          <div>
            <div className="border-b border-black h-10" />
            <p className="text-xs text-gray-700 mt-1">Customer Signature / Date</p>
          </div>
          <div>
            <div className="border-b border-black h-10" />
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
