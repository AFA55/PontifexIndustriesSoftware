'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect, useCallback } from 'react';
import {
  MessageSquareWarning, RefreshCw, Bug, Wand2, Lightbulb, Building2,
  Save, Check, Trash2, Sparkles, ChevronDown, ChevronUp, HelpCircle,
} from 'lucide-react';
import { getHeaders, getJsonHeaders } from '@/components/platform/shared';

// ─── Types ──────────────────────────────────────────────────────────────────

interface AiAnalysis {
  diagnosis: string;
  proposedFix: string;
  confidence: 'low' | 'medium' | 'high';
  followUpQuestion?: string;
}

interface FeedbackItem {
  id: string;
  status: string;
  type: string;
  title: string | null;
  body: string;
  tenant_id: string | null;
  tenant_name: string | null;
  reporter_role: string | null;
  page_url: string | null;
  admin_response: string | null;
  created_at: string;
  ai_analysis: AiAnalysis | null;
  ai_analyzed_at: string | null;
}

const STATUSES = ['open', 'in_review', 'planned', 'done', 'declined'] as const;
type Status = (typeof STATUSES)[number];

const CONFIDENCE_CHIP: Record<AiAnalysis['confidence'], string> = {
  low: 'bg-rose-100 text-rose-700 border-rose-200',
  medium: 'bg-amber-100 text-amber-700 border-amber-200',
  high: 'bg-emerald-100 text-emerald-700 border-emerald-200',
};

const ANALYZABLE_STATUSES = new Set<string>(['open', 'in_review']);

const STATUS_CHIP: Record<string, string> = {
  open: 'bg-rose-100 text-rose-700 border-rose-200',
  in_review: 'bg-amber-100 text-amber-700 border-amber-200',
  planned: 'bg-sky-100 text-sky-700 border-sky-200',
  done: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  declined: 'bg-slate-100 text-slate-500 border-slate-200',
};

const TYPE_META: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  bug: { label: 'Bug', icon: Bug, color: 'text-rose-500' },
  change_request: { label: 'Change request', icon: Wand2, color: 'text-violet-500' },
  idea: { label: 'Idea', icon: Lightbulb, color: 'text-amber-500' },
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

// ─── AI draft analysis panel ────────────────────────────────────────────────

function AiAnalysisPanel({ analysis, analyzedAt }: { analysis: AiAnalysis; analyzedAt: string | null }) {
  return (
    <div className="rounded-xl border-2 border-dashed border-violet-300 dark:border-violet-700 bg-violet-50/60 dark:bg-violet-950/20 p-3.5 space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-xs font-bold text-violet-700 dark:text-violet-300">
          <Sparkles className="w-3.5 h-3.5" />
          AI Draft Analysis (not yet applied)
        </span>
        <span className="px-2 py-0.5 text-[9px] font-black tracking-wide rounded-full bg-violet-600 text-white uppercase">
          Draft
        </span>
      </div>

      <div>
        <p className="text-[10px] font-bold text-violet-500 uppercase tracking-wide mb-0.5">Diagnosis</p>
        <p className="text-sm text-gray-800 dark:text-slate-200 whitespace-pre-wrap">{analysis.diagnosis}</p>
      </div>

      <div>
        <p className="text-[10px] font-bold text-violet-500 uppercase tracking-wide mb-0.5">Proposed fix</p>
        <p className="text-sm text-gray-800 dark:text-slate-200 whitespace-pre-wrap">{analysis.proposedFix}</p>
      </div>

      {analysis.followUpQuestion && (
        <div className="flex items-start gap-1.5 rounded-lg bg-white/70 dark:bg-slate-900/40 p-2">
          <HelpCircle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-gray-700 dark:text-slate-300">
            <span className="font-semibold">Ask the customer:</span> {analysis.followUpQuestion}
          </p>
        </div>
      )}

      <div className="flex items-center justify-between pt-1">
        <span
          className={`px-2 py-0.5 text-[10px] font-bold rounded-full border capitalize ${CONFIDENCE_CHIP[analysis.confidence]}`}
        >
          {analysis.confidence} confidence
        </span>
        {analyzedAt && <span className="text-[10px] text-gray-400">Analyzed {timeAgo(analyzedAt)}</span>}
      </div>
    </div>
  );
}

// ─── Row ────────────────────────────────────────────────────────────────────

