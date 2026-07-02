'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  Inbox, RefreshCw, Mail, Phone, Building2, Users as UsersIcon,
  MessageSquareText, ChevronDown, ChevronUp, ArrowRight, AlertTriangle,
} from 'lucide-react';
import { getHeaders, getJsonHeaders } from '@/components/platform/shared';

interface DemoRequest {
  id: string;
  name: string | null;
  company: string | null;
  email: string | null;
  phone: string | null;
  trade_type: string | null;
  company_size: string | null;
  message: string | null;
  status: string | null;
  notes: string | null;
  created_at: string;
}

const STATUSES = ['new', 'contacted', 'demo_scheduled', 'converted', 'closed'] as const;

const STATUS_CHIP: Record<string, string> = {
  new: 'bg-rose-100 text-rose-700 border-rose-200',
  contacted: 'bg-amber-100 text-amber-700 border-amber-200',
  demo_scheduled: 'bg-sky-100 text-sky-700 border-sky-200',
  converted: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  closed: 'bg-gray-100 text-gray-600 border-gray-200',
};

const STATUS_LABEL: Record<string, string> = {
  new: 'New',
  contacted: 'Contacted',
  demo_scheduled: 'Demo scheduled',
  converted: 'Converted',
  closed: 'Closed',
};

function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const secs = Math.floor((Date.now() - then) / 1000);
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function DemoRequestsPage() {
  const [rows, setRows] = useState<DemoRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [filter, setFilter] = useState<string>('all');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const res = await fetch('/api/demo-requests', { headers: await getHeaders() });
      const json = await res.json();
      if (json.success) setRows(json.data || []);
      else setLoadError(true);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const update = async (id: string, patch: { status?: string; notes?: string }) => {
    setSavingId(id);
    try {
      const res = await fetch('/api/demo-requests', {
        method: 'PATCH',
        headers: await getJsonHeaders(),
        body: JSON.stringify({ id, ...patch }),
      });
      const json = await res.json();
      if (json.success && json.data) {
        setRows(prev => prev.map(r => (r.id === id ? { ...r, ...json.data } : r)));
      }
    } catch {
      /* keep current state; user can retry */
    } finally {
      setSavingId(null);
    }
  };

  const visible = filter === 'all' ? rows : rows.filter(r => (r.status || 'new') === filter);
  const counts: Record<string, number> = { all: rows.length };
  for (const s of STATUSES) counts[s] = rows.filter(r => (r.status || 'new') === s).length;

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <span className="w-10 h-10 rounded-xl bg-brand/10 dark:bg-brand/20 flex items-center justify-center">
            <Inbox className="w-5 h-5 text-brand dark:text-brand" />
          </span>
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">Demo requests</h1>
            <p className="text-xs text-gray-500">Leads from the website funnel — newest first</p>
          </div>
        </div>
        <button
          onClick={load}
          className="min-h-[44px] px-4 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-semibold text-gray-600 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors flex items-center gap-2"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      {/* Status filter chips */}
      <div className="flex flex-wrap gap-2 mb-5">
        {['all', ...STATUSES].map(s => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`min-h-[44px] px-4 rounded-xl text-sm font-semibold border transition-colors ${
              filter === s
                ? 'bg-slate-900 text-white border-slate-900 dark:bg-amber-500 dark:text-slate-900 dark:border-amber-500'
                : 'bg-white dark:bg-slate-900 text-gray-600 dark:text-slate-300 border-gray-200 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-800'
            }`}
          >
            {s === 'all' ? 'All' : STATUS_LABEL[s]} ({counts[s] ?? 0})
          </button>
        ))}
      </div>

      {/* Body */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <RefreshCw className="w-7 h-7 text-brand animate-spin" />
        </div>
      ) : loadError ? (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-rose-200 dark:border-rose-900 p-8 text-center">
          <AlertTriangle className="w-8 h-8 text-rose-500 mx-auto mb-3" />
          <p className="text-sm text-gray-600 dark:text-slate-300 mb-4">Couldn&apos;t load demo requests.</p>
          <button onClick={load} className="min-h-[44px] px-5 rounded-xl bg-slate-900 text-white text-sm font-semibold">
            Try again
          </button>
        </div>
      ) : visible.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-700 p-10 text-center">
          <Inbox className="w-9 h-9 text-gray-300 dark:text-slate-600 mx-auto mb-3" />
          <p className="text-sm font-semibold text-gray-700 dark:text-slate-200 mb-1">
            {filter === 'all' ? 'No demo requests yet' : `No ${STATUS_LABEL[filter]?.toLowerCase()} requests`}
          </p>
          <p className="text-xs text-gray-500">
            New submissions from pontifexindustries.com/request-demo land here, and you get an email.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {visible.map(r => {
            const open = expanded === r.id;
            const status = r.status || 'new';
            return (
              <li key={r.id} className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-700 overflow-hidden">
                {/* Row header */}
                <button
                  onClick={() => { setExpanded(open ? null : r.id); setNoteDraft(r.notes || ''); }}
                  className="w-full text-left p-4 sm:p-5 flex items-center gap-3 hover:bg-gray-50/60 dark:hover:bg-slate-800/40 transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <span className="font-bold text-gray-900 dark:text-white truncate">{r.company || '—'}</span>
                      <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold border ${STATUS_CHIP[status]}`}>
                        {STATUS_LABEL[status] || status}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 truncate">
                      {r.name || 'Unknown'} · {r.email || 'no email'} · {timeAgo(r.created_at)}
                    </p>
                  </div>
                  {open ? <ChevronUp className="w-4 h-4 text-gray-400 flex-shrink-0" /> : <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />}
                </button>

                {/* Expanded detail */}
                {open && (
                  <div className="px-4 sm:px-5 pb-5 border-t border-gray-100 dark:border-slate-800 pt-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4 text-sm">
                      <p className="flex items-center gap-2 text-gray-700 dark:text-slate-300">
                        <Mail className="w-4 h-4 text-gray-400" />
                        {r.email ? <a className="text-brand hover:underline break-all" href={`mailto:${r.email}`}>{r.email}</a> : '—'}
                      </p>
                      <p className="flex items-center gap-2 text-gray-700 dark:text-slate-300">
                        <Phone className="w-4 h-4 text-gray-400" />
                        {r.phone ? <a className="text-brand hover:underline" href={`tel:${r.phone}`}>{r.phone}</a> : '—'}
                      </p>
                      <p className="flex items-center gap-2 text-gray-700 dark:text-slate-300">
                        <Building2 className="w-4 h-4 text-gray-400" /> {r.trade_type || '—'}
                      </p>
                      <p className="flex items-center gap-2 text-gray-700 dark:text-slate-300">
                        <UsersIcon className="w-4 h-4 text-gray-400" /> {r.company_size || '—'}
                      </p>
                    </div>

                    {r.message && (
                      <div className="mb-4 p-3 rounded-xl bg-gray-50 dark:bg-slate-800 text-sm text-gray-700 dark:text-slate-300 flex gap-2">
                        <MessageSquareText className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
                        <span className="whitespace-pre-wrap">{r.message}</span>
                      </div>
                    )}

                    {/* Status buttons */}
                    <div className="flex flex-wrap gap-2 mb-4">
                      {STATUSES.map(s => (
                        <button
                          key={s}
                          disabled={savingId === r.id || status === s}
                          onClick={() => update(r.id, { status: s })}
                          className={`min-h-[44px] px-3.5 rounded-xl text-xs font-semibold border transition-colors disabled:opacity-60 ${
                            status === s
                              ? `${STATUS_CHIP[s]} cursor-default`
                              : 'bg-white dark:bg-slate-900 text-gray-600 dark:text-slate-300 border-gray-200 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-800'
                          }`}
                        >
                          {STATUS_LABEL[s]}
                        </button>
                      ))}
                    </div>

                    {/* Notes */}
                    <div className="flex flex-col sm:flex-row gap-2">
                      <textarea
                        value={noteDraft}
                        onChange={e => setNoteDraft(e.target.value)}
                        placeholder="Internal notes (call outcome, follow-up date...)"
                        rows={2}
                        className="flex-1 text-base sm:text-sm rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-800 dark:text-slate-200 p-3 focus:outline-none focus:ring-2 focus:ring-brand/40"
                      />
                      <button
                        disabled={savingId === r.id}
                        onClick={() => update(r.id, { notes: noteDraft })}
                        className="min-h-[44px] px-5 rounded-xl bg-slate-900 dark:bg-amber-500 text-white dark:text-slate-900 text-sm font-semibold disabled:opacity-60 self-end sm:self-auto"
                      >
                        {savingId === r.id ? 'Saving…' : 'Save note'}
                      </button>
                    </div>

                    {/* Convert CTA */}
                    <div className="mt-4 pt-3 border-t border-gray-100 dark:border-slate-800">
                      <Link
                        href={`/dashboard/platform/tenants/new?fromLead=${r.id}`}
                        className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand hover:text-brand-dark"
                      >
                        Convert to tenant — create company code <ArrowRight className="w-4 h-4" />
                      </Link>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
