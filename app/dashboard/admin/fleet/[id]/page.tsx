'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useParams } from 'next/navigation';
import {
  ArrowLeft, Truck, Loader2, Edit2, Save, X, AlertTriangle, Wrench,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { getCurrentUser, type User } from '@/lib/auth';

interface VehicleDetail {
  id: string;
  asset_tag: string | null;
  name: string;
  short_name: string | null;
  unit_number: string | null;
  make: string | null;
  model: string | null;
  status: string;
  location: string | null;
  notes: string | null;
  vehicle: {
    vin: string | null;
    license_plate: string | null;
    year: number | null;
    fuel_type: string | null;
    odometer: number | null;
    registration_expiry: string | null;
    insurance_expiry: string | null;
    inspection_expiry: string | null;
  } | null;
}

const ALLOWED_ROLES = ['shop_manager','admin','super_admin','operations_manager','supervisor','salesman'];
const WRITE_ROLES = ['shop_manager','admin','super_admin','operations_manager'];

function isExpiring(dateStr: string | null | undefined, days = 30) {
  if (!dateStr) return false;
  return new Date(dateStr).getTime() - Date.now() < days * 86400_000;
}
function fmtDate(d: string | null | undefined) {
  if (!d) return '—';
  return new Date(`${d}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function FleetDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params?.id as string;
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [v, setV] = useState<VehicleDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<any>({});

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
    void fetchOne();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, id]);

  async function fetchOne() {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const res = await fetch(`/api/admin/fleet/${id}`, { headers: { Authorization: `Bearer ${session.access_token}` } });
      if (res.ok) {
        const json = await res.json();
        setV(json.data);
      }
    } finally {
      setLoading(false);
    }
  }

  function startEdit() {
    if (!v) return;
    setDraft({
      name: v.name, short_name: v.short_name, unit_number: v.unit_number,
      make: v.make, model: v.model, status: v.status, location: v.location, notes: v.notes,
      vin: v.vehicle?.vin, license_plate: v.vehicle?.license_plate, year: v.vehicle?.year,
      fuel_type: v.vehicle?.fuel_type, odometer: v.vehicle?.odometer,
      registration_expiry: v.vehicle?.registration_expiry,
      insurance_expiry: v.vehicle?.insurance_expiry,
      inspection_expiry: v.vehicle?.inspection_expiry,
    });
    setEditing(true);
  }

  async function handleSave() {
    if (!v) return;
    setSaving(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setError('Session expired'); return; }
      const res = await fetch(`/api/admin/fleet/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({
          ...draft,
          year: draft.year ? Number(draft.year) : null,
          odometer: draft.odometer ? Number(draft.odometer) : 0,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error || j.details || 'Failed to update');
        return;
      }
      const j = await res.json();
      setV(j.data);
      setEditing(false);
    } catch (err: any) {
      setError(err.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  if (authLoading || loading) {
    return <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-slate-900"><Loader2 className="w-6 h-6 animate-spin text-blue-600" /></div>;
  }
  if (!v) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-gray-50 dark:bg-slate-900 text-center">
        <div>
          <p className="text-sm text-gray-500 mb-4">Vehicle not found.</p>
          <Link href="/dashboard/admin/fleet" className="text-sm font-semibold text-blue-600 hover:underline">Back to Fleet</Link>
        </div>
      </div>
    );
  }

  const display = v.short_name && v.unit_number ? `${v.short_name} #${v.unit_number}` : v.name;
  const regExpiringSoon = isExpiring(v.vehicle?.registration_expiry);
  const insExpiringSoon = isExpiring(v.vehicle?.insurance_expiry);
  const inspExpiringSoon = isExpiring(v.vehicle?.inspection_expiry);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-900 pb-24">
      <div className="max-w-3xl mx-auto p-4 sm:p-6 space-y-5 sm:space-y-6">
        <Link href="/dashboard/admin/fleet" className="inline-flex items-center gap-1.5 text-sm text-gray-600 dark:text-slate-300 hover:text-blue-600">
          <ArrowLeft className="w-4 h-4" /> Back to Fleet
        </Link>

        {/* Hero */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-blue-500 via-indigo-600 to-purple-600 p-5 sm:p-7 shadow-xl shadow-blue-500/30 text-white">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3 sm:gap-4">
              <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center ring-1 ring-white/30 flex-shrink-0">
                <Truck className="w-7 h-7 text-white" />
              </div>
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold leading-tight">{display}</h1>
                <p className="text-sm text-white/80 mt-0.5 font-mono">{v.asset_tag || 'No asset tag'}</p>
              </div>
            </div>
            {!editing && canWrite && (
              <button onClick={startEdit} className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-white/20 hover:bg-white/30 text-white text-sm font-semibold backdrop-blur-sm">
                <Edit2 className="w-4 h-4" /> Edit
              </button>
            )}
          </div>
        </div>

        {error && <div className="rounded-lg bg-rose-50 border border-rose-200 p-3 text-sm text-rose-700">{error}</div>}

        {/* Compliance alerts */}
        {(regExpiringSoon || insExpiringSoon || inspExpiringSoon) && !editing && (
          <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
            <div className="text-sm text-amber-800">
              <p className="font-semibold">Expires soon:</p>
              <ul className="text-xs mt-0.5 list-disc list-inside">
                {regExpiringSoon && <li>Registration: {fmtDate(v.vehicle?.registration_expiry)}</li>}
                {insExpiringSoon && <li>Insurance: {fmtDate(v.vehicle?.insurance_expiry)}</li>}
                {inspExpiringSoon && <li>Inspection: {fmtDate(v.vehicle?.inspection_expiry)}</li>}
              </ul>
            </div>
          </div>
        )}

        {!editing ? (
          <>
            <Section title="Identity">
              <Row label="Name">{v.name}</Row>
              <Row label="Short name">{v.short_name || '—'}</Row>
              <Row label="Unit number">{v.unit_number || '—'}</Row>
              <Row label="Status"><span className="font-semibold">{(v.status || 'available').replace(/_/g, ' ')}</span></Row>
            </Section>

            <Section title="Vehicle">
              <Row label="Make">{v.make || '—'}</Row>
              <Row label="Model">{v.model || '—'}</Row>
              <Row label="Year">{v.vehicle?.year ?? '—'}</Row>
              <Row label="Fuel">{v.vehicle?.fuel_type || '—'}</Row>
              <Row label="VIN"><span className="font-mono text-xs">{v.vehicle?.vin || '—'}</span></Row>
              <Row label="License plate"><span className="font-mono">{v.vehicle?.license_plate || '—'}</span></Row>
              <Row label="Odometer">{v.vehicle?.odometer != null ? `${v.vehicle.odometer.toLocaleString()} mi` : '—'}</Row>
            </Section>

            <Section title="Compliance dates">
              <Row label="Registration">{fmtDate(v.vehicle?.registration_expiry)}</Row>
              <Row label="Insurance">{fmtDate(v.vehicle?.insurance_expiry)}</Row>
              <Row label="Inspection">{fmtDate(v.vehicle?.inspection_expiry)}</Row>
            </Section>

            <Section title="Storage + Notes">
              <Row label="Home location">{v.location || '—'}</Row>
              <Row label="Notes">{v.notes || '—'}</Row>
            </Section>

            <Section title="Maintenance history">
              <p className="text-sm text-gray-500 dark:text-slate-400 italic py-3 text-center">
                Maintenance history appears here once Phase 4 (schedules + work orders) ships.
              </p>
            </Section>
          </>
        ) : (
          <div className="space-y-5">
            <Section title="Identity">
              <Field label="Name" required><input type="text" value={draft.name || ''} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className={inputClass} /></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Short name"><input type="text" value={draft.short_name || ''} onChange={(e) => setDraft({ ...draft, short_name: e.target.value })} className={inputClass} /></Field>
                <Field label="Unit #"><input type="text" value={draft.unit_number || ''} onChange={(e) => setDraft({ ...draft, unit_number: e.target.value })} className={inputClass} /></Field>
              </div>
              <Field label="Status">
                <select value={draft.status || ''} onChange={(e) => setDraft({ ...draft, status: e.target.value })} className={inputClass}>
                  {['available','reserved','in_use','in_maintenance','out_of_service','retired'].map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
                </select>
              </Field>
            </Section>

            <Section title="Vehicle">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Make"><input type="text" value={draft.make || ''} onChange={(e) => setDraft({ ...draft, make: e.target.value })} className={inputClass} /></Field>
                <Field label="Model"><input type="text" value={draft.model || ''} onChange={(e) => setDraft({ ...draft, model: e.target.value })} className={inputClass} /></Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Year"><input type="number" value={draft.year || ''} onChange={(e) => setDraft({ ...draft, year: e.target.value })} className={inputClass} /></Field>
                <Field label="Fuel">
                  <select value={draft.fuel_type || ''} onChange={(e) => setDraft({ ...draft, fuel_type: e.target.value })} className={inputClass}>
                    <option value="diesel">Diesel</option>
                    <option value="gasoline">Gasoline</option>
                    <option value="electric">Electric</option>
                    <option value="hybrid">Hybrid</option>
                  </select>
                </Field>
              </div>
              <Field label="VIN"><input type="text" value={draft.vin || ''} onChange={(e) => setDraft({ ...draft, vin: e.target.value })} className={inputClass} /></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Plate"><input type="text" value={draft.license_plate || ''} onChange={(e) => setDraft({ ...draft, license_plate: e.target.value })} className={inputClass} /></Field>
                <Field label="Odometer"><input type="number" value={draft.odometer || 0} onChange={(e) => setDraft({ ...draft, odometer: e.target.value })} className={inputClass} /></Field>
              </div>
            </Section>

            <Section title="Compliance dates">
              <Field label="Registration expiry"><input type="date" value={draft.registration_expiry || ''} onChange={(e) => setDraft({ ...draft, registration_expiry: e.target.value })} className={inputClass} /></Field>
              <Field label="Insurance expiry"><input type="date" value={draft.insurance_expiry || ''} onChange={(e) => setDraft({ ...draft, insurance_expiry: e.target.value })} className={inputClass} /></Field>
              <Field label="Inspection expiry"><input type="date" value={draft.inspection_expiry || ''} onChange={(e) => setDraft({ ...draft, inspection_expiry: e.target.value })} className={inputClass} /></Field>
            </Section>

            <Section title="Storage + Notes">
              <Field label="Home location"><input type="text" value={draft.location || ''} onChange={(e) => setDraft({ ...draft, location: e.target.value })} className={inputClass} /></Field>
              <Field label="Notes"><textarea value={draft.notes || ''} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} rows={2} className={inputClass} /></Field>
            </Section>
          </div>
        )}
      </div>

      {editing && (
        <div className="fixed bottom-0 inset-x-0 bg-white/95 dark:bg-slate-900/95 backdrop-blur border-t border-gray-200 dark:border-slate-700 shadow-lg z-30">
          <div className="max-w-3xl mx-auto p-3 sm:p-4 flex items-center justify-end gap-3">
            <button onClick={() => { setEditing(false); setError(null); }} className="inline-flex items-center justify-center gap-1.5 min-h-[44px] px-4 rounded-xl text-sm font-semibold text-gray-700 dark:text-slate-200 bg-gray-100 dark:bg-slate-700">
              <X className="w-4 h-4" /> Cancel
            </button>
            <button onClick={handleSave} disabled={saving} className="inline-flex items-center justify-center gap-1.5 min-h-[44px] px-6 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 disabled:opacity-50 text-white text-sm font-semibold shadow-lg shadow-blue-500/30">
              {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</> : <><Save className="w-4 h-4" /> Save changes</>}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const inputClass = 'w-full px-3 py-3 rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-white text-base sm:text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500';

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
