'use client';

export const dynamic = 'force-dynamic';

/**
 * Contracts & Change Orders — office view (founder ask Jul 11).
 * Create a contract (work description + terms + amount), email it for
 * e-signature, watch the status move draft → sent → viewed → signed, download
 * the signed PDF, and issue change orders against signed contracts.
 */
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  FileSignature, Plus, Send, Download, ChevronLeft, Loader2, X, FilePlus2, Copy, Check,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/auth';

const OFFICE_ROLES = ['admin', 'super_admin', 'operations_manager', 'salesman'];

interface ContractRow {
  id: string;
  job_id: string | null;
  parent_contract_id: string | null;
  doc_type: 'contract' | 'change_order';
  title: string;
  work_description: string | null;
  terms: string | null;
  amount: number | null;
  customer_name: string;
  customer_email: string;
  status: 'draft' | 'sent' | 'viewed' | 'signed' | 'void';
  sent_at: string | null;
  viewed_at: string | null;
  signed_at: string | null;
  signer_name: string | null;
  pdf_url: string | null;
  created_at: string;
}

const STATUS_STYLES: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-600',
  sent: 'bg-blue-50 text-blue-700',
  viewed: 'bg-amber-50 text-amber-700',
  signed: 'bg-emerald-50 text-emerald-700',
  void: 'bg-rose-50 text-rose-600',
};

async function authedFetch(input: string, init?: RequestInit) {
  const { data } = await supabase.auth.getSession();
  const t = data.session?.access_token;
  return fetch(input, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}), ...(t ? { Authorization: `Bearer ${t}` } : {}) },
  });
}

