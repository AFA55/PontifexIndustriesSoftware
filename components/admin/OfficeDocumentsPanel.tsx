'use client';

/**
 * OfficeDocumentsPanel — management-only legal/billing paperwork for a job.
 *
 * Renders ONLY for management roles (the parent page also hides it, this is a
 * second guard). Operators must never see this. Lists attached documents with
 * type badges + cost, an upload control, and a total project-cost summary.
 */

import { useState, useEffect, useCallback } from 'react';
import { FileText, Upload, Trash2, DollarSign, Loader2, ExternalLink } from 'lucide-react';
import { supabase } from '@/lib/supabase';

const MANAGEMENT_ROLES = new Set([
  'admin',
  'super_admin',
  'operations_manager',
  'supervisor',
  'salesman',
]);

const DOC_TYPE_OPTIONS: { value: DocType; label: string }[] = [
  { value: 'contract', label: 'Contract' },
  { value: 'change_order', label: 'Change Order' },
  { value: 'signed_legal', label: 'Signed Legal' },
  { value: 'permit', label: 'Permit' },
  { value: 'invoice_doc', label: 'Invoice Doc' },
  { value: 'other', label: 'Other' },
];

type DocType = 'contract' | 'change_order' | 'signed_legal' | 'permit' | 'invoice_doc' | 'other';

const DOC_TYPE_LABEL: Record<DocType, string> = {
  contract: 'Contract',
  change_order: 'Change Order',
  signed_legal: 'Signed Legal',
  permit: 'Permit',
  invoice_doc: 'Invoice Doc',
  other: 'Other',
};

const DOC_TYPE_CHIP: Record<DocType, string> = {
  contract: 'bg-violet-50 text-violet-700 ring-violet-200 dark:bg-violet-500/15 dark:text-violet-300 dark:ring-violet-400/20',
  change_order: 'bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-400/20',
  signed_legal: 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-400/20',
  permit: 'bg-sky-50 text-sky-700 ring-sky-200 dark:bg-sky-500/15 dark:text-sky-300 dark:ring-sky-400/20',
  invoice_doc: 'bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-500/15 dark:text-rose-300 dark:ring-rose-400/20',
  other: 'bg-slate-100 text-slate-600 ring-slate-200 dark:bg-white/10 dark:text-white/70 dark:ring-white/15',
};

interface OfficeDocument {
  id: string;
  file_url: string | null;
  file_name: string | null;
  file_size: number | null;
  doc_type: DocType;
  description: string | null;
  total_cost: number | null;
  created_at: string;
  uploader?: { full_name: string | null } | null;
}

async function getToken(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token || '';
}

