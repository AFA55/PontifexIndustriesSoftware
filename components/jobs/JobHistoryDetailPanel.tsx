'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  X,
  ExternalLink,
  Clock,
  DollarSign,
  TrendingUp,
  Calendar,
  Users,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Star,
  FileText,
  Wrench,
  User,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';

// ─── Types ───────────────────────────────────────────────────────────────────

interface JobDetail {
  id: string;
  job_number: string;
  customer_name: string;
  job_type: string | null;
  status: string;
  scheduled_date: string | null;
  end_date: string | null;
  estimated_cost: number | null;
  description: string | null;
  location: string | null;
  address: string | null;
  arrival_time: string | null;
  project_name: string | null;
  foreman_name: string | null;
  foreman_phone: string | null;
  assigned_to: string | null;
  helper_assigned_to: string | null;
  completion_signed_at: string | null;
  customer_overall_rating: number | null;
  job_difficulty_rating: number | null;
  operator_notes: string | null;
  scope_of_work: string | null;
  is_multi_day: boolean | null;
  total_days_worked: number | null;
}

interface OperatorRef {
  id: string;
  full_name: string;
}

interface ScopeItem {
  id: string;
  work_type: string;
  description: string | null;
  unit: string | null;
  target_quantity: number | null;
  completed_qty: number | null;
  pct_complete: number | null;
  sort_order: number | null;
}

interface TimecardEntry {
  id: string;
  operator_name: string;
  clock_in_time: string | null;
  clock_out_time: string | null;
  total_hours: number | null;
  labor_cost: number | null;
  is_approved: boolean | null;
  hour_type: string | null;
}

interface NoteEntry {
  id: string;
  content: string;
  author_name: string | null;
  note_type: string | null;
  created_at: string;
  metadata: Record<string, unknown> | null;
}

interface DailyLog {
  day_number: number;
  hours_worked: number | null;
  date_worked: string | null;
  notes: string | null;
}

interface Totals {
  total_hours: number | null;
  total_labor_cost: number | null;
  scope_items_count: number;
  completed_scope_count: number;
  overall_pct: number;
}

interface JobDetailPayload {
  job: JobDetail;
  operator: OperatorRef | null;
  helper: OperatorRef | null;
  scope_items: ScopeItem[];
  timecards: TimecardEntry[];
  notes: NoteEntry[];
  daily_logs: DailyLog[];
  totals: Totals;
}

// ─── Props ───────────────────────────────────────────────────────────────────

interface JobHistoryDetailPanelProps {
  jobId: string;
  onClose: () => void;
}

// ─── Constants ───────────────────────────────────────────────────────────────

type TabId = 'Overview' | 'Scope & Work' | 'Hours & Crew' | 'Notes';
const TABS: TabId[] = ['Overview', 'Scope & Work', 'Hours & Crew', 'Notes'];

const STATUS_COLORS: Record<string, string> = {
  scheduled:          'bg-blue-100 text-blue-700 border-blue-200',
  assigned:           'bg-indigo-100 text-indigo-700 border-indigo-200',
  in_route:           'bg-cyan-100 text-cyan-700 border-cyan-200',
  in_progress:        'bg-orange-100 text-orange-700 border-orange-200',
  pending_completion: 'bg-amber-100 text-amber-700 border-amber-200',
  completed:          'bg-green-100 text-green-700 border-green-200',
  cancelled:          'bg-gray-100 text-gray-500 border-gray-200',
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function getAuthToken(): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token || '';
}