export default function ContractsPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [rows, setRows] = useState<ContractRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<null | { parent?: ContractRow }>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    const u = getCurrentUser();
    if (!u) { router.push('/login'); return; }
    if (!OFFICE_ROLES.includes(u.role)) { router.push('/dashboard'); return; }
    setReady(true);
  }, [router]);

  const load = useCallback(async () => {
    try {
      const res = await authedFetch('/api/admin/contracts');
      const json = await res.json();
      if (res.ok && json?.success) setRows(json.data.contracts);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (ready) load(); }, [ready, load]);

  const flash = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3500); };

  const sendContract = async (row: ContractRow) => {
    setBusyId(row.id);
    try {
      const res = await authedFetch(`/api/admin/contracts/${row.id}/send`, { method: 'POST' });
      const json = await res.json();
      if (!res.ok) { flash(json?.error || 'Send failed'); return; }
      flash(`Sent to ${row.customer_email}`);
      load();
    } finally {
      setBusyId(null);
    }
  };

  const copySignLink = async (row: ContractRow) => {
    const res = await authedFetch(`/api/admin/contracts/${row.id}/send`, { method: 'POST' });
    const json = await res.json();
    if (res.ok && json?.data?.signUrl) {
      await navigator.clipboard.writeText(json.data.signUrl).catch(() => {});
      setCopiedId(row.id);
      setTimeout(() => setCopiedId(null), 2000);
      flash('Signing link copied (also re-emailed)');
      load();
    } else {
      flash(json?.error || 'Could not get link');
    }
  };

  if (!ready) return null;

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6">
      {/* Header */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard/admin"
            aria-label="Back"
            className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
          >
            <ChevronLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="flex items-center gap-2 text-xl font-bold text-slate-900 dark:text-white">
              <FileSignature className="h-5 w-5 text-brand" /> Contracts
            </h1>
            <p className="text-sm text-slate-500 dark:text-white/50">Send for e-signature · signed PDFs saved automatically</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setModal({})}
          className="flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-brand px-5 text-sm font-semibold text-white hover:opacity-90"
        >
          <Plus className="h-4 w-4" /> New Contract
        </button>
      </div>

      {/* List */}
      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-7 w-7 animate-spin text-slate-300" /></div>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white py-16 text-center dark:border-white/15 dark:bg-white/[0.03]">
          <FileSignature className="mx-auto mb-3 h-10 w-10 text-slate-300" />
          <p className="font-semibold text-slate-700 dark:text-white/80">No contracts yet</p>
          <p className="mt-1 text-sm text-slate-400">Create one and email it for signature in under a minute.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((row) => (
            <div key={row.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-white/[0.03] sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide ${STATUS_STYLES[row.status]}`}>
                      {row.status}
                    </span>
                    {row.doc_type === 'change_order' && (
                      <span className="rounded-full bg-violet-50 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-violet-700">
                        Change order
                      </span>
                    )}
                  </div>
                  <p className="mt-1.5 truncate font-bold text-slate-900 dark:text-white">{row.title}</p>
                  <p className="mt-0.5 text-sm text-slate-500 dark:text-white/50">
                    {row.customer_name} · {row.customer_email}
                    {row.amount != null && <> · <span className="font-semibold text-slate-700 dark:text-white/75">${Number(row.amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}</span></>}
                  </p>
                  {row.status === 'signed' && row.signed_at && (
                    <p className="mt-0.5 text-xs text-emerald-600">
                      Signed by {row.signer_name} · {new Date(row.signed_at).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {(row.status === 'draft' || row.status === 'sent' || row.status === 'viewed') && (
                    <>
                      <button
                        type="button"
                        onClick={() => sendContract(row)}
                        disabled={busyId === row.id}
                        className="flex min-h-[40px] items-center gap-1.5 rounded-lg bg-brand px-3.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
                      >
                        {busyId === row.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                        {row.status === 'draft' ? 'Send for signature' : 'Re-send'}
                      </button>
                      <button
                        type="button"
                        onClick={() => copySignLink(row)}
                        className="flex min-h-[40px] items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:border-white/15 dark:text-white/70"
                      >
                        {copiedId === row.id ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                        Link
                      </button>
                    </>
                  )}
                  {row.status === 'signed' && (
                    <>
                      {row.pdf_url && (
                        <a
                          href={row.pdf_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex min-h-[40px] items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
                        >
                          <Download className="h-3.5 w-3.5" /> Signed PDF
                        </a>
                      )}
                      <button
                        type="button"
                        onClick={() => setModal({ parent: row })}
                        className="flex min-h-[40px] items-center gap-1.5 rounded-lg border border-slate-200 px-3.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:border-white/15 dark:text-white/70"
                      >
                        <FilePlus2 className="h-3.5 w-3.5" /> Change order
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {modal && (
        <CreateContractModal
          parent={modal.parent}
          onClose={() => setModal(null)}
          onCreated={() => { setModal(null); load(); flash('Draft created — hit Send when ready'); }}
        />
      )}

      {toast && (
        <div className="fixed bottom-5 left-1/2 z-50 -translate-x-1/2 rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}

function CreateContractModal({
  parent,
  onClose,
  onCreated,
}: {
  parent?: ContractRow;
  onClose: () => void;
  onCreated: () => void;
}) {
  const isChangeOrder = !!parent;
  const [title, setTitle] = useState(isChangeOrder ? `Change Order — ${parent!.title}` : '');
  const [customerName, setCustomerName] = useState(parent?.customer_name ?? '');
  const [customerEmail, setCustomerEmail] = useState(parent?.customer_email ?? '');
  const [workDescription, setWorkDescription] = useState('');
  const [terms, setTerms] = useState('');
  const [amount, setAmount] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await authedFetch('/api/admin/contracts', {
        method: 'POST',
        body: JSON.stringify({
          title,
          customerName,
          customerEmail,
          workDescription,
          terms,
          amount: amount || null,
          parentContractId: parent?.id ?? null,
          jobId: parent?.job_id ?? null,
          docType: isChangeOrder ? 'change_order' : 'contract',
        }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json?.error || 'Save failed'); return; }
      onCreated();
    } finally {
      setSaving(false);
    }
  };

  const input = 'w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-[15px] text-slate-900 outline-none focus:border-brand focus:ring-2 focus:ring-brand/30';

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/50 p-0 backdrop-blur-sm sm:items-center sm:p-4" onClick={onClose}>
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white p-5 sm:rounded-2xl sm:p-6"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900">{isChangeOrder ? 'New Change Order' : 'New Contract'}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="flex h-10 w-10 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>
        {isChangeOrder && (
          <p className="mb-4 rounded-lg bg-violet-50 px-3 py-2 text-xs font-medium text-violet-700">
            Amends: {parent!.title}
          </p>
        )}
        <div className="space-y-3">
          <input className={input} placeholder="Title (e.g. Core drilling — 500 Main St)" value={title} onChange={(e) => setTitle(e.target.value)} required />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <input className={input} placeholder="Customer name" value={customerName} onChange={(e) => setCustomerName(e.target.value)} required />
            <input className={input} type="email" placeholder="Customer email" value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} required />
          </div>
          <textarea className={`${input} min-h-[110px]`} placeholder="Description of work" value={workDescription} onChange={(e) => setWorkDescription(e.target.value)} />
          <textarea className={`${input} min-h-[90px]`} placeholder="Terms & conditions (optional)" value={terms} onChange={(e) => setTerms(e.target.value)} />
          <input className={input} type="number" step="0.01" min="0" placeholder="Amount (optional, e.g. 4500.00)" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
        {error && <p className="mt-3 text-sm font-medium text-rose-600">{error}</p>}
        <button
          type="submit"
          disabled={saving}
          className="mt-5 flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-brand text-[15px] font-semibold text-white hover:opacity-90 disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Create draft
        </button>
      </form>
    </div>
  );
}
