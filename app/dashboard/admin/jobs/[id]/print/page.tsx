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

  return (
    <div className="print-ticket bg-white text-black min-h-screen">
      {/* Print-only styles: hide everything else, show only the ticket */}
      <style>{`
        @media print {
          @page { margin: 0.6in; }
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

      <div className="max-w-2xl mx-auto px-8 py-8">
        {/* Header */}
        <div className="border-b-2 border-black pb-4 mb-6">
          <h1 className="text-2xl font-bold tracking-wide">PATRIOT CONCRETE CUTTING</h1>
          <div className="flex items-baseline justify-between mt-1">
            <p className="text-sm uppercase tracking-wide text-gray-700">Job Ticket</p>
            <p className="text-xl font-bold font-mono">{job.job_number}</p>
          </div>
        </div>

        {/* Schedule */}
        <Section title="Schedule">
          <Field label="Date" value={formatDate(job.scheduled_date)} />
          {job.end_date && job.end_date !== job.scheduled_date && (
            <Field label="End Date" value={formatDate(job.end_date)} />
          )}
          <Field label="Arrival Time" value={job.is_will_call ? 'Will Call' : arrival || '—'} />
          {job.operator_name && <Field label="Operator" value={job.operator_name} />}
        </Section>

        {/* Customer */}
        <Section title="Customer">
          <Field label="Customer" value={job.customer_name || '—'} />
          {job.project_name && <Field label="Project" value={job.project_name} />}
          {job.contact_name && <Field label="Site Contact" value={job.contact_name} />}
          {job.customer_phone && <Field label="Phone" value={job.customer_phone} />}
        </Section>

        {/* Site */}
        <Section title="Site">
          <Field label="Address" value={siteAddress} />
          {job.job_type && <Field label="Job Type" value={job.job_type} />}
          {job.po_number && <Field label="PO Number" value={job.po_number} />}
        </Section>

        {/* Scope of work */}
        <Section title="Scope of Work">
          {scopeText ? (
            <p className="text-sm leading-relaxed whitespace-pre-wrap">{scopeText}</p>
          ) : (
            <p className="text-sm text-gray-600 italic">No scope description provided.</p>
          )}
        </Section>

        {/* Service items / equipment needed */}
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

        {/* Compliance / permits */}
        <Section title="Compliance & Permits">
          <Field label="Permit Required" value={job.permit_required ? 'Yes' : 'No'} />
          {job.permit_number && <Field label="Permit #" value={job.permit_number} />}
        </Section>

        {/* Notes / signature */}
        <div className="mt-8">
          <p className="text-xs uppercase tracking-wide font-bold text-gray-700 mb-2">Notes</p>
          <div className="border border-gray-400 h-24 rounded" />
        </div>

        <div className="mt-8 grid grid-cols-2 gap-8">
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
