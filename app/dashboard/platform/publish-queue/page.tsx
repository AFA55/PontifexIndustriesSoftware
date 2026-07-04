'use client';

export const dynamic = 'force-dynamic';

/**
 * Platform Hub — Ad publish queue.
 *
 * Customers activating a hiring job file a publish request; the Pontifex
 * platform owner reviews it here. Approve = green light to run the ad
 * (manually in Ads Manager today; the Meta/TikTok APIs later — same button,
 * different backend). Reject = note back to the customer + job paused.
 * "Mark as published" = the founder clicked Launch in Ads Manager for real.
 *
 * The owner can't open another tenant's dashboard, so each card carries the
 * ad-kit essentials inline (headline, primary text, TikTok caption, bullets,
 * /apply/[slug] destination URL) in an expandable section.
 */

import { useState, useEffect, useCallback } from 'react';
import {
  Megaphone, RefreshCw, Building2, MapPin, DollarSign, Check, X,
  Rocket, ChevronDown, ChevronUp, Copy, Facebook, Instagram, Music2,
  CheckCircle2, Clock, Link as LinkIcon,
} from 'lucide-react';
import { getHeaders, getJsonHeaders } from '@/components/platform/shared';
import {
  PUBLISH_REQUEST_STATUSES,
  type PublishRequestStatus,
  type AdChannel,
} from '@/lib/hiring/types';

// ─── Types (list endpoint payload) ──────────────────────────────────────────

interface QueueJob {
  title: string;
  slug: string;
  location: string | null;
  status: string;
  ad_headline: string | null;
  ad_primary_text: string | null;
  ad_tiktok_caption: string | null;
  ad_bullets: string[];
  channels: AdChannel[];
  daily_budget: number | null;
}

interface QueueItem {
  id: string;
  tenant_id: string;
  job_id: string;
  status: PublishRequestStatus;
  review_note: string | null;
  reviewed_at: string | null;
  channels: AdChannel[];
  daily_budget: number | null;
  created_at: string;
  tenant_name: string;
  tenant_company_code: string | null;
  job: QueueJob | null;
}

const STATUS_CHIP: Record<PublishRequestStatus, string> = {
  pending: 'bg-amber-100 text-amber-700 border-amber-200',
  approved: 'bg-sky-100 text-sky-700 border-sky-200',
  published: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  rejected: 'bg-rose-100 text-rose-700 border-rose-200',
};

const TAB_ORDER: PublishRequestStatus[] = ['pending', 'approved', 'published', 'rejected'];

const CHANNEL_META: Record<AdChannel, { label: string; icon: React.ElementType; chip: string }> = {
  facebook: { label: 'FB', icon: Facebook, chip: 'bg-blue-50 text-blue-700 border-blue-200' },
  instagram: { label: 'IG', icon: Instagram, chip: 'bg-pink-50 text-pink-700 border-pink-200' },
  tiktok: { label: 'TikTok', icon: Music2, chip: 'bg-slate-100 text-slate-700 border-slate-300' },
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

function applyUrl(slug: string): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  return `${origin}/apply/${slug}`;
}

// ─── Copyable field (ad-kit essentials) ─────────────────────────────────────

