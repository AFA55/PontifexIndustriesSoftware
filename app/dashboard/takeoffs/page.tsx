'use client';

export const dynamic = 'force-dynamic';

/**
 * Takeoffs — document list + upload.
 * Upload flow: POST /api/takeoffs/documents (signed upload URL) → client
 * PUTs the PDF straight to storage → pdf.js parses pages locally (dims +
 * text + sheet numbers) → POST pages → viewer.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FileUp, Ruler, FileText, Trash2, Sparkles, Loader2 } from 'lucide-react';
import { getCurrentUser } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { takeoffsFetch, TakeoffsApiError, TAKEOFF_ROLES_CLIENT } from '@/components/takeoffs/api';

interface DocRow {
  id: string;
  name: string;
  customer_name: string | null;
  page_count: number;
  status: string;
  file_size_bytes: number | null;
  ai_analyzed_at: string | null;
  created_at: string;
}

export default function TakeoffsListPage() {
  const router = useRouter();
  const [docs, setDocs] = useState<DocRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [notEnabled, setNotEnabled] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const user = getCurrentUser();
    if (!user) {
      router.push('/login');
      return;
    }
    if (!TAKEOFF_ROLES_CLIENT.includes(user.role)) {
      router.push('/dashboard');
      return;
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = useCallback(async () => {
    try {
      const data = await takeoffsFetch<DocRow[]>('/api/takeoffs/documents');
      setDocs(data);
      setError(null);
    } catch (e: any) {
      if (e instanceof TakeoffsApiError && e.status === 403) setNotEnabled(true);
      else setError(e.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  const handleUpload = async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      setError('Only PDF plan sets are supported.');
      return;
    }
    if (file.size > 104857600) {
      setError('That PDF is over the 100 MB limit.');
      return;
    }
    setError(null);
    try {
      setUploading('Preparing upload…');
      const { documentId, storagePath, uploadToken } = await takeoffsFetch<{
        documentId: string;
        storagePath: string;
        uploadUrl: string;
        uploadToken: string;
      }>('/api/takeoffs/documents', {
        method: 'POST',
        body: JSON.stringify({
          name: file.name.replace(/\.pdf$/i, ''),
          file_size_bytes: file.size,
        }),
      });

      setUploading('Uploading PDF…');
      const { error: upErr } = await supabase.storage
        .from('takeoff-documents')
        .uploadToSignedUrl(storagePath, uploadToken, file, { contentType: 'application/pdf' });
      if (upErr) throw new Error(`Upload failed: ${upErr.message}`);

      setUploading('Reading sheets…');
      const buf = await file.arrayBuffer();
      const { loadPdf, parseAllPages } = await import('@/lib/takeoffs/pdf-client');
      const pdf = await loadPdf(buf);
      const pages = await parseAllPages(pdf, (done, total) =>
        setUploading(`Reading sheets… ${done}/${total}`)
      );
      await pdf.cleanup();

      setUploading('Saving…');
      await takeoffsFetch(`/api/takeoffs/documents/${documentId}/pages`, {
        method: 'POST',
        body: JSON.stringify({ pages }),
      });

      router.push(`/dashboard/takeoffs/${documentId}`);
    } catch (e: any) {
      setError(e.message || 'Upload failed');
      setUploading(null);
      load();
    }
  };

  const handleDelete = async (doc: DocRow) => {
    if (!confirm(`Delete "${doc.name}" and all its measurements? This cannot be undone.`)) return;
    try {
      await takeoffsFetch(`/api/takeoffs/documents/${doc.id}`, { method: 'DELETE' });
      setDocs((d) => d.filter((x) => x.id !== doc.id));
    } catch (e: any) {
      setError(e.message || 'Delete failed');
    }
  };

  if (notEnabled) {
    return (
      <div className="p-8 max-w-2xl mx-auto text-center">
        <Ruler className="w-12 h-12 mx-auto text-slate-300 mb-4" />
        <h1 className="text-xl font-bold text-slate-900 dark:text-white mb-2">Takeoffs is not enabled</h1>
        <p className="text-slate-500 text-sm">The takeoffs module is not turned on for this company.</p>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-8 max-w-5xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Ruler className="w-6 h-6 text-violet-600" /> Takeoffs
          </h1>
          <p className="text-sm text-slate-500 mt-1">Upload a plan set, calibrate, and measure your scope.</p>
        </div>
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={!!uploading}
          className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-violet-600 hover:bg-violet-700 disabled:opacity-60 text-white font-semibold text-sm min-h-[44px] transition-colors"
        >
          {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileUp className="w-4 h-4" />}
          {uploading ?? 'Upload plans (PDF)'}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleUpload(f);
            e.target.value = '';
          }}
        />
      </div>

      {error && (
        <div className="mb-4 px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>
      )}

      {loading ? (
        <div className="py-20 text-center text-slate-400">
          <Loader2 className="w-6 h-6 animate-spin mx-auto" />
        </div>
      ) : docs.length === 0 ? (
        <div className="py-20 text-center border-2 border-dashed border-slate-200 dark:border-white/10 rounded-2xl">
          <FileText className="w-10 h-10 mx-auto text-slate-300 mb-3" />
          <p className="text-slate-500 font-medium">No plan sets yet</p>
          <p className="text-slate-400 text-sm mt-1">Upload a bid set PDF to start your first takeoff.</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {docs.map((doc) => (
            <div
              key={doc.id}
              className="group flex items-center gap-4 p-4 rounded-2xl bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 hover:border-violet-300 dark:hover:border-violet-500/50 transition-colors cursor-pointer"
              onClick={() => router.push(`/dashboard/takeoffs/${doc.id}`)}
            >
              <div className="w-11 h-11 rounded-xl bg-violet-100 dark:bg-violet-500/15 flex items-center justify-center shrink-0">
                <FileText className="w-5 h-5 text-violet-600 dark:text-violet-400" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-slate-900 dark:text-white truncate">{doc.name}</p>
                <p className="text-xs text-slate-500 mt-0.5">
                  {doc.page_count} sheet{doc.page_count === 1 ? '' : 's'}
                  {doc.file_size_bytes ? ` · ${(doc.file_size_bytes / 1048576).toFixed(1)} MB` : ''}
                  {' · '}
                  {new Date(doc.created_at).toLocaleDateString()}
                </p>
              </div>
              {doc.ai_analyzed_at && (
                <span className="hidden sm:inline-flex items-center gap-1 text-xs font-medium text-violet-600 bg-violet-50 dark:bg-violet-500/10 px-2.5 py-1 rounded-full">
                  <Sparkles className="w-3 h-3" /> Scope analyzed
                </span>
              )}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleDelete(doc);
                }}
                className="p-2.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors min-h-[44px] min-w-[44px]"
                aria-label={`Delete ${doc.name}`}
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