function formatBytes(bytes: number | null): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatMoney(n: number): string {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function OfficeDocumentsPanel({ jobId, userRole }: { jobId: string; userRole: string }) {
  const [docs, setDocs] = useState<OfficeDocument[]>([]);
  const [totalCost, setTotalCost] = useState(0);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // New-doc form state
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [docType, setDocType] = useState<DocType>('other');
  const [description, setDescription] = useState('');
  const [costInput, setCostInput] = useState('');

  const allowed = MANAGEMENT_ROLES.has(userRole);

  const fetchDocs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await getToken();
      const res = await fetch(`/api/admin/jobs/${jobId}/office-documents`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to load documents');
      setDocs(json.data?.documents || []);
      setTotalCost(Number(json.data?.total_cost || 0));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load documents');
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => {
    if (allowed) fetchDocs();
  }, [allowed, fetchDocs]);

  // Second guard — never render for non-management roles.
  if (!allowed) return null;

  const handleUpload = async () => {
    if (!pendingFile) return;
    setUploading(true);
    setError(null);
    try {
      const token = await getToken();

      // 1. Upload the file to the private bucket.
      const fd = new FormData();
      fd.append('file', pendingFile);
      const upRes = await fetch(`/api/admin/jobs/${jobId}/office-documents/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      const upJson = await upRes.json();
      if (!upRes.ok) throw new Error(upJson.error || 'Upload failed');

      // 2. Create the metadata record.
      const recRes = await fetch(`/api/admin/jobs/${jobId}/office-documents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          file_url: upJson.url,
          file_name: upJson.file_name || pendingFile.name,
          file_size: upJson.file_size ?? pendingFile.size,
          doc_type: docType,
          description: description.trim() || null,
          total_cost: costInput.trim() === '' ? null : Number(costInput),
        }),
      });
      const recJson = await recRes.json();
      if (!recRes.ok) throw new Error(recJson.error || 'Failed to save document');

      // Reset form + refresh.
      setPendingFile(null);
      setDocType('other');
      setDescription('');
      setCostInput('');
      await fetchDocs();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (docId: string) => {
    if (!window.confirm('Delete this document? This cannot be undone.')) return;
    setDeletingId(docId);
    setError(null);
    try {
      const token = await getToken();
      const res = await fetch(`/api/admin/jobs/${jobId}/office-documents/${docId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error || 'Failed to delete');
      }
      await fetchDocs();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="
      rounded-2xl p-6 shadow-sm
      bg-white border border-slate-200
      dark:bg-gradient-to-br dark:from-[#180c2c]/80 dark:to-[#0e0720]/80
      dark:border-white/10 dark:backdrop-blur
    ">
      <div className="flex items-center gap-2 mb-1">
        <span className="inline-flex items-center justify-center w-8 h-8 rounded-xl bg-violet-50 text-violet-600 dark:bg-violet-500/15 dark:text-violet-300">
          <FileText className="w-4 h-4" />
        </span>
        <h2 className="text-base font-semibold text-slate-900 dark:text-white">Office Documents</h2>
      </div>
      <p className="text-xs text-slate-400 dark:text-white/40 mb-4 pl-10">
        Management only — contracts, change orders, signed legal &amp; billing paperwork.
      </p>

      {/* Total project cost summary */}
      <div className="
        flex items-center justify-between rounded-xl px-4 py-3 mb-4
        bg-emerald-50 border border-emerald-200
        dark:bg-emerald-500/10 dark:border-emerald-400/20
      ">
        <span className="inline-flex items-center gap-2 text-sm font-medium text-emerald-800 dark:text-emerald-300">
          <DollarSign className="w-4 h-4" />
          Total project cost
        </span>
        <span className="text-lg font-bold tabular-nums text-emerald-700 dark:text-emerald-300">
          {formatMoney(totalCost)}
        </span>
      </div>

      {error && (
        <div className="mb-3 rounded-lg px-3 py-2 text-sm bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:border-rose-400/20">
          {error}
        </div>
      )}

      {/* Document list */}
      {loading ? (
        <div className="py-8 flex justify-center">
          <Loader2 className="w-5 h-5 animate-spin text-slate-300 dark:text-white/30" />
        </div>
      ) : docs.length === 0 ? (
        <div className="text-center py-6">
          <FileText className="w-9 h-9 text-slate-200 dark:text-white/15 mx-auto mb-2" />
          <p className="text-sm text-slate-500 dark:text-white/50">No documents attached yet.</p>
        </div>
      ) : (
        <ul className="space-y-2 mb-4">
          {docs.map((d) => (
            <li
              key={d.id}
              className="
                flex items-start gap-3 rounded-xl px-3 py-2.5
                bg-slate-50 border border-slate-200
                dark:bg-white/5 dark:border-white/10
              "
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium ring-1 ${DOC_TYPE_CHIP[d.doc_type]}`}>
                    {DOC_TYPE_LABEL[d.doc_type]}
                  </span>
                  {d.total_cost != null && (
                    <span className="text-xs font-semibold tabular-nums text-emerald-600 dark:text-emerald-300">
                      {formatMoney(Number(d.total_cost))}
                    </span>
                  )}
                </div>
                {d.file_url ? (
                  <a
                    href={d.file_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1 inline-flex items-center gap-1 text-sm font-medium text-slate-800 dark:text-white hover:text-violet-600 dark:hover:text-violet-300 truncate"
                  >
                    <span className="truncate">{d.file_name || 'Document'}</span>
                    <ExternalLink className="w-3.5 h-3.5 flex-shrink-0" />
                  </a>
                ) : (
                  <span className="mt-1 block text-sm font-medium text-slate-800 dark:text-white truncate">
                    {d.file_name || 'Document'}
                  </span>
                )}
                {d.description && (
                  <p className="text-xs text-slate-500 dark:text-white/50 mt-0.5">{d.description}</p>
                )}
                <p className="text-[11px] text-slate-400 dark:text-white/35 mt-0.5">
                  {formatDate(d.created_at)}
                  {d.file_size ? ` · ${formatBytes(d.file_size)}` : ''}
                  {d.uploader?.full_name ? ` · ${d.uploader.full_name}` : ''}
                </p>
              </div>
              <button
                onClick={() => handleDelete(d.id)}
                disabled={deletingId === d.id}
                aria-label="Delete document"
                className="
                  inline-flex items-center justify-center w-11 h-11 rounded-lg flex-shrink-0
                  text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10
                  disabled:opacity-50
                "
              >
                {deletingId === d.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Upload control */}
      <div className="rounded-xl p-4 bg-slate-50 border border-dashed border-slate-300 dark:bg-white/5 dark:border-white/15">
        <label className="block text-xs font-medium text-slate-600 dark:text-white/60 mb-2">
          Attach a document
        </label>

        <input
          type="file"
          onChange={(e) => setPendingFile(e.target.files?.[0] || null)}
          className="
            block w-full text-sm text-slate-600 dark:text-white/70 mb-3
            file:mr-3 file:py-2.5 file:px-4 file:rounded-lg file:border-0
            file:text-sm file:font-medium file:bg-violet-100 file:text-violet-700
            dark:file:bg-violet-500/20 dark:file:text-violet-300
            file:cursor-pointer
          "
        />

        <div className="grid grid-cols-2 gap-2 mb-3">
          <select
            value={docType}
            onChange={(e) => setDocType(e.target.value as DocType)}
            className="
              min-h-[44px] rounded-lg px-3 py-2 text-sm
              bg-white border border-slate-200 text-slate-900
              dark:bg-white/5 dark:border-white/10 dark:text-white
              focus:outline-none focus:ring-2 focus:ring-violet-400
            "
          >
            {DOC_TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <div className="relative">
            <DollarSign className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-white/40" />
            <input
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              value={costInput}
              onChange={(e) => setCostInput(e.target.value)}
              placeholder="Cost (optional)"
              className="
                w-full min-h-[44px] rounded-lg pl-8 pr-3 py-2 text-sm tabular-nums
                bg-white border border-slate-200 text-slate-900 placeholder-slate-400
                dark:bg-white/5 dark:border-white/10 dark:text-white dark:placeholder-white/35
                focus:outline-none focus:ring-2 focus:ring-violet-400
              "
            />
          </div>
        </div>

        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Description (optional)"
          className="
            w-full min-h-[44px] rounded-lg px-3 py-2 text-sm mb-3
            bg-white border border-slate-200 text-slate-900 placeholder-slate-400
            dark:bg-white/5 dark:border-white/10 dark:text-white dark:placeholder-white/35
            focus:outline-none focus:ring-2 focus:ring-violet-400
          "
        />

        <button
          onClick={handleUpload}
          disabled={!pendingFile || uploading}
          className="
            w-full min-h-[44px] inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors
            bg-violet-600 text-white hover:bg-violet-700 shadow-sm shadow-violet-600/20
            dark:bg-violet-500 dark:hover:bg-violet-400
            disabled:opacity-50 disabled:cursor-not-allowed
          "
        >
          {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
          {uploading ? 'Uploading…' : 'Upload Document'}
        </button>
      </div>
    </div>
  );
}
