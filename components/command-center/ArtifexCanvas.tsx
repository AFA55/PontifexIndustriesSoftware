'use client';

/**
 * ArtifexCanvas — the live co-pilot workspace (founder Jul 12: "Artifex slides
 * left and you WATCH it fill the job ticket form on the right / see the report
 * render live; click to open it full").
 *
 * The chat stream already carries every tool call (inputs stream in, outputs
 * land) — this panel renders the LATEST tool activity as a live document:
 *   create_job_ticket   -> a quick-add form filling field-by-field
 *   get_hours_summary   -> the payroll-style hours table
 *   search_job_history  -> schedule-history results list
 *   invite_team_member  -> the invitation card
 *   anything else       -> a clean key/value readout
 * While the input is still streaming, fields shimmer; when the output lands,
 * the panel stamps DONE. The header link opens the real page.
 */
import Link from 'next/link';
import { CheckCircle2, ExternalLink, FileText, Loader2, Mail, Table2, X } from 'lucide-react';

export interface CanvasActivity {
  toolType: string; // e.g. 'tool-create_job_ticket'
  state: string; // input-streaming | input-available | output-available | output-error
  input?: any;
  output?: any;
}

const PANEL_META: Record<string, { title: string; href: string; icon: any }> = {
  'tool-update_ticket_draft': { title: 'Job Ticket — Drafting', href: '/dashboard/admin/schedule-board', icon: FileText },
  'tool-create_job_ticket': { title: 'Job Ticket — Quick Add', href: '/dashboard/admin/schedule-board', icon: FileText },
  'tool-get_hours_summary': { title: 'Hours Report', href: '/dashboard/admin/timecards', icon: Table2 },
  'tool-search_job_history': { title: 'Schedule History', href: '/dashboard/admin/schedule-board', icon: Table2 },
  'tool-invite_team_member': { title: 'Team Invitation', href: '/dashboard/admin/team/invite', icon: Mail },
};

const FIELD_LABELS: Record<string, string> = {
  customerName: 'Customer', jobType: 'Job type', startDate: 'Start date', endDate: 'End date',
  scope: 'Scope', address: 'Address', contactName: 'Site contact', contactPhone: 'Contact phone',
  priority: 'Priority', fullName: 'Name', email: 'Email', role: 'Role', phone: 'Phone',
  personName: 'Person', customerNameFilter: 'Customer', startDateFilter: 'From', endDateFilter: 'To',
};

function Row({ label, value, pending }: { label: string; value: any; pending?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-slate-100 py-2 last:border-0 dark:border-white/5">
      <span className="text-[11px] font-bold uppercase tracking-wide text-slate-400 dark:text-white/40">{label}</span>
      {value != null && value !== '' ? (
        <span className="max-w-[60%] text-right text-sm font-semibold text-slate-800 dark:text-white/90">{String(value)}</span>
      ) : (
        <span className={`h-4 w-24 rounded bg-slate-100 dark:bg-white/10 ${pending ? 'animate-pulse' : ''}`} />
      )}
    </div>
  );
}