function formatDate(d: string | null | undefined): string {
  if (!d) return '—';
  const parsed = new Date(d.includes('T') ? d : d + 'T00:00:00');
  if (isNaN(parsed.getTime())) return '—';
  return parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatTime(t: string | null | undefined): string {
  if (!t) return '—';
  // Handle full ISO datetime or bare HH:MM:SS
  const date = new Date(t.includes('T') ? t : `1970-01-01T${t}`);
  if (isNaN(date.getTime())) return t;
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

function formatCurrency(n: number | null | undefined): string {
  if (n == null) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}

function formatHours(n: number | null | undefined): string {
  if (n == null) return '—';
  return n.toFixed(1) + ' hrs';
}

function timeAgo(dateStr: string): string {
  const date = new Date(dateStr);
  const now = Date.now();
  const diff = Math.floor((now - date.getTime()) / 1000);
  if (diff < 60) return 'Just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 86400 * 30) return `${Math.floor(diff / 86400)}d ago`;
  return formatDate(dateStr);
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(w => w[0].toUpperCase())
    .join('');
}

function statusLabel(s: string): string {
  return s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const cls = STATUS_COLORS[status] || 'bg-gray-100 text-gray-500 border-gray-200';
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold border ${cls}`}>
      {statusLabel(status)}
    </span>
  );
}

function StatChip({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  color: 'emerald' | 'blue' | 'purple' | 'gray';
}) {
  const colorMap = {
    emerald: 'bg-emerald-50 border-emerald-200 text-emerald-700',
    blue:    'bg-blue-50 border-blue-200 text-blue-700',
    purple:  'bg-purple-50 border-purple-200 text-purple-700',
    gray:    'bg-gray-50 border-gray-200 text-gray-700',
  };
  const iconMap = {
    emerald: 'text-emerald-500',
    blue:    'text-blue-500',
    purple:  'text-purple-500',
    gray:    'text-gray-400',
  };
  return (
    <div className={`flex flex-col items-center gap-1 px-3 py-2 rounded-xl border ${colorMap[color]} flex-1 min-w-0`}>
      <Icon className={`w-4 h-4 ${iconMap[color]} flex-shrink-0`} />
      <span className="text-xs font-bold truncate w-full text-center">{value}</span>
      <span className="text-[10px] text-gray-500 truncate w-full text-center">{label}</span>
    </div>
  );
}

function PersonCard({ person, role }: { person: OperatorRef; role: string }) {
  return (
    <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl border border-gray-100">
      <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0">
        <span className="text-sm font-bold text-indigo-700">{getInitials(person.full_name)}</span>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-900 truncate">{person.full_name}</p>
        <span className="inline-block text-xs font-medium text-indigo-600 bg-indigo-50 border border-indigo-200 rounded-full px-2 py-0.5">
          {role}
        </span>
      </div>
    </div>
  );
}

function StarRating({ value }: { value: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map(i => (
        <Star
          key={i}
          className={`w-4 h-4 ${i <= value ? 'text-amber-400 fill-amber-400' : 'text-gray-200 fill-gray-200'}`}
        />
      ))}
      <span className="ml-1.5 text-sm font-semibold text-gray-700">{value}/5</span>
    </div>
  );
}

// ─── Tab: Overview ────────────────────────────────────────────────────────────

function OverviewTab({ data }: { data: JobDetailPayload }) {
  const { job, operator, helper } = data;
  const isCompleted = job.status === 'completed';

  return (
    <div className="space-y-5">
      {/* Crew */}
      {(operator || helper) && (
        <section>
          <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5" /> Assigned Crew
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {operator && <PersonCard person={operator} role="Operator" />}
            {helper && <PersonCard person={helper} role="Helper" />}
          </div>
        </section>
      )}

      {/* Multi-day badge */}
      {job.is_multi_day && (
        <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-indigo-50 border border-indigo-200 rounded-full text-sm font-semibold text-indigo-700">
          <Calendar className="w-4 h-4" />
          Multi-day job
          {job.total_days_worked != null && (
            <span className="text-indigo-500"> · {job.total_days_worked} day{job.total_days_worked !== 1 ? 's' : ''} worked</span>
          )}
        </div>
      )}

      {/* Job description */}
      {job.description && (
        <section>
          <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <FileText className="w-3.5 h-3.5" /> Description
          </h4>
          <div className="bg-gray-50 rounded-xl border border-gray-100 p-4">
            <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{job.description}</p>
          </div>
        </section>
      )}

      {/* Scope of work */}
      {job.scope_of_work && (
        <section>
          <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <Wrench className="w-3.5 h-3.5" /> Scope of Work
          </h4>
          <div className="bg-gray-50 rounded-xl border border-gray-100 p-4">
            <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{job.scope_of_work}</p>
          </div>
        </section>
      )}

      {/* Completion / rating */}
      {isCompleted && (
        <section>
          <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5" /> Completion Details
          </h4>
          <div className="bg-green-50 rounded-xl border border-green-200 p-4 space-y-3">
            {job.completion_signed_at && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600 font-medium">Signed at</span>
                <span className="font-semibold text-gray-900">{formatDate(job.completion_signed_at)}</span>
              </div>
            )}
            {job.customer_overall_rating != null && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600 font-medium">Customer Rating</span>
                <StarRating value={job.customer_overall_rating} />
              </div>
            )}
            {job.job_difficulty_rating != null && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600 font-medium">Job Difficulty</span>
                <StarRating value={job.job_difficulty_rating} />
              </div>
            )}
            {job.operator_notes && (
              <div className="pt-2 border-t border-green-200">
                <p className="text-xs font-semibold text-gray-500 mb-1">Operator Notes</p>
                <p className="text-sm text-gray-700 whitespace-pre-wrap">{job.operator_notes}</p>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Empty state */}
      {!operator && !helper && !job.description && !job.scope_of_work && !isCompleted && !job.is_multi_day && (
        <div className="text-center py-10 text-gray-400 text-sm">
          No overview details available for this job.
        </div>
      )}
    </div>
  );
}

// ─── Tab: Scope & Work ────────────────────────────────────────────────────────

function ScopeTab({ items }: { items: ScopeItem[] }) {
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-14 text-center gap-3">
        <Wrench className="w-8 h-8 text-gray-300" />
        <p className="text-sm text-gray-500 font-medium">No scope items recorded</p>
        <p className="text-xs text-gray-400">Scope items are added when work is performed on this job.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {items.map(item => {
        const pct = item.pct_complete ?? 0;
        const barColor = pct >= 90 ? 'bg-green-500' : pct >= 50 ? 'bg-amber-400' : 'bg-red-400';
        const badgeColor = pct >= 90
          ? 'bg-green-100 text-green-700 border-green-200'
          : pct >= 50
          ? 'bg-amber-100 text-amber-700 border-amber-200'
          : 'bg-red-100 text-red-700 border-red-200';
        const completed = item.completed_qty ?? 0;
        const target = item.target_quantity ?? 0;
        const unit = item.unit || '';

        return (
          <div key={item.id} className="bg-gray-50 rounded-xl border border-gray-100 p-4 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-gray-900">{item.work_type}</p>
                {item.description && (
                  <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{item.description}</p>
                )}
              </div>
              <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full border flex-shrink-0 ${badgeColor}`}>
                {Math.round(pct)}%
              </span>
            </div>

            {/* Progress bar */}
            <div>
              <div className="flex items-center justify-between text-xs text-gray-500 mb-1.5">
                <span>
                  {completed.toLocaleString()}
                  {unit ? ` ${unit}` : ''} completed
                </span>
                <span>
                  {target.toLocaleString()}{unit ? ` ${unit}` : ''} target
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                <div
                  className={`h-2 rounded-full transition-all duration-500 ${barColor}`}
                  style={{ width: `${Math.min(100, pct)}%` }}
                />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Tab: Hours & Crew ────────────────────────────────────────────────────────

function HoursTab({
  timecards,
  dailyLogs,
  totals,
}: {
  timecards: TimecardEntry[];
  dailyLogs: DailyLog[];
  totals: Totals;
}) {
  return (
    <div className="space-y-5">
      {/* Summary card */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-blue-50 rounded-xl border border-blue-200 p-4 text-center">
          <p className="text-2xl font-bold text-blue-700">{formatHours(totals.total_hours)}</p>
          <p className="text-xs text-blue-500 font-medium mt-0.5">Total Hours</p>
        </div>
        <div className="bg-emerald-50 rounded-xl border border-emerald-200 p-4 text-center">
          <p className="text-2xl font-bold text-emerald-700">{formatCurrency(totals.total_labor_cost)}</p>
          <p className="text-xs text-emerald-500 font-medium mt-0.5">Total Labor Cost</p>
        </div>
      </div>

      {/* Timecards */}
      <section>
        <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
          <Clock className="w-3.5 h-3.5" /> Timecard Entries
        </h4>
        {timecards.length === 0 ? (
          <div className="text-center py-8 text-sm text-gray-400 bg-gray-50 rounded-xl border border-gray-100">
            No timecard entries linked to this job
          </div>
        ) : (
          <div className="space-y-2">
            {timecards.map(tc => (
              <div key={tc.id} className="bg-gray-50 rounded-xl border border-gray-100 p-3.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold text-gray-900">{tc.operator_name}</p>
                      {tc.hour_type && (
                        <span className="text-xs text-gray-500 bg-gray-200 px-2 py-0.5 rounded-full">
                          {tc.hour_type.replace(/_/g, ' ')}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      {formatTime(tc.clock_in_time)}
                      {tc.clock_out_time && ` → ${formatTime(tc.clock_out_time)}`}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-sm font-bold text-gray-900">{formatHours(tc.total_hours)}</p>
                    {tc.labor_cost != null && (
                      <p className="text-xs text-emerald-600 font-medium">{formatCurrency(tc.labor_cost)}</p>
                    )}
                    {tc.is_approved != null && (
                      <span
                        className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-full border mt-1 ${
                          tc.is_approved
                            ? 'bg-green-100 text-green-700 border-green-200'
                            : 'bg-amber-100 text-amber-700 border-amber-200'
                        }`}
                      >
                        {tc.is_approved ? 'Approved' : 'Pending'}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Daily logs */}
      {dailyLogs.length > 0 && (
        <section>
          <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5" /> Daily Logs
          </h4>
          <div className="space-y-2">
            {dailyLogs.map(log => (
              <div
                key={log.day_number}
                className="flex items-center justify-between gap-3 bg-gray-50 rounded-xl border border-gray-100 px-4 py-3"
              >
                <div className="flex items-center gap-3">
                  <span className="text-xs font-bold text-indigo-600 bg-indigo-50 border border-indigo-200 rounded-full px-2.5 py-1">
                    Day {log.day_number}
                  </span>
                  {log.date_worked && (
                    <span className="text-xs text-gray-500">{formatDate(log.date_worked)}</span>
                  )}
                </div>
                <div className="text-right">
                  {log.hours_worked != null && (
                    <p className="text-sm font-semibold text-gray-900">{formatHours(log.hours_worked)}</p>
                  )}
                  {log.notes && (
                    <p className="text-xs text-gray-400 truncate max-w-[140px]">{log.notes}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

// ─── Tab: Notes ───────────────────────────────────────────────────────────────

function NotesTab({ notes }: { notes: NoteEntry[] }) {
  if (notes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-14 text-center gap-3">
        <FileText className="w-8 h-8 text-gray-300" />
        <p className="text-sm text-gray-500 font-medium">No notes recorded for this job</p>
      </div>
    );
  }

  const sorted = [...notes].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  return (
    <div className="space-y-3">
      {sorted.map(note => {
        const isSystem = note.note_type === 'system' || note.note_type === 'auto';
        return (
          <div key={note.id} className="bg-gray-50 rounded-xl border border-gray-100 p-4 space-y-2">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0">
                  {isSystem ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-indigo-500" />
                  ) : (
                    <User className="w-3.5 h-3.5 text-indigo-500" />
                  )}
                </div>
                <span className="text-sm font-semibold text-gray-900">
                  {note.author_name || 'Unknown'}
                </span>
                {note.note_type && (
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                      isSystem
                        ? 'bg-gray-100 text-gray-500 border-gray-200'
                        : 'bg-indigo-50 text-indigo-600 border-indigo-200'
                    }`}
                  >
                    {note.note_type.replace(/_/g, ' ')}
                  </span>
                )}
              </div>
              <span className="text-xs text-gray-400">{timeAgo(note.created_at)}</span>
            </div>
            <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed pl-9">
              {note.content}
            </p>
          </div>
        );
      })}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function JobHistoryDetailPanel({
  jobId,
  onClose,
}: JobHistoryDetailPanelProps) {
  const [data, setData] = useState<JobDetailPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>('Overview');

  const fetchDetail = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await getAuthToken();
      const res = await fetch(`/api/admin/jobs/${jobId}/detail`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || `Failed to load job detail (${res.status})`);
      }
      const json = await res.json();
      const payload = json.data as JobDetailPayload;
      // Normalize nullish arrays
      payload.scope_items = payload.scope_items ?? [];
      payload.timecards = payload.timecards ?? [];
      payload.notes = payload.notes ?? [];
      payload.daily_logs = payload.daily_logs ?? [];
      setData(payload);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An error occurred loading job details');
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => {
    setActiveTab('Overview');
    fetchDetail();
  }, [jobId, fetchDetail]);

  // Close on Escape key
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const job = data?.job;
  const displayDate = job?.end_date ?? job?.scheduled_date ?? null;

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 bg-black/40 z-40 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div
        className="fixed top-0 right-0 h-full w-full md:w-[52%] lg:w-[48%] bg-white z-50 shadow-2xl flex flex-col
                   animate-in slide-in-from-right duration-300"
        role="dialog"
        aria-modal="true"
        aria-label="Job detail panel"
      >
        {/* ── Header ── */}
        <div className="flex-shrink-0 border-b border-gray-100 px-5 pt-4 pb-3">
          {loading ? (
            <div className="flex items-center gap-3 h-10">
              <Loader2 className="w-5 h-5 animate-spin text-indigo-500" />
              <span className="text-sm text-gray-500">Loading job details…</span>
            </div>
          ) : error ? (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm text-red-600">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                Failed to load job
              </div>
              <button
                onClick={onClose}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                aria-label="Close panel"
              >
                <X className="w-4 h-4 text-gray-500" />
              </button>
            </div>
          ) : job ? (
            <>
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  {/* Job number + status row */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-base font-bold text-indigo-600 tracking-tight">
                      {job.job_number}
                    </span>
                    <StatusBadge status={job.status} />
                    {job.job_type && (
                      <span className="text-xs text-gray-500 bg-gray-100 rounded-full px-2.5 py-0.5 font-medium">
                        {job.job_type}
                      </span>
                    )}
                  </div>
                  {/* Customer + location */}
                  <p className="text-sm font-semibold text-gray-800 mt-1 truncate">{job.customer_name}</p>
                  {(job.project_name || job.location || job.address) && (
                    <p className="text-xs text-gray-400 truncate">
                      {[job.project_name, job.location || job.address].filter(Boolean).join(' · ')}
                    </p>
                  )}
                </div>
                {/* Actions */}
                <div className="flex items-center gap-1 flex-shrink-0">
                  <a
                    href={`/dashboard/admin/jobs/${jobId}`}
                    className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors border border-indigo-200"
                    title="Open full detail page"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Full Detail</span>
                  </a>
                  <button
                    onClick={onClose}
                    className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors ml-1"
                    aria-label="Close panel"
                  >
                    <X className="w-4 h-4 text-gray-500" />
                  </button>
                </div>
              </div>

              {/* Stats row */}
              {data && (
                <div className="flex gap-2 mt-3">
                  <StatChip
                    icon={DollarSign}
                    label="Est. Cost"
                    value={formatCurrency(job.estimated_cost)}
                    color="emerald"
                  />
                  <StatChip
                    icon={Clock}
                    label="Total Hours"
                    value={formatHours(data.totals.total_hours)}
                    color="blue"
                  />
                  <StatChip
                    icon={TrendingUp}
                    label="Scope"
                    value={`${Math.round(data.totals.overall_pct)}%`}
                    color="purple"
                  />
                  <StatChip
                    icon={Calendar}
                    label={job.status === 'completed' ? 'Completed' : 'Scheduled'}
                    value={formatDate(displayDate)}
                    color="gray"
                  />
                </div>
              )}
            </>
          ) : null}
        </div>

        {/* ── Tab bar ── */}
        {!loading && !error && data && (
          <div className="flex-shrink-0 border-b border-gray-100 px-5">
            <div className="flex gap-1 py-2 overflow-x-auto">
              {TABS.map(tab => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`flex-shrink-0 px-3 py-1.5 rounded-full text-sm font-semibold transition-colors ${
                    activeTab === tab
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'text-gray-500 hover:bg-gray-100 hover:text-gray-800'
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── Content area ── */}
        <div className="flex-1 overflow-y-auto">
          {loading && (
            <div className="flex flex-col items-center justify-center h-full gap-3">
              <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
              <p className="text-sm text-gray-500">Loading job details…</p>
            </div>
          )}

          {!loading && error && (
            <div className="flex flex-col items-center justify-center h-full gap-4 px-6">
              <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-xl max-w-sm w-full">
                <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-red-700">Failed to load job details</p>
                  <p className="text-xs text-red-500 mt-1">{error}</p>
                </div>
              </div>
              <button
                onClick={fetchDetail}
                className="text-sm text-indigo-600 font-semibold hover:underline"
              >
                Try again
              </button>
            </div>
          )}

          {!loading && !error && data && (
            <div className="px-5 py-5">
              {activeTab === 'Overview' && <OverviewTab data={data} />}
              {activeTab === 'Scope & Work' && <ScopeTab items={data.scope_items} />}
              {activeTab === 'Hours & Crew' && (
                <HoursTab
                  timecards={data.timecards}
                  dailyLogs={data.daily_logs}
                  totals={data.totals}
                />
              )}
              {activeTab === 'Notes' && <NotesTab notes={data.notes} />}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
