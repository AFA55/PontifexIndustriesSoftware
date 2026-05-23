'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Wrench, Clock, CheckCircle2, XCircle, Loader2, ChevronDown,
  ChevronUp, AlertTriangle, ArrowRight, RefreshCw, Plus,
} from 'lucide-react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/auth';

// ─── Types ────────────────────────────────────────────────────────────────────

type MRStatus = 'open' | 'in_progress' | 'done' | 'cancelled';
type Priority = 'low' | 'medium' | 'high' | 'critical';

interface MaintenanceRequest {
  id: string;
  description: string;
  priority: Priority;
  status: MRStatus;
  equipment_name: string | null;
  photo_urls: string[];
  resolution_notes: string | null;
  resolved_at: string | null;
  supervisor_visit_id: string | null;
  created_at: string;
  updated_at: string;
  equipment: { id: string; name: string; unit_number: string | null } | null;
  submitter: { id: string; full_name: string; role: string } | null;
  resolver: { id: string; full_name: string } | null;
}

// Tab config maps to status filter
const TABS: { key: string; label: string; status: string; icon: React.ReactNode }[] = [
  { key: 'open',        label: 'Inbox',       status: 'open',        icon: <Wrench className="w-4 h-4" /> },
  { key: 'in_progress', label: 'In Progress', status: 'in_progress', icon: <Clock className="w-4 h-4" /> },
  { key: 'closed',      label: 'Closed',      status: 'closed',      icon: <CheckCircle2 className="w-4 h-4" /> },
];

