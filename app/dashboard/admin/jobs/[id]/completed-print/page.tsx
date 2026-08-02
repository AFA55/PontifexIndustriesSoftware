'use client';

export const dynamic = 'force-dynamic';

/**
 * Completed-ticket printout — a paper billing hand-off for project managers.
 * Mirrors Patriot's paper work-ticket: tenant logo top-left, JOB NUMBER top-right,
 * date + work times, customer + job address, DESCRIPTION OF WORK PERFORMED, footage
 * cut, plus write-in lines for disposal/slurry/standby (no structured source yet),
 * subsistence prefill, and a signature block. Portrait, print-optimized HTML.
 */

import { useEffect, useState, use } from 'react';
import { supabase } from '@/lib/supabase';
import { useBranding } from '@/lib/branding-context';
import { workItemDetailLine } from '@/lib/work-items-format';

interface SummaryJob {
  job_number: string;
  customer_name: string | null;
  contact_name: string | null;
  location: string | null;
  address: string | null;
  description: string | null;
  scope_of_work: string | null;
  scheduled_date: string | null;
  end_date: string | null;
  po_number: string | null;
  project_name: string | null;
  operator_name: string | null;
  helper_name: string | null;
}

interface WorkItem {
  id: string;
  work_type: string | null;
  quantity: number | null;
  linear_feet_cut: number | null;
  core_quantity: number | null;
  core_size?: string | null;
  cut_depth_inches: number | null;
  core_depth_inches: number | null;
  notes: string | null;
  day_number?: number | null;
  details_json: ({ description?: string } & Record<string, unknown>) | null;
}

interface Timecard {
  id: string;
  date: string | null;
  clock_in_time: string | null;
  clock_out_time: string | null;
  net_hours: number | null;
  total_hours: number | null;
  profiles?: { full_name?: string | null } | null;
}

function fmtDate(dateStr: string | null) {
  if (!dateStr) return '';
  // Bare 'YYYY-MM-DD' → parse local to avoid the UTC off-by-one.
  const d = dateStr.length <= 10 ? new Date(dateStr + 'T00:00:00') : new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: '2-digit' });
}