function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div>
      <div className="flex items-center justify-between mb-0.5">
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">{label}</p>
        <button
          onClick={() => {
            navigator.clipboard?.writeText(value).catch(() => {});
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
          className="inline-flex items-center gap-1 px-2 py-1 min-h-[28px] rounded-md text-[10px] font-semibold text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
          title={`Copy ${label}`}
        >
          {copied ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <p className="text-sm text-gray-800 dark:text-slate-200 whitespace-pre-wrap break-words">{value}</p>
    </div>
  );
}

// ─── Reject modal ───────────────────────────────────────────────────────────

function RejectModal({
  itemTitle,
  onCancel,
  onConfirm,
  busy,
}: {
  itemTitle: string;
  onCancel: () => void;
  onConfirm: (note: string) => void;
  busy: boolean;
}) {
  const [note, setNote] = useState('');
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-4" onClick={onCancel}>
      <div
        className="w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-700 p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="font-bold text-gray-900 dark:text-white mb-1">Reject this publish request?</h3>
        <p className="text-sm text-gray-500 dark:text-slate-400 mb-3">
          &ldquo;{itemTitle}&rdquo; will be paused and the customer will see your note.
        </p>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          autoFocus
          placeholder="Why isn't this ready to run? (shown to the customer)"
          className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-rose-400/50"
        />
        <div className="flex gap-2 mt-3">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-2.5 min-h-[44px] rounded-xl border border-gray-200 dark:border-slate-600 text-sm font-semibold text-gray-600 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(note.trim())}
            disabled={busy || !note.trim()}
            className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2.5 min-h-[44px] rounded-xl bg-rose-600 hover:bg-rose-700 disabled:opacity-40 text-white text-sm font-semibold transition-colors"
          >
            {busy ? <RefreshCw className="w-4 h-4 animate-spin" /> : <X className="w-4 h-4" />}
            Reject
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Card ───────────────────────────────────────────────────────────────────

function RequestCard({
  item,
  onReviewed,
}: {
  item: QueueItem;
  onReviewed: (updated: QueueItem) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [showKit, setShowKit] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const job = item.job;
  const title = job?.title || '(deleted job)';
  // Snapshot at request time; fall back to the job's current values.
  const channels = (item.channels?.length ? item.channels : job?.channels) || [];
  const budget = item.daily_budget ?? job?.daily_budget ?? null;

  async function review(action: 'approve' | 'reject' | 'mark_published', note?: string) {
    setBusy(true);
    setActionError(null);
    try {
      const headers = await getJsonHeaders();
      const res = await fetch(`/api/hiring/publish-requests/${item.id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ action, ...(note ? { note } : {}) }),
      });
      const json = await res.json().catch(() => null);
      if (res.ok && json?.success) {
        setRejecting(false);
        onReviewed({ ...item, ...json.data.request });
      } else {
        setActionError(json?.error || 'Action failed. Try again.');
      }
    } catch {
      setActionError('Action failed. Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-700 p-4 sm:p-5">
      {/* Header row */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-start gap-3 min-w-0">
          <span className="w-9 h-9 rounded-lg bg-gray-50 dark:bg-slate-800 flex items-center justify-center flex-shrink-0">
            <Megaphone className="w-4 h-4 text-violet-500" />
          </span>
          <div className="min-w-0">
            <h3 className="font-bold text-gray-900 dark:text-white text-sm">{title}</h3>
            <p className="text-[11px] text-gray-400 mt-0.5 flex flex-wrap items-center gap-x-1.5">
              <span className="inline-flex items-center gap-1">
                <Building2 className="w-3 h-3" />
                {item.tenant_name}
              </span>
              {job?.location && (
                <span className="inline-flex items-center gap-1">
                  · <MapPin className="w-3 h-3" /> {job.location}
                </span>
              )}
              <span className="inline-flex items-center gap-1">
                · <Clock className="w-3 h-3" /> {timeAgo(item.created_at)}
              </span>
            </p>
          </div>
        </div>
        <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full border flex-shrink-0 capitalize ${STATUS_CHIP[item.status]}`}>
          {item.status}
        </span>
      </div>

      {/* Ad headline */}
      {job?.ad_headline && (
        <p className="text-sm text-gray-700 dark:text-slate-300 font-medium mb-3">
          &ldquo;{job.ad_headline}&rdquo;
        </p>
      )}

      {/* Channels + budget */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        {channels.map((c) => {
          const meta = CHANNEL_META[c];
          if (!meta) return null;
          const Icon = meta.icon;
          return (
            <span
              key={c}
              className={`inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold rounded-full border ${meta.chip}`}
            >
              <Icon className="w-3 h-3" /> {meta.label}
            </span>
          );
        })}
        {channels.length === 0 && (
          <span className="text-[11px] text-gray-400">No channels selected</span>
        )}
        <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold rounded-full border bg-emerald-50 text-emerald-700 border-emerald-200">
          <DollarSign className="w-3 h-3" />
          {budget != null ? `$${budget}/day` : 'No budget set'}
        </span>
      </div>

      {/* Rejection note (visible on rejected cards) */}
      {item.status === 'rejected' && item.review_note && (
        <div className="mb-3 px-3 py-2 rounded-xl bg-rose-50 dark:bg-rose-500/10 border border-rose-100 dark:border-rose-500/20">
          <p className="text-xs text-rose-700 dark:text-rose-300">
            <span className="font-bold">Rejection note:</span> {item.review_note}
          </p>
        </div>
      )}

      {/* Expandable ad-kit essentials */}
      {job && (
        <div className="mb-3">
          <button
            onClick={() => setShowKit((v) => !v)}
            className="inline-flex items-center gap-1.5 min-h-[36px] text-xs font-semibold text-violet-600 dark:text-violet-400 hover:text-violet-700"
          >
            {showKit ? 'Hide' : 'View'} ad kit
            {showKit ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
          {showKit && (
            <div className="mt-2 rounded-xl border border-gray-100 dark:border-slate-800 bg-gray-50/60 dark:bg-slate-800/40 p-3.5 space-y-3">
              {job.ad_headline && <CopyField label="Headline" value={job.ad_headline} />}
              {job.ad_primary_text && <CopyField label="Primary text (FB/IG)" value={job.ad_primary_text} />}
              {job.ad_tiktok_caption && <CopyField label="TikTok caption" value={job.ad_tiktok_caption} />}
              {job.ad_bullets?.length > 0 && (
                <CopyField label="Bullets" value={job.ad_bullets.map((b) => `• ${b}`).join('\n')} />
              )}
              <div className="pt-2 border-t border-gray-200 dark:border-slate-700">
                <CopyField label="Destination link (paste as the ad's URL)" value={applyUrl(job.slug)} />
                <a
                  href={`/apply/${job.slug}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 mt-1 text-[11px] font-semibold text-violet-600 dark:text-violet-400 hover:underline"
                >
                  <LinkIcon className="w-3 h-3" /> Open apply page
                </a>
              </div>
              {!job.ad_headline && !job.ad_primary_text && (
                <p className="text-xs text-gray-400">
                  No ad kit generated yet — the customer activated without generating ad copy.
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {actionError && <p className="text-xs text-rose-500 mb-2">{actionError}</p>}

      {/* Actions */}
      {item.status === 'pending' && (
        <div className="flex gap-2 pt-3 border-t border-gray-100 dark:border-slate-800">
          <button
            onClick={() => review('approve')}
            disabled={busy}
            className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2.5 min-h-[44px] rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white text-sm font-semibold transition-colors"
          >
            {busy ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            Approve
          </button>
          <button
            onClick={() => setRejecting(true)}
            disabled={busy}
            className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2.5 min-h-[44px] rounded-xl border border-rose-200 dark:border-rose-800 text-rose-600 dark:text-rose-400 text-sm font-semibold hover:bg-rose-50 dark:hover:bg-rose-950/30 disabled:opacity-40 transition-colors"
          >
            <X className="w-4 h-4" /> Reject
          </button>
        </div>
      )}
      {item.status === 'approved' && (
        <div className="pt-3 border-t border-gray-100 dark:border-slate-800">
          <button
            onClick={() => review('mark_published')}
            disabled={busy}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-4 py-2.5 min-h-[44px] rounded-xl bg-brand hover:bg-brand-dark disabled:opacity-40 text-white text-sm font-semibold transition-colors"
          >
            {busy ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Rocket className="w-4 h-4" />}
            Mark as published
          </button>
          <p className="text-[11px] text-gray-400 mt-1.5">
            Click after actually launching the ad in Ads Manager.
          </p>
        </div>
      )}

      {rejecting && (
        <RejectModal
          itemTitle={title}
          busy={busy}
          onCancel={() => setRejecting(false)}
          onConfirm={(note) => review('reject', note)}
        />
      )}
    </div>
  );
}

// ─── Page ───────────────────────────────────────────────────────────────────

export default function PublishQueuePage() {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<QueueItem[]>([]);
  const [tab, setTab] = useState<PublishRequestStatus>('pending');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const headers = await getHeaders();
      const res = await fetch('/api/hiring/publish-requests', { headers });
      if (res.ok) {
        const json = await res.json();
        if (json.success) setItems(json.data.requests || []);
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

  function applyReviewed(updated: QueueItem) {
    setItems((prev) => prev.map((it) => (it.id === updated.id ? updated : it)));
  }

  const counts: Record<PublishRequestStatus, number> = {
    pending: 0, approved: 0, published: 0, rejected: 0,
  };
  items.forEach((it) => {
    if ((PUBLISH_REQUEST_STATUSES as readonly string[]).includes(it.status)) counts[it.status] += 1;
  });

  const visible = items.filter((it) => it.status === tab);

  return (
    <div className="space-y-6">
      {/* Title */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Megaphone className="w-5 h-5 text-amber-500" />
            Ad Publish Queue
          </h1>
          <p className="text-sm text-gray-500 dark:text-slate-400">
            Client job activations awaiting your green light to run the ad
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

      {/* Status tabs */}
      <div className="flex flex-wrap gap-2">
        {TAB_ORDER.map((s) => {
          const active = tab === s;
          return (
            <button
              key={s}
              onClick={() => setTab(s)}
              className={`px-3 py-2 min-h-[40px] rounded-xl text-sm font-semibold capitalize transition-colors border ${
                active
                  ? 'bg-brand text-white border-brand'
                  : 'bg-white dark:bg-slate-900 text-gray-600 dark:text-slate-300 border-gray-200 dark:border-slate-700 hover:border-brand/40'
              }`}
            >
              {s}
              <span className={`ml-1.5 ${active ? 'text-white/80' : 'text-gray-400'}`}>
                {counts[s]}
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
          {tab === 'pending' ? (
            <>
              <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto mb-3" />
              <h3 className="font-bold text-gray-900 dark:text-white mb-1">Queue is clear</h3>
              <p className="text-sm text-gray-500 dark:text-slate-400">
                No publish requests waiting for review.
              </p>
            </>
          ) : (
            <>
              <Megaphone className="w-10 h-10 text-gray-300 mx-auto mb-3" />
              <h3 className="font-bold text-gray-900 dark:text-white mb-1">Nothing here</h3>
              <p className="text-sm text-gray-500 dark:text-slate-400">
                No {tab} publish requests yet.
              </p>
            </>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map((item) => (
            <RequestCard key={item.id} item={item} onReviewed={applyReviewed} />
          ))}
        </div>
      )}
    </div>
  );
}