const PRIORITY_CONFIG: Record<Priority, { label: string; chip: string }> = {
  low:      { label: 'Low',      chip: 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200' },
  medium:   { label: 'Medium',   chip: 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-200' },
  high:     { label: 'High',     chip: 'bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-200' },
  critical: { label: 'Critical', chip: 'bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-200' },
};

const ROLE_CHIP: Record<string, string> = {
  operator:           'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300',
  apprentice:         'bg-sky-100 dark:bg-sky-900/40 text-sky-700 dark:text-sky-300',
  supervisor:         'bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300',
  shop_help:          'bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300',
  shop_manager:       'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300',
  admin:              'bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300',
  super_admin:        'bg-fuchsia-100 dark:bg-fuchsia-900/40 text-fuchsia-700 dark:text-fuchsia-300',
  operations_manager: 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300',
};

const ALLOWED_ROLES = ['shop_manager', 'admin', 'super_admin', 'operations_manager'];

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ─── Request Card ─────────────────────────────────────────────────────────────

function RequestCard({
  req,
  onUpdate,
}: {
  req: MaintenanceRequest;
  onUpdate: (id: string, patch: Partial<MaintenanceRequest>) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [showNotesInput, setShowNotesInput] = useState(false);
  const [notes, setNotes] = useState('');
  const [equipmentResolution, setEquipmentResolution] = useState<'returned_to_service' | 'out_of_service'>('returned_to_service');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const equipLabel =
    req.equipment?.name
      ? req.equipment.name + (req.equipment.unit_number ? ` #${req.equipment.unit_number}` : '')
      : req.equipment_name ?? 'Unknown equipment';

  const priorityCfg = PRIORITY_CONFIG[req.priority] ?? PRIORITY_CONFIG.medium;

  async function patch(body: Record<string, unknown>) {
    setBusy(true);
    setError('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Session expired');
      const res = await fetch(`/api/admin/maintenance-requests/${req.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify(body),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || 'Update failed');
      onUpdate(req.id, j.data);
    } catch (err: any) {
      setError(err.message || 'Failed to update');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={`bg-white dark:bg-slate-800 rounded-2xl shadow-sm border transition-all ${
      req.priority === 'critical' ? 'border-rose-300 dark:border-rose-700/60' : 'border-gray-200 dark:border-slate-700'
    }`}>
      {/* Card header */}
      <div className="p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${priorityCfg.chip}`}>
                {priorityCfg.label}
              </span>
              {req.submitter && (
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${ROLE_CHIP[req.submitter.role] ?? ''}`}>
                  {req.submitter.role.replace(/_/g, ' ')}
                </span>
              )}
              {req.supervisor_visit_id && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300">
                  from visit report
                </span>
              )}
            </div>
            <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{equipLabel}</p>
            <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">
              {req.submitter?.full_name ?? 'Unknown'} · {timeAgo(req.created_at)}
            </p>
          </div>
          <button
            onClick={() => setExpanded(v => !v)}
            className="flex-shrink-0 p-2.5 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 text-gray-500 dark:text-slate-400 transition-colors"
            aria-label={expanded ? 'Collapse' : 'Expand'}
          >
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>

        {/* Description preview */}
        <p className={`text-sm text-gray-700 dark:text-slate-300 mt-2 ${expanded ? '' : 'line-clamp-2'}`}>
          {req.description}
        </p>

        {/* Photos */}
        {expanded && req.photo_urls && req.photo_urls.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-3">
            {req.photo_urls.map((url, i) => (
              <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                <img src={url} alt={`Photo ${i + 1}`} className="w-16 h-16 rounded-lg object-cover border border-gray-200 dark:border-slate-600 hover:opacity-80 transition-opacity" />
              </a>
            ))}
          </div>
        )}

        {/* Resolution notes (if closed) */}
        {req.resolution_notes && expanded && (
          <div className="mt-3 p-3 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800/50 text-sm text-emerald-700 dark:text-emerald-300">
            <span className="font-medium">Resolution: </span>{req.resolution_notes}
          </div>
        )}
      </div>

      {/* Action row — only for open / in_progress */}
      {(req.status === 'open' || req.status === 'in_progress') && (
        <div className="px-4 sm:px-5 pb-4 sm:pb-5 space-y-3">
          {error && (
            <div className="flex items-center gap-2 text-xs text-rose-600 dark:text-rose-400">
              <AlertTriangle className="w-3.5 h-3.5" />
              {error}
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            {req.status === 'open' && (
              <button
                onClick={() => patch({ status: 'in_progress' })}
                disabled={busy}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-semibold transition-colors min-h-[44px] disabled:opacity-50"
              >
                {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ArrowRight className="w-3.5 h-3.5" />}
                Start Work
              </button>
            )}

            {!showNotesInput ? (
              <button
                onClick={() => setShowNotesInput(true)}
                disabled={busy}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-semibold transition-colors min-h-[44px] disabled:opacity-50"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                Mark Done
              </button>
            ) : null}

            <button
              onClick={() => patch({ status: 'cancelled' })}
              disabled={busy}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 text-gray-700 dark:text-slate-300 text-xs font-semibold transition-colors min-h-[44px] disabled:opacity-50"
            >
              <XCircle className="w-3.5 h-3.5" />
              Cancel
            </button>
          </div>

          {/* Inline notes input for Mark Done */}
          {showNotesInput && (
            <div className="space-y-2">
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Optional: describe what was done..."
                rows={2}
                autoFocus
                className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-slate-600 bg-gray-50 dark:bg-slate-900 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
              />
              {req.equipment && (
                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-gray-600 dark:text-slate-400">Equipment outcome</p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setEquipmentResolution('returned_to_service')}
                      className={`flex-1 px-3 py-2 rounded-xl text-xs font-semibold transition-colors min-h-[44px] border ${
                        equipmentResolution === 'returned_to_service'
                          ? 'bg-emerald-500 text-white border-emerald-500'
                          : 'bg-gray-50 dark:bg-slate-900 text-gray-600 dark:text-slate-400 border-gray-200 dark:border-slate-600'
                      }`}
                    >
                      Back in service
                    </button>
                    <button
                      type="button"
                      onClick={() => setEquipmentResolution('out_of_service')}
                      className={`flex-1 px-3 py-2 rounded-xl text-xs font-semibold transition-colors min-h-[44px] border ${
                        equipmentResolution === 'out_of_service'
                          ? 'bg-rose-500 text-white border-rose-500'
                          : 'bg-gray-50 dark:bg-slate-900 text-gray-600 dark:text-slate-400 border-gray-200 dark:border-slate-600'
                      }`}
                    >
                      Still out of service
                    </button>
                  </div>
                </div>
              )}
              <div className="flex gap-2">
                <button
                  onClick={() => patch({ status: 'done', resolution_notes: notes, ...(req.equipment ? { equipment_resolution: equipmentResolution } : {}) })}
                  disabled={busy}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-semibold transition-colors min-h-[44px] disabled:opacity-50"
                >
                  {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                  Confirm Done
                </button>
                <button
                  onClick={() => setShowNotesInput(false)}
                  className="px-4 py-2 rounded-xl border border-gray-200 dark:border-slate-600 text-xs text-gray-600 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors min-h-[44px]"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function MaintenanceInboxPage() {
  const router = useRouter();
  const [authChecked, setAuthChecked] = useState(false);
  const [activeTab, setActiveTab] = useState('open');
  const [requests, setRequests] = useState<MaintenanceRequest[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [refreshKey, setRefreshKey] = useState(0);

  // Auth guard
  useEffect(() => {
    const user = getCurrentUser();
    if (!user) { router.replace('/login'); return; }
    if (!ALLOWED_ROLES.includes(user.role)) { router.replace('/dashboard'); return; }
    setAuthChecked(true);
  }, [router]);

  const loadRequests = useCallback(async (tab: string, pg: number) => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const res = await fetch(
        `/api/admin/maintenance-requests?status=${tab}&page=${pg}`,
        { headers: { Authorization: `Bearer ${session.access_token}` } }
      );
      if (!res.ok) throw new Error('Failed to load');
      const j = await res.json();
      setRequests(pg === 0 ? (j.data ?? []) : prev => [...prev, ...(j.data ?? [])]);
      setTotal(j.total ?? 0);
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (authChecked) {
      setPage(0);
      loadRequests(activeTab, 0);
    }
  }, [authChecked, activeTab, refreshKey, loadRequests]);

  function handleUpdate(id: string, patch: Partial<MaintenanceRequest>) {
    // Remove from list if status no longer matches tab
    const newStatus = (patch as any).status;
    if (newStatus && newStatus !== activeTab && !(activeTab === 'closed' && (newStatus === 'done' || newStatus === 'cancelled'))) {
      setRequests(prev => prev.filter(r => r.id !== id));
      setTotal(t => Math.max(0, t - 1));
    } else {
      setRequests(prev => prev.map(r => r.id === id ? { ...r, ...patch } : r));
    }
  }

  // Count badge for open tab
  const openCount = activeTab === 'open' ? total : null;

  if (!authChecked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-[#0b0618]">
        <Loader2 className="w-8 h-8 animate-spin text-violet-500" />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-5 max-w-4xl mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-violet-600 to-purple-600 bg-clip-text text-transparent">
            Maintenance Inbox
          </h1>
          <p className="text-sm text-gray-500 dark:text-slate-400 mt-0.5">
            Review and triage equipment issues from your team
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setRefreshKey(k => k + 1)}
            className="p-2 rounded-xl border border-gray-200 dark:border-slate-700 hover:bg-gray-100 dark:hover:bg-slate-700 text-gray-600 dark:text-slate-400 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
            aria-label="Refresh"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <Link
            href="/dashboard/maintenance/new"
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold transition-colors min-h-[44px]"
          >
            <Plus className="w-4 h-4" />
            Submit Request
          </Link>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-gray-100 dark:bg-slate-800 rounded-xl">
        {TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => { setActiveTab(tab.key); setPage(0); }}
            className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all min-h-[44px] ${
              activeTab === tab.key
                ? 'bg-white dark:bg-slate-700 text-violet-700 dark:text-violet-300 shadow-sm'
                : 'text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-slate-200'
            }`}
          >
            {tab.icon}
            {tab.label}
            {tab.key === 'open' && openCount !== null && openCount > 0 && (
              <span className="ml-1 inline-flex items-center justify-center w-5 h-5 rounded-full bg-rose-500 text-white text-xs font-bold">
                {openCount > 99 ? '99+' : openCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* List */}
      {loading && requests.length === 0 ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-8 h-8 animate-spin text-violet-500" />
        </div>
      ) : requests.length === 0 ? (
        <div className="text-center py-16 bg-white dark:bg-slate-800 rounded-2xl border border-gray-200 dark:border-slate-700">
          <CheckCircle2 className="w-12 h-12 text-gray-300 dark:text-slate-600 mx-auto mb-3" />
          <p className="text-sm font-medium text-gray-500 dark:text-slate-400">
            {activeTab === 'open' ? 'No open requests — inbox is clear!' : activeTab === 'in_progress' ? 'Nothing in progress.' : 'No closed requests yet.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {requests.map(req => (
            <RequestCard key={req.id} req={req} onUpdate={handleUpdate} />
          ))}

          {/* Load more */}
          {requests.length < total && (
            <button
              onClick={() => {
                const next = page + 1;
                setPage(next);
                loadRequests(activeTab, next);
              }}
              disabled={loading}
              className="w-full py-3 rounded-xl border border-gray-200 dark:border-slate-700 text-sm text-gray-600 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : `Load more (${total - requests.length} remaining)`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