function fmtClock(ts: string | null) {
  if (!ts) return '';
  const d = new Date(ts);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

export default function CompletedTicketPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: jobId } = use(params);
  const { branding } = useBranding();

  const [job, setJob] = useState<SummaryJob | null>(null);
  const [workItems, setWorkItems] = useState<WorkItem[]>([]);
  const [timecards, setTimecards] = useState<Timecard[]>([]);
  const [signatureUrl, setSignatureUrl] = useState<string | null>(null);
  const [signedAt, setSignedAt] = useState<string | null>(null);
  const [nightStayed, setNightStayed] = useState<boolean>(false);
  const [crewNotes, setCrewNotes] = useState<{ name: string; note: string; hours: number | null }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData.session?.access_token || '';

        // Header comes from /summary (resolves operator/helper names; works for
        // super_admin too — completion-summary would 400 without a ?tenantId=).
        const summaryRes = await fetch(`/api/admin/jobs/${jobId}/summary`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!summaryRes.ok) { setError('Could not load the ticket.'); return; }
        const summaryJson = await summaryRes.json();
        setJob(summaryJson.data?.job ?? null);

        // Work items, times, signature, subsistence — read directly via the
        // RLS-scoped client (correct columns; no tenant-gate on the API path).
        const [wiRes, tcRes, jobRes, nightRes] = await Promise.all([
          supabase.from('work_items').select('*').eq('job_order_id', jobId).order('day_number', { ascending: true }),
          supabase.from('timecards').select('*, profiles(full_name)').eq('job_order_id', jobId).order('date', { ascending: true }),
          supabase.from('job_orders').select('completion_signature, customer_signature, customer_signed_at').eq('id', jobId).single(),
          supabase.from('subsistence_nights').select('id').eq('job_order_id', jobId).limit(1),
        ]);
        setWorkItems(Array.isArray(wiRes.data) ? (wiRes.data as WorkItem[]) : []);
        setTimecards(Array.isArray(tcRes.data) ? (tcRes.data as unknown as Timecard[]) : []);
        if (jobRes.data) {
          setSignatureUrl(jobRes.data.completion_signature || jobRes.data.customer_signature || null);
          setSignedAt(jobRes.data.customer_signed_at || null);
        }
        setNightStayed(!!(nightRes.data && nightRes.data.length > 0));

        // Crew notes — what the additional operators/helpers did (helper_work_logs).
        const { data: hlogs } = await supabase
          .from('helper_work_logs')
          .select('helper_id, work_description, hours_worked')
          .eq('job_order_id', jobId)
          .eq('is_shop_ticket', false);
        const withText = (hlogs || []).filter((h) => (h.work_description || '').trim());
        if (withText.length) {
          const hids = [...new Set(withText.map((h) => h.helper_id))];
          const { data: hprofs } = await supabase.from('profiles').select('id, full_name').in('id', hids);
          const hmap = new Map((hprofs || []).map((p) => [p.id, p.full_name]));
          setCrewNotes(
            withText.map((h) => ({
              name: hmap.get(h.helper_id) || 'Crew',
              note: (h.work_description || '').trim(),
              hours: h.hours_worked != null ? Number(h.hours_worked) : null,
            })),
          );
        }
      } catch {
        setError('Could not load the ticket.');
      } finally {
        setLoading(false);
      }
    })();
  }, [jobId]);

  useEffect(() => {
    if (!loading && job) {
      const t = setTimeout(() => window.print(), 500);
      return () => clearTimeout(t);
    }
  }, [loading, job]);

  if (loading) return <div className="p-8 text-sm text-gray-600">Loading ticket…</div>;
  if (error || !job) return <div className="p-8 text-sm text-red-600">{error || 'Job not found.'}</div>;

  const accent = branding.primary_color || '#DC2626';
  const totalLinearFt = workItems.reduce((s, w) => s + (Number(w.linear_feet_cut) || 0), 0);
  const totalCores = workItems.reduce((s, w) => s + (Number(w.core_quantity) || 0), 0);
  const siteAddress = [job.address || job.location, job.po_number ? `PO# ${job.po_number}` : null]
    .filter(Boolean)
    .join('   ');
  const scopeText = job.scope_of_work || job.description || '';
  const crew = [job.operator_name, job.helper_name].filter(Boolean).join(' + ');
  const companyLocation = [branding.company_city, branding.company_state, branding.company_zip]
    .filter(Boolean)
    .join(', ');

  return (
    <div className="print-ticket bg-white text-black min-h-screen">
      <style>{`
        @media print {
          @page { size: portrait; margin: 0.4in; }
          body * { visibility: hidden; }
          .print-ticket, .print-ticket * { visibility: visible; }
          .print-ticket { position: absolute; left: 0; top: 0; width: 100%; }
          .no-print { display: none !important; }
        }
      `}</style>

      {/* On-screen bar (hidden when printing) */}
      <div className="no-print bg-gray-100 border-b border-gray-300 px-6 py-3 flex items-center justify-between">
        <span className="text-sm text-gray-600">Completed ticket — {job.job_number}</span>
        <button
          onClick={() => window.print()}
          className="px-4 py-2 bg-gray-900 text-white text-sm font-semibold rounded-lg hover:bg-gray-800"
        >
          Print
        </button>
      </div>

      <div className="max-w-3xl mx-auto px-8 py-6">
        {/* ── Header: logo + company (left)  ·  JOB NO (right) ── */}
        <div className="flex items-start justify-between border-b-4 pb-3 mb-4" style={{ borderColor: accent }}>
          <div className="flex items-center gap-3">
            {branding.logo_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={branding.logo_url} alt="" className="h-14 w-auto object-contain" />
            )}
            <div>
              <h1 className="text-xl font-extrabold tracking-wide leading-tight">{branding.company_name}</h1>
              {(branding.company_address || companyLocation) && (
                <p className="text-[11px] text-gray-600 leading-tight">
                  {[branding.company_address, companyLocation].filter(Boolean).join(' · ')}
                </p>
              )}
              {branding.support_phone && (
                <p className="text-[11px] text-gray-600 leading-tight">{branding.support_phone}</p>
              )}
            </div>
          </div>
          <div className="text-right">
            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Job No.</p>
            <p className="text-2xl font-extrabold font-mono leading-none" style={{ color: accent }}>
              {job.job_number}
            </p>
            <p className="text-[11px] text-gray-600 mt-1">Date: {fmtDate(job.end_date || job.scheduled_date)}</p>
          </div>
        </div>

        {/* Completed banner */}
        <div
          className="text-white text-center text-sm font-bold uppercase tracking-widest py-1.5 rounded mb-4"
          style={{ backgroundColor: accent }}
        >
          Work Completed — Ready to Bill
        </div>

        {/* ── Customer / job block ── */}
        <div className="grid grid-cols-2 gap-x-8 gap-y-1.5 mb-4">
          <PrintField label="Customer" value={job.customer_name || ''} />
          <PrintField label="Job / Project" value={job.project_name || '—'} />
          <PrintField label="Job Address" value={siteAddress || '—'} span />
          <PrintField label="Site Contact" value={job.contact_name || '—'} />
          <PrintField label="Operator(s)" value={crew || '—'} />
        </div>

        {/* ── Work times (from clock in/out) ── */}
        <SectionTitle accent={accent}>Work Times</SectionTitle>
        <table className="w-full text-sm border-collapse mb-4">
          <thead>
            <tr className="border-b-2" style={{ borderColor: accent }}>
              <th className="text-left py-1 pr-2 font-semibold">Date</th>
              <th className="text-left py-1 pr-2 font-semibold">Operator</th>
              <th className="text-left py-1 pr-2 font-semibold">Start</th>
              <th className="text-left py-1 pr-2 font-semibold">End</th>
              <th className="text-right py-1 font-semibold">Total Hrs</th>
            </tr>
          </thead>
          <tbody>
            {timecards.length > 0 ? (
              timecards.map((tc) => {
                const hrs = tc.net_hours ?? tc.total_hours;
                return (
                  <tr key={tc.id} className="border-b border-gray-300">
                    <td className="py-1.5 pr-2">{fmtDate(tc.date)}</td>
                    <td className="py-1.5 pr-2">{tc.profiles?.full_name || '—'}</td>
                    <td className="py-1.5 pr-2">{fmtClock(tc.clock_in_time)}</td>
                    <td className="py-1.5 pr-2">{fmtClock(tc.clock_out_time)}</td>
                    <td className="py-1.5 text-right">{hrs != null ? Number(hrs).toFixed(1) : ''}</td>
                  </tr>
                );
              })
            ) : (
              // No clocked times — leave write-in rows like the paper form.
              [0, 1].map((i) => (
                <tr key={i} className="border-b border-gray-300">
                  <td className="py-3 pr-2" /><td /><td /><td /><td />
                </tr>
              ))
            )}
          </tbody>
        </table>

        {/* ── Description of work performed ── */}
        <SectionTitle accent={accent}>Description of Work Performed</SectionTitle>
        <div className="mb-2">
          {scopeText && <p className="text-sm leading-relaxed whitespace-pre-wrap mb-2">{scopeText}</p>}
          {workItems.length > 0 && (
            <ul className="text-sm space-y-0.5 mb-2">
              {workItems.map((w) => {
                // Expand details_json (every hole size/depth, LF @ depth,
                // wet/dry) instead of the bare qty/LF totals.
                const detail = workItemDetailLine(w);
                const parts = [
                  w.work_type || w.details_json?.description || 'Work',
                  w.quantity != null && Number(w.quantity) > 0 ? `qty ${w.quantity}` : null,
                  detail || null,
                  w.notes || null,
                ].filter(Boolean);
                return (
                  <li key={w.id}>
                    • {w.day_number ? `Day ${w.day_number}: ` : ''}{parts.join(' — ')}
                  </li>
                );
              })}
            </ul>
          )}
          {/* Extra write-in room, like the paper form */}
          <div className="border border-gray-400 rounded h-20" />
        </div>

        {/* ── Crew notes (what the additional operators did) ── */}
        {crewNotes.length > 0 && (
          <>
            <SectionTitle accent={accent}>Crew Notes</SectionTitle>
            <ul className="text-sm space-y-1 mb-4">
              {crewNotes.map((c, i) => (
                <li key={i}>
                  <span className="font-semibold">{c.name}</span>
                  {c.hours != null ? <span className="text-gray-600"> ({c.hours.toFixed(1)} hrs)</span> : null}
                  {' — '}{c.note}
                </li>
              ))}
            </ul>
          </>
        )}

        {/* ── Totals / checklist (paper-form fields) ── */}
        <SectionTitle accent={accent}>Job Details</SectionTitle>
        <div className="grid grid-cols-2 gap-x-8 gap-y-1.5 mb-4">
          <PrintField label="Total footage cut (incl. cross cuts)" value={totalLinearFt > 0 ? `${totalLinearFt} LF` : '__________'} />
          <PrintField label="Cores drilled" value={totalCores > 0 ? `${totalCores}` : '__________'} />
          <PrintField label="Concrete removed / loads" value="__________" />
          <PrintField label="Slurry removed — # barrels ($45/ea)" value="__________" />
          <PrintField label="Standby time (w/ contractor initials)" value="__________" />
          <PrintField label="Subsistence — night stayed" value={nightStayed ? 'Yes' : 'No'} />
        </div>

        {/* ── Signatures ── */}
        <div className="grid grid-cols-2 gap-8 mt-6">
          <div>
            {signatureUrl ? (
              <div className="h-12 flex items-end">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={signatureUrl} alt="" className="max-h-12 object-contain" />
              </div>
            ) : (
              <div className="border-b border-black h-12" />
            )}
            <p className="text-xs text-gray-700 mt-1">
              Customer Approval Signature{signedAt ? ` — signed ${fmtDate(signedAt)}` : ' / Print Name / Date'}
            </p>
          </div>
          <div>
            <div className="border-b border-black h-12" />
            <p className="text-xs text-gray-700 mt-1">Employee Signature / Date</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function SectionTitle({ accent, children }: { accent: string; children: React.ReactNode }) {
  return (
    <p
      className="text-xs uppercase tracking-widest font-bold pb-1 mb-2 border-b"
      style={{ borderColor: accent, color: accent }}
    >
      {children}
    </p>
  );
}

function PrintField({ label, value, span }: { label: string; value: string; span?: boolean }) {
  return (
    <div className={`flex text-sm ${span ? 'col-span-2' : ''}`}>
      <span className="text-gray-600 mr-2 whitespace-nowrap">{label}:</span>
      <span className="font-semibold">{value}</span>
    </div>
  );
}
