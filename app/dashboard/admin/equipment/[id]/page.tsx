'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useParams } from 'next/navigation';
import {
  ArrowLeft, Package, Loader2, CheckCircle, Edit2, Save, X, Trash2,
  AlertTriangle, Wrench,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { getCurrentUser, type User } from '@/lib/auth';

interface Equipment {
  id: string;
  asset_tag: string | null;
  kind: string | null;
  category: string | null;
  name: string;
  short_name: string | null;
  unit_number: string | null;
  aliases: string[];
  make: string | null;
  model: string | null;
  serial_number: string | null;
  power_source: string | null;
  requires_maintenance_schedule: boolean;
  status: string;
  location: string | null;
  hour_meter: number | null;
  notes: string | null;
  photo_url: string | null;
  current_custodian_id: string | null;
  current_job_order_id: string | null;
  reserved_for_job_id: string | null;
}

const ALLOWED_ROLES = ['shop_manager','admin','super_admin','operations_manager','supervisor','salesman'];
const WRITE_ROLES = ['shop_manager','admin','super_admin','operations_manager'];
const STATUS_TONE: Record<string, string> = {
  available: 'bg-emerald-100 text-emerald-700',
  reserved: 'bg-amber-100 text-amber-700',
  in_use: 'bg-sky-100 text-sky-700',
  pending_putaway: 'bg-teal-100 text-teal-700',
  in_maintenance: 'bg-orange-100 text-orange-700',
  maintenance: 'bg-orange-100 text-orange-700',
  out_of_service: 'bg-rose-100 text-rose-700',
  retired: 'bg-gray-100 text-gray-500',
  assigned: 'bg-indigo-100 text-indigo-700',
};

export default function EquipmentDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params?.id as string;
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  const [eq, setEq] = useState<Equipment | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Edit-mode draft
  const [draft, setDraft] = useState<Partial<Equipment>>({});
  const [aliasesText, setAliasesText] = useState('');

  const canWrite = !!user && WRITE_ROLES.includes(user.role);

  useEffect(() => {
    const cu = getCurrentUser();
    if (!cu) { router.push('/login'); return; }
    if (!ALLOWED_ROLES.includes(cu.role)) { router.push('/dashboard/admin'); return; }
    setUser(cu);
    setAuthLoading(false);
  }, [router]);

  useEffect(() => {
    if (!user || !id) return;
    void fetchEquipment();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, id]);

  async function fetchEquipment() {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const res = await fetch(`/api/admin/equipment/${id}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (res.ok) {
        const json = await res.json();
        setEq(json.data);
        setDraft({});
      }
    } finally {
      setLoading(false);
    }
  }

  function startEdit() {
    if (!eq) return;
    setDraft({
      name: eq.name,
      short_name: eq.short_name,
      unit_number: eq.unit_number,
      kind: eq.kind,
      power_source: eq.power_source,
      category: eq.category,
      make: eq.make,
      model: eq.model,
      serial_number: eq.serial_number,
      status: eq.status,
      location: eq.location,
      notes: eq.notes,
      requires_maintenance_schedule: eq.requires_maintenance_schedule,
    });
    setAliasesText((eq.aliases || []).join(', '));
    setEditing(true);
  }

  async function handleSave() {
    if (!eq) return;
    setSaving(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setError('Session expired'); return; }
      const aliases = aliasesText.split(',').map((s) => s.trim()).filter(Boolean);
      const res = await fetch(`/api/admin/equipment/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ ...draft, aliases }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error || j.details || 'Failed to update');
        return;
      }
      const j = await res.json();
      setEq(j.data);
      setEditing(false);
    } catch (err: any) {
      setError(err.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  async function handleRetire() {
    if (!eq || !confirm('Retire this piece of equipment? It will stop appearing in active inventory but history is preserved.')) return;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const res = await fetch(`/api/admin/equipment/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    if (res.ok) router.push('/dashboard/admin/equipment');
  }

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-slate-900 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-cyan-600" />
      </div>
    );
  }

  if (!eq) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-slate-900 flex items-center justify-center p-6">
        <div className="text-center">
          <p className="text-sm text-gray-500 mb-4">Equipment not found.</p>
          <Link href="/dashboard/admin/equipment" className="text-sm font-semibold text-cyan-600 hover:underline">Back to inventory</Link>
        </div>
      </div>
    );
  }

  const display = eq.short_name && eq.unit_number ? `${eq.short_name} #${eq.unit_number}` : eq.name;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-900 pb-24">
      <div className="max-w-3xl mx-auto p-4 sm:p-6 space-y-5 sm:space-y-6">
        <Link href="/dashboard/admin/equipment" className="inline-flex items-center gap-1.5 text-sm text-gray-600 dark:text-slate-300 hover:text-cyan-600">
          <ArrowLeft className="w-4 h-4" /> Back to Inventory
        </Link>

        {/* Hero */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-cyan-500 via-sky-600 to-blue-600 p-5 sm:p-7 shadow-xl shadow-cyan-500/30 text-white">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3 sm:gap-4">
              <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center ring-1 ring-white/30 flex-shrink-0">
                <Package className="w-7 h-7 text-white" />
              </div>
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold leading-tight">{display}</h1>
                <p className="text-sm text-white/80 mt-0.5 font-mono">{eq.asset_tag || 'No asset tag'}</p>
              </div>
            </div>
            {!editing && canWrite && (
              <div className="flex items-center gap-2">
                <button onClick={startEdit} className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-white/20 hover:bg-white/30 text-white text-sm font-semibold backdrop-blur-sm">
                  <Edit2 className="w-4 h-4" /> Edit
                </button>
              </div>
            )}
          </div>
        </div>

        {error && (
          <div className="rounded-lg bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800/40 p-3 text-sm text-rose-700 dark:text-rose-300">
            {error}
          </div>
        )}

        {/* Status + maintenance */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-xs font-semibold px-3 py-1.5 rounded-full ${STATUS_TONE[eq.status] || STATUS_TONE.available}`}>
            {(eq.status || 'available').replace(/_/g, ' ').toUpperCase()}
          </span>
          {eq.kind && (
            <span className="text-xs font-semibold px-3 py-1.5 rounded-full bg-cyan-50 text-cyan-700 dark:bg-cyan-900/20 dark:text-cyan-300">
              {eq.kind.replace('_', ' ')}
            </span>
          )}
          {eq.power_source && (
            <span className="text-xs font-semibold px-3 py-1.5 rounded-full bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300">
              {eq.power_source}
            </span>
          )}
          {eq.requires_maintenance_schedule && (
            <span className="text-xs font-semibold px-3 py-1.5 rounded-full bg-purple-50 text-purple-700 dark:bg-purple-900/20 dark:text-purple-300 inline-flex items-center gap-1">
              <Wrench className="w-3 h-3" /> Maintenance scheduled
            </span>
          )}
        </div>

        {!editing ? (
          <>
            {/* Identity */}
            <Section title="Identity">
              <Row label="Name">{eq.name}</Row>
              <Row label="Short name">{eq.short_name || '—'}</Row>
              <Row label="Unit number">{eq.unit_number || '—'}</Row>
              <Row label="Aliases">
                {eq.aliases && eq.aliases.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {eq.aliases.map((a, i) => (
                      <span key={i} className="text-xs font-mono bg-gray-100 dark:bg-slate-700 px-2 py-0.5 rounded">{a}</span>
                    ))}
                  </div>
                ) : '—'}
              </Row>
            </Section>

            {/* Manufacturer */}
            <Section title="Manufacturer">
              <Row label="Make">{eq.make || '—'}</Row>
              <Row label="Model">{eq.model || '—'}</Row>
              <Row label="Serial">{eq.serial_number || '—'}</Row>
              <Row label="Category">{eq.category || '—'}</Row>
            </Section>

            {/* Storage */}
            <Section title="Storage + Notes">
              <Row label="Home location">{eq.location || '—'}</Row>
              <Row label="Hour meter">{eq.hour_meter != null ? `${eq.hour_meter} hrs` : '—'}</Row>
              <Row label="Notes">{eq.notes || '—'}</Row>
            </Section>

            {/* Phase 2/3 placeholder panels */}
            <Section title="Maintenance history">
              <p className="text-sm text-gray-500 dark:text-slate-400 italic py-3 text-center">
                Maintenance history appears here once Phase 2 (maintenance requests) ships.
              </p>
            </Section>

            <Section title="Checkout history">
              <p className="text-sm text-gray-500 dark:text-slate-400 italic py-3 text-center">
                Checkout history appears here once Phase 3 (equipment_checkouts UI) ships.
              </p>
            </Section>

            {/* Retire (write-only) */}
            {canWrite && eq.status !== 'retired' && (
              <button
                onClick={handleRetire}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-semibold text-rose-600 bg-rose-50 dark:bg-rose-900/20 hover:bg-rose-100 transition border border-rose-200 dark:border-rose-800/40"
              >
                <Trash2 className="w-4 h-4" /> Retire this equipment
              </button>
            )}
          </>
        ) : (
          /* ───── EDIT MODE ───── */
          <div className="space-y-5">
            <Section title="Identity">
              <Field label="Name" required>
                <input type="text" value={draft.name || ''} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className={inputClass} />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Short name">
                  <input type="text" value={draft.short_name || ''} onChange={(e) => setDraft({ ...draft, short_name: e.target.value })} className={inputClass} />
                </Field>
                <Field label="Unit number" required>
                  <input type="text" value={draft.unit_number || ''} onChange={(e) => setDraft({ ...draft, unit_number: e.target.value })} className={inputClass} />
                </Field>
              </div>
              <Field label="Aliases (comma-separated)">
                <input type="text" value={aliasesText} onChange={(e) => setAliasesText(e.target.value)} className={inputClass} />
              </Field>
            </Section>

            <Section title="Status + Type">
              <Field label="Status">
                <select value={draft.status || ''} onChange={(e) => setDraft({ ...draft, status: e.target.value })} className={inputClass}>
                  {['available','reserved','in_use','pending_putaway','in_maintenance','out_of_service','retired'].map((s) => (
                    <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
                  ))}
                </select>
              </Field>
              <Field label="Kind">
                <select value={draft.kind || ''} onChange={(e) => setDraft({ ...draft, kind: e.target.value })} className={inputClass}>
                  <option value="">—</option>
                  <option value="powered">Powered</option>
                  <option value="hand_tool">Hand tool</option>
                  <option value="accessory">Accessory</option>
                  <option value="trailer">Trailer</option>
                </select>
              </Field>
              {draft.kind === 'powered' && (
                <Field label="Power source">
                  <select value={draft.power_source || ''} onChange={(e) => setDraft({ ...draft, power_source: e.target.value })} className={inputClass}>
                    <option value="">—</option>
                    {['diesel','gas','hydraulic','electric','pneumatic'].map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                </Field>
              )}
              <Field label="Category">
                <input type="text" value={draft.category || ''} onChange={(e) => setDraft({ ...draft, category: e.target.value })} className={inputClass} />
              </Field>
            </Section>

            <Section title="Manufacturer">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Make"><input type="text" value={draft.make || ''} onChange={(e) => setDraft({ ...draft, make: e.target.value })} className={inputClass} /></Field>
                <Field label="Model"><input type="text" value={draft.model || ''} onChange={(e) => setDraft({ ...draft, model: e.target.value })} className={inputClass} /></Field>
              </div>
              <Field label="Serial">
                <input type="text" value={draft.serial_number || ''} onChange={(e) => setDraft({ ...draft, serial_number: e.target.value })} className={inputClass} />
              </Field>
            </Section>

            <Section title="Storage + Notes">
              <Field label="Home location">
                <input type="text" value={draft.location || ''} onChange={(e) => setDraft({ ...draft, location: e.target.value })} className={inputClass} />
              </Field>
              <Field label="Notes">
                <textarea value={draft.notes || ''} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} rows={2} className={inputClass} />
              </Field>
            </Section>
          </div>
        )}
      </div>

      {editing && (
        <div className="fixed bottom-0 inset-x-0 bg-white/95 dark:bg-slate-900/95 backdrop-blur border-t border-gray-200 dark:border-slate-700 shadow-lg z-30">
          <div className="max-w-3xl mx-auto p-3 sm:p-4 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => { setEditing(false); setError(null); }}
              className="inline-flex items-center justify-center gap-1.5 min-h-[44px] px-4 rounded-xl text-sm font-semibold text-gray-700 dark:text-slate-200 bg-gray-100 dark:bg-slate-700"
            >
              <X className="w-4 h-4" /> Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="inline-flex items-center justify-center gap-1.5 min-h-[44px] px-6 rounded-xl bg-gradient-to-br from-cyan-500 to-sky-600 disabled:opacity-50 text-white text-sm font-semibold shadow-lg shadow-cyan-500/30"
            >
              {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</> : <><Save className="w-4 h-4" /> Save changes</>}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const inputClass = 'w-full px-3 py-3 rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-white text-base sm:text-sm focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-200 dark:border-slate-700 p-5 space-y-3">
      <h2 className="text-sm font-semibold text-gray-900 dark:text-white uppercase tracking-wide">{title}</h2>
      {children}
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1">
      <span className="text-sm text-gray-500 dark:text-slate-400 w-32 flex-shrink-0">{label}</span>
      <span className="text-sm text-gray-900 dark:text-white text-right flex-1">{children}</span>
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-sm font-semibold text-gray-700 dark:text-slate-200 mb-1.5 flex items-center gap-1.5">
        {label}{required && <span className="text-rose-500">*</span>}
      </label>
      {children}
    </div>
  );
}