export default function ArtifexCanvas({ activity, onClose }: { activity: CanvasActivity; onClose: () => void }) {
  const meta = PANEL_META[activity.toolType] ?? {
    title: activity.toolType.replace(/^tool-/, '').replace(/_/g, ' '),
    href: '/dashboard/command-center',
    icon: FileText,
  };
  const Icon = meta.icon;
  // The draft pad is ALWAYS 'working' — it's the form filling in live while
  // the conversation runs; Done belongs to the real create call that follows.
  const isDraft = activity.toolType === 'tool-update_ticket_draft';
  const working = isDraft
    ? activity.state !== 'output-error'
    : activity.state === 'input-streaming' || activity.state === 'input-available';
  const done = !isDraft && activity.state === 'output-available';
  const input = activity.input ?? {};
  const output = activity.output ?? {};

  return (
    <div className="artifex-panel-in w-full max-w-md rounded-2xl border border-slate-200 bg-white/95 shadow-2xl backdrop-blur-xl dark:border-sky-400/15 dark:bg-[#0A1120]/90">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-4 py-3 dark:border-white/[0.06]">
        <Link href={meta.href} className="group flex min-w-0 items-center gap-2">
          <Icon className="h-4 w-4 shrink-0 text-sky-600 dark:text-sky-300" />
          <span className="truncate text-sm font-bold text-slate-800 group-hover:underline dark:text-white/90">{meta.title}</span>
          <ExternalLink className="h-3 w-3 shrink-0 text-slate-400 opacity-0 transition-opacity group-hover:opacity-100" />
        </Link>
        <div className="flex items-center gap-2">
          {working && (
            <span className="flex items-center gap-1.5 rounded-full bg-sky-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-sky-700 dark:bg-sky-500/15 dark:text-sky-300">
              <Loader2 className="h-3 w-3 animate-spin" /> Working
            </span>
          )}
          {done && (
            <span className="flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
              <CheckCircle2 className="h-3 w-3" /> Done
            </span>
          )}
          <button type="button" onClick={onClose} aria-label="Close panel"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-white/10">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="max-h-[52vh] overflow-y-auto px-4 py-3">
        {activity.toolType === 'tool-get_hours_summary' && Array.isArray(output?.employees) ? (
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-[10px] font-bold uppercase tracking-wide text-slate-400">
                <th className="py-1.5">Name</th><th className="py-1.5 text-right">Reg</th><th className="py-1.5 text-right">OT</th><th className="py-1.5 text-right">Total</th><th className="py-1.5 text-right">Late</th>
              </tr>
            </thead>
            <tbody>
              {output.employees.map((e: any, i: number) => (
                <tr key={i} className="border-t border-slate-100 dark:border-white/5">
                  <td className="py-1.5 font-semibold text-slate-700 dark:text-white/85">{e.name}</td>
                  <td className="py-1.5 text-right tabular-nums text-slate-600 dark:text-white/70">{e.regularHours}</td>
                  <td className="py-1.5 text-right tabular-nums text-slate-600 dark:text-white/70">{e.overtimeHours}</td>
                  <td className="py-1.5 text-right tabular-nums font-bold text-slate-800 dark:text-white/90">{e.totalHours}</td>
                  <td className={`py-1.5 text-right tabular-nums ${e.lateDays ? 'font-bold text-rose-600' : 'text-slate-400'}`}>{e.lateDays || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : activity.toolType === 'tool-search_job_history' && Array.isArray(output?.jobs) ? (
          <ul className="space-y-2">
            {output.jobs.slice(0, 12).map((j: any, i: number) => (
              <li key={i} className="rounded-lg border border-slate-100 px-3 py-2 dark:border-white/5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-slate-800 dark:text-white/90">{j.jobNumber}</span>
                  <span className="text-[10px] font-semibold uppercase text-slate-400">{j.status}</span>
                </div>
                <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-white/55">{j.customer} · {j.date}{j.operator ? ` · ${j.operator}` : ''}</p>
              </li>
            ))}
          </ul>
        ) : (
          <>
            {Object.entries(input).length > 0 ? (
              Object.entries(input).map(([k, v]) => (
                <Row key={k} label={FIELD_LABELS[k] ?? k} value={v as any} pending={working} />
              ))
            ) : (
              <div className="space-y-2 py-1">
                {[0, 1, 2].map((i) => <Row key={i} label="…" value={null} pending />)}
              </div>
            )}
            {done && (output?.jobNumber || output?.invited || output?.created) && (
              <div className="mt-3 rounded-xl bg-emerald-50 px-3 py-2.5 text-sm font-semibold text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
                {output?.jobNumber ? `Created ${output.jobNumber}` : output?.invited ? `Invitation sent to ${output.email}${output?.texted ? ' + texted' : ''}` : 'Done'}
              </div>
            )}
            {activity.state === 'output-error' && (
              <div className="mt-3 rounded-xl bg-rose-50 px-3 py-2.5 text-sm font-semibold text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">
                Something went wrong — see the transcript.
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