function FeedbackRow({
  item,
  onChanged,
  onDeleted,
}: {
  item: FeedbackItem;
  onChanged: (updated: Partial<FeedbackItem> & { id: string }) => void;
  onDeleted: (id: string) => void;
}) {
  const [status, setStatus] = useState<string>(item.status);
  const [response, setResponse] = useState<string>(item.admin_response ?? '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [showAnalysis, setShowAnalysis] = useState(false);

  const dirty = status !== item.status || (response ?? '') !== (item.admin_response ?? '');

  async function save() {
    setSaving(true);
    setSaved(false);
    try {
      const headers = await getJsonHeaders();
      const res = await fetch(`/api/admin/feedback/${item.id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ status, admin_response: response.trim() || null }),
      });
      if (res.ok) {
        onChanged({ id: item.id, status, admin_response: response.trim() || null });
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
    } catch {
      /* swallow — UI stays editable */
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!window.confirm('Delete this feedback item? This cannot be undone.')) return;
    setDeleting(true);
    try {
      const headers = await getHeaders();
      const res = await fetch(`/api/admin/feedback/${item.id}`, {
        method: 'DELETE',
        headers,
      });
      if (res.ok) onDeleted(item.id);
    } catch {
      /* swallow */
    } finally {
      setDeleting(false);
    }
  }

  async function analyze() {
    setAnalyzing(true);
    setAnalysisError(null);
    try {
      const headers = await getHeaders();
      const res = await fetch(`/api/admin/feedback/${item.id}/analyze`, {
        method: 'POST',
        headers,
      });
      const json = await res.json().catch(() => null);
      if (res.ok && json?.data) {
        onChanged({
          id: item.id,
          ai_analysis: json.data.ai_analysis,
          ai_analyzed_at: json.data.ai_analyzed_at,
        });
        setShowAnalysis(true);
      } else {
        setAnalysisError(json?.error || 'Analysis failed. Try again.');
      }
    } catch {
      setAnalysisError('Analysis failed. Try again.');
    } finally {
      setAnalyzing(false);
    }
  }

  const meta = TYPE_META[item.type] ?? TYPE_META.idea;
  const Icon = meta.icon;
  const canAnalyze = ANALYZABLE_STATUSES.has(item.status);

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-700 p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-start gap-3 min-w-0">
          <span className="w-9 h-9 rounded-lg bg-gray-50 dark:bg-slate-800 flex items-center justify-center flex-shrink-0">
            <Icon className={`w-4 h-4 ${meta.color}`} />
          </span>
          <div className="min-w-0">
            <h3 className="font-bold text-gray-900 dark:text-white text-sm">
              {item.title || `(${meta.label})`}
            </h3>
            <p className="text-[11px] text-gray-400 mt-0.5 flex flex-wrap items-center gap-x-1.5">
              <span className="inline-flex items-center gap-1">
                <Building2 className="w-3 h-3" />
                {item.tenant_name || 'Unknown tenant'}
              </span>
              {item.reporter_role && <span>· {item.reporter_role}</span>}
              <span>· {meta.label}</span>
              <span>· {timeAgo(item.created_at)}</span>
            </p>
          </div>
        </div>
        <span
          className={`px-2 py-0.5 text-[10px] font-bold rounded-full border flex-shrink-0 capitalize ${
            STATUS_CHIP[item.status] || 'bg-gray-100 text-gray-500 border-gray-200'
          }`}
        >
          {item.status.replace('_', ' ')}
        </span>
      </div>

      {/* Body */}
      <p className="text-sm text-gray-700 dark:text-slate-300 whitespace-pre-wrap mb-2">
        {item.body}
      </p>
      {item.page_url && (
        <p className="text-[11px] text-gray-400 font-mono mb-3 truncate">{item.page_url}</p>
      )}

      {/* AI draft analysis */}
      {canAnalyze && (
        <div className="mb-3">
          {item.ai_analysis ? (
            <div className="space-y-2">
              <button
                onClick={() => setShowAnalysis(v => !v)}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-violet-600 dark:text-violet-400 hover:text-violet-700"
              >
                <Sparkles className="w-3.5 h-3.5" />
                {showAnalysis ? 'Hide' : 'View'} AI draft analysis
                {showAnalysis ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </button>
              {showAnalysis && (
                <AiAnalysisPanel analysis={item.ai_analysis} analyzedAt={item.ai_analyzed_at} />
              )}
            </div>
          ) : (
            <button
              onClick={analyze}
              disabled={analyzing}
              className="inline-flex items-center gap-1.5 px-3 py-2 min-h-[36px] rounded-lg border border-violet-200 dark:border-violet-800 text-violet-600 dark:text-violet-400 text-xs font-semibold hover:bg-violet-50 dark:hover:bg-violet-950/30 disabled:opacity-50 transition-colors"
            >
              {analyzing ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Sparkles className="w-3.5 h-3.5" />
              )}
              {analyzing ? 'Analyzing…' : 'Analyze with AI'}
            </button>
          )}
          {analysisError && <p className="text-xs text-rose-500 mt-1">{analysisError}</p>}
        </div>
      )}

      {/* Triage controls */}
      <div className="grid grid-cols-1 sm:grid-cols-[auto_1fr_auto] gap-2.5 items-start pt-3 border-t border-gray-100 dark:border-slate-800">
        <select
          value={status}
          onChange={e => setStatus(e.target.value)}
          className="px-3 py-2.5 min-h-[44px] rounded-xl border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm font-medium text-gray-900 dark:text-white capitalize focus:outline-none focus:ring-2 focus:ring-brand/40"
        >
          {STATUSES.map(s => (
            <option key={s} value={s}>
              {s.replace('_', ' ')}
            </option>
          ))}
        </select>

        <input
          type="text"
          value={response}
          onChange={e => setResponse(e.target.value)}
          placeholder="Response to the reporter (optional)…"
          className="px-3 py-2.5 min-h-[44px] rounded-xl border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand/40"
        />

        <div className="flex gap-2">
          <button
            onClick={save}
            disabled={saving || !dirty}
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 min-h-[44px] rounded-xl bg-brand hover:bg-brand-dark disabled:opacity-40 text-white text-sm font-semibold transition-colors"
          >
            {saving ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : saved ? (
              <Check className="w-4 h-4" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            <span className="hidden sm:inline">{saved ? 'Saved' : 'Save'}</span>
          </button>
          <button
            onClick={remove}
            disabled={deleting}
            title="Delete"
            className="inline-flex items-center justify-center px-3 py-2.5 min-h-[44px] min-w-[44px] rounded-xl border border-gray-200 dark:border-slate-600 text-gray-400 hover:text-rose-600 hover:border-rose-200 transition-colors"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Page ───────────────────────────────────────────────────────────────────

export default function PlatformFeedbackPage() {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<FeedbackItem[]>([]);
  const [filter, setFilter] = useState<Status | 'all'>('all');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const headers = await getHeaders();
      const res = await fetch('/api/admin/feedback', { headers });
      if (res.ok) {
        const json = await res.json();
        const list: FeedbackItem[] = Array.isArray(json) ? json : json.data ?? [];
        setItems(list);
      }
    } catch {
      /* leave empty */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function applyChange(updated: Partial<FeedbackItem> & { id: string }) {
    setItems(prev => prev.map(it => (it.id === updated.id ? { ...it, ...updated } : it)));
  }

  function applyDelete(id: string) {
    setItems(prev => prev.filter(it => it.id !== id));
  }

  const counts: Record<string, number> = { all: items.length };
  STATUSES.forEach(s => {
    counts[s] = items.filter(it => it.status === s).length;
  });

  const visible = filter === 'all' ? items : items.filter(it => it.status === filter);

  return (
    <div className="space-y-6">
      {/* Title */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <MessageSquareWarning className="w-5 h-5 text-amber-500" />
            Bug &amp; Feedback Triage
          </h1>
          <p className="text-sm text-gray-500 dark:text-slate-400">
            Every submission across all client companies
          </p>
        </div>
        <button
          onClick={load}
          title="Refresh"
          className="p-2.5 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl border border-gray-200 dark:border-slate-700 text-gray-500 hover:text-gray-900 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Status filter tabs */}
      <div className="flex flex-wrap gap-2">
        {(['all', ...STATUSES] as const).map(s => {
          const active = filter === s;
          return (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`px-3 py-2 min-h-[40px] rounded-xl text-sm font-semibold capitalize transition-colors border ${
                active
                  ? 'bg-brand text-white border-brand'
                  : 'bg-white dark:bg-slate-900 text-gray-600 dark:text-slate-300 border-gray-200 dark:border-slate-700 hover:border-brand/40'
              }`}
            >
              {s === 'all' ? 'All' : s.replace('_', ' ')}
              <span className={`ml-1.5 ${active ? 'text-white/80' : 'text-gray-400'}`}>
                {counts[s] ?? 0}
              </span>
            </button>
          );
        })}
      </div>

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center py-24">
          <RefreshCw className="w-8 h-8 text-amber-500 animate-spin" />
        </div>
      ) : visible.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-700 p-12 text-center">
          <MessageSquareWarning className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <h3 className="font-bold text-gray-900 dark:text-white mb-1">No feedback here</h3>
          <p className="text-sm text-gray-500 dark:text-slate-400">
            {filter === 'all'
              ? 'No feedback has been submitted yet.'
              : `Nothing with status "${filter.replace('_', ' ')}".`}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map(item => (
            <FeedbackRow
              key={item.id}
              item={item}
              onChanged={applyChange}
              onDeleted={applyDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}
