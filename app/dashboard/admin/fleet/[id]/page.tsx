'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter, useParams } from 'next/navigation';
import {
  ArrowLeft, Truck, Loader2, Edit2, Save, X, AlertTriangle, Wrench,
  Plus, ChevronDown, ChevronUp, Droplets, Shield, CircleDot, CheckCircle2,
  Gauge, DollarSign, User, Calendar, FileText, ClipboardList,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { getCurrentUser, type User as AuthUser } from '@/lib/auth';

// ── Types ─────────────────────────────────────────────────────────────────────

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
    last_service_date: string | null;
    last_service_odometer: number | null;
    next_oil_change_miles: number | null;
  } | null;
}

interface ServiceRecord {
  id: string;
  service_date: string;
  service_type: string;
  odometer_miles: number | null;
  cost: number | null;
  vendor: string | null;
  notes: string | null;
  performed_by: string | null;
  performer: { id: string; full_name: string } | null;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const ALLOWED_ROLES = ['shop_manager','admin','super_admin','operations_manager','supervisor','salesman'];
const WRITE_ROLES   = ['shop_manager','admin','super_admin','operations_manager'];

const SERVICE_TYPES = [
  { value: 'oil_change',  label: 'Oil Change' },
  { value: 'filter',      label: 'Filter' },
  { value: 'brake',       label: 'Brake Service' },
  { value: 'tire',        label: 'Tire Service' },
  { value: 'inspection',  label: 'Inspection' },
  { value: 'repair',      label: 'Repair' },
  { value: 'other',       label: 'Other' },
] as const;

type ServiceType = typeof SERVICE_TYPES[number]['value'];

const TYPE_BADGE: Record<ServiceType, string> = {
  oil_change:  'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-200',
  filter:      'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/50 dark:text-cyan-200',
  brake:       'bg-rose-100 text-rose-800 dark:bg-rose-900/50 dark:text-rose-200',
  tire:        'bg-gray-100 text-gray-700 dark:bg-slate-700 dark:text-slate-300',
  inspection:  'bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-200',
  repair:      'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200',
  other:       'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300',
};

const OIL_CHANGE_INTERVAL = 5000; // miles

// ── Helpers ───────────────────────────────────────────────────────────────────

function isExpiring(dateStr: string | null | undefined, days = 30) {
  if (!dateStr) return false;
  return new Date(dateStr).getTime() - Date.now() < days * 86400_000;
}
function fmtDate(d: string | null | undefined) {
  if (!d) return '—';
  return new Date(`${d}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
function fmtCurrency(n: number | null | undefined) {
  if (n == null) return '—';
  return `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function today() {
  return new Date().toISOString().slice(0, 10);
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function FleetDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params?.id as string;

  const [user, setUser]           = useState<AuthUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [v, setV]                 = useState<VehicleDetail | null>(null);
  const [loading, setLoading]     = useState(true);
  const [editing, setEditing]     = useState(false);
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [draft, setDraft]         = useState<any>({});
  const [activeTab, setActiveTab] = useState<'details' | 'service'>('details');

  // Service history state
  const [serviceRecords, setServiceRecords]     = useState<ServiceRecord[]>([]);
  const [serviceLoading, setServiceLoading]     = useState(false);
  const [showAddForm, setShowAddForm]           = useState(false);
  const [submittingService, setSubmittingService] = useState(false);
  const [serviceError, setServiceError]         = useState<string | null>(null);
  const [serviceDraft, setServiceDraft]         = useState({
    service_date: today(),
    service_type: 'oil_change' as ServiceType,
    odometer_miles: '',
    cost: '',
    vendor: '',
    notes: '',
    performed_by: '',
  });

  const canWrite = !!user && WRITE_ROLES.includes(user.role);

  // ── Auth guard ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const cu = getCurrentUser();
    if (!cu) { router.push('/login'); return; }
    if (!ALLOWED_ROLES.includes(cu.role)) { router.push('/dashboard/admin'); return; }
    setUser(cu);
    setAuthLoading(false);
  }, [router]);

  // ── Fetch vehicle detail ────────────────────────────────────────────────────
  const fetchOne = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const res = await fetch(`/api/admin/fleet/${id}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (res.ok) {
        const json = await res.json();
        setV(json.data);
      }
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (!user || !id) return;
    void fetchOne();
  }, [user, id, fetchOne]);

  // ── Fetch service records ────────────────────────────────────────────────────
  const fetchServiceRecords = useCallback(async () => {
    if (!user || !id) return;
    setServiceLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const res = await fetch(`/api/admin/fleet/${id}/service-records`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (res.ok) {
        const json = await res.json();
        setServiceRecords(json.data ?? []);
      }
    } finally {
      setServiceLoading(false);
    }
  }, [user, id]);

  useEffect(() => {
    if (activeTab === 'service') void fetchServiceRecords();
  }, [activeTab, fetchServiceRecords]);

  // ── Edit handlers ───────────────────────────────────────────────────────────
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
          year:     draft.year     ? Number(draft.year)     : null,
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

  // ── Add service record ────────────────────────────────────────────────────
  async function handleAddService(e: React.FormEvent) {
    e.preventDefault();
    if (!serviceDraft.service_date || !serviceDraft.service_type) return;
    setSubmittingService(true);
    setServiceError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setServiceError('Session expired'); return; }
      const res = await fetch(`/api/admin/fleet/${id}/service-records`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({
          ...serviceDraft,
          odometer_miles: serviceDraft.odometer_miles ? Number(serviceDraft.odometer_miles) : null,
          cost:           serviceDraft.cost           ? Number(serviceDraft.cost)            : null,
          performed_by:   serviceDraft.performed_by   || null,
        }),
      });
      const j = await res.json();
      if (!res.ok) {
        setServiceError(j.error || 'Failed to add service record');
        return;
      }
      // Reset form, close it, refresh list + vehicle detail
      setServiceDraft({
        service_date: today(), service_type: 'oil_change',
        odometer_miles: '', cost: '', vendor: '', notes: '', performed_by: '',
      });
      setShowAddForm(false);
      void fetchServiceRecords();
      void fetchOne(); // refresh vehicle to pick up new last_service_date
    } catch (err: any) {
      setServiceError(err.message || 'Failed to add service record');
    } finally {
      setSubmittingService(false);
    }
  }

  // ── Loading / not found ────────────────────────────────────────────────────
  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-slate-900">
        <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
      </div>
    );
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
  const regExpiringSoon  = isExpiring(v.vehicle?.registration_expiry);
  const insExpiringSoon  = isExpiring(v.vehicle?.insurance_expiry);
  const inspExpiringSoon = isExpiring(v.vehicle?.inspection_expiry);

  // Next oil change ribbon logic
  const lastOdo  = v.vehicle?.last_service_odometer ?? null;
  const nextOilMiles = v.vehicle?.next_oil_change_miles ?? (lastOdo != null ? lastOdo + OIL_CHANGE_INTERVAL : null);
  const currentOdo = v.vehicle?.odometer ?? null;
  const milesUntilOil = nextOilMiles != null && currentOdo != null ? nextOilMiles - currentOdo : null;
  let oilRibbonColor = 'bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-900/20 dark:border-emerald-700 dark:text-emerald-300';
  if (milesUntilOil != null && milesUntilOil <= 0) {
    oilRibbonColor = 'bg-rose-50 border-rose-200 text-rose-800 dark:bg-rose-900/20 dark:border-rose-700 dark:text-rose-300';
  } else if (milesUntilOil != null && milesUntilOil <= 500) {
    oilRibbonColor = 'bg-amber-50 border-amber-200 text-amber-800 dark:bg-amber-900/20 dark:border-amber-700 dark:text-amber-300';
  }

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
            {!editing && canWrite && activeTab === 'details' && (
              <button onClick={startEdit} className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-white/20 hover:bg-white/30 text-white text-sm font-semibold backdrop-blur-sm">
                <Edit2 className="w-4 h-4" /> Edit
              </button>
            )}
          </div>
        </div>

        {error && (
          <div className="rounded-lg bg-rose-50 border border-rose-200 p-3 text-sm text-rose-700 dark:bg-rose-900/20 dark:border-rose-700 dark:text-rose-300">{error}</div>
        )}

        {/* Compliance alerts */}
        {(regExpiringSoon || insExpiringSoon || inspExpiringSoon) && !editing && (
          <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 flex items-start gap-2 dark:bg-amber-900/20 dark:border-amber-700">
            <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
            <div className="text-sm text-amber-800 dark:text-amber-300">
              <p className="font-semibold">Expires soon:</p>
              <ul className="text-xs mt-0.5 list-disc list-inside">
                {regExpiringSoon  && <li>Registration: {fmtDate(v.vehicle?.registration_expiry)}</li>}
                {insExpiringSoon  && <li>Insurance: {fmtDate(v.vehicle?.insurance_expiry)}</li>}
                {inspExpiringSoon && <li>Inspection: {fmtDate(v.vehicle?.inspection_expiry)}</li>}
              </ul>
            </div>
          </div>
        )}

        {/* Tab bar */}
        {!editing && (
          <div className="flex gap-1 bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-1">
            <TabBtn active={activeTab === 'details'} onClick={() => setActiveTab('details')}>
              <ClipboardList className="w-4 h-4" /> Details
            </TabBtn>
            <TabBtn active={activeTab === 'service'} onClick={() => setActiveTab('service')}>
              <Wrench className="w-4 h-4" /> Service History
            </TabBtn>
          </div>
        )}

        {/* ── DETAILS TAB ─────────────────────────────────────────────────── */}
        {(activeTab === 'details' || editing) && (
          <>
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
                      {['available','reserved','in_use','in_maintenance','out_of_service','retired'].map((s) => (
                        <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
                      ))}
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
          </>
        )}

        {/* ── SERVICE HISTORY TAB ─────────────────────────────────────────── */}
        {activeTab === 'service' && !editing && (
          <div className="space-y-4">
            {/* Next-service ribbon */}
            {nextOilMiles != null && (
              <div className={`flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-medium ${oilRibbonColor}`}>
                <Droplets className="w-4 h-4 flex-shrink-0" />
                {milesUntilOil != null && milesUntilOil <= 0
                  ? `Oil change overdue — was due at ${nextOilMiles.toLocaleString()} mi`
                  : milesUntilOil != null
                    ? `Next oil change: ${nextOilMiles.toLocaleString()} mi (${milesUntilOil.toLocaleString()} mi remaining)`
                    : `Next oil change at: ${nextOilMiles.toLocaleString()} mi`
                }
              </div>
            )}

            {/* Add service record */}
            {canWrite && (
              <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-200 dark:border-slate-700">
                <button
                  onClick={() => setShowAddForm((p) => !p)}
                  className="w-full flex items-center justify-between gap-2 px-5 py-4 text-sm font-semibold text-gray-900 dark:text-white"
                >
                  <span className="flex items-center gap-2">
                    <Plus className="w-4 h-4 text-blue-600" />
                    Add Service Record
                  </span>
                  {showAddForm
                    ? <ChevronUp className="w-4 h-4 text-gray-400" />
                    : <ChevronDown className="w-4 h-4 text-gray-400" />
                  }
                </button>

                {showAddForm && (
                  <form onSubmit={handleAddService} className="px-5 pb-5 space-y-4 border-t border-gray-100 dark:border-slate-700 pt-4">
                    {serviceError && (
                      <div className="rounded-lg bg-rose-50 border border-rose-200 p-3 text-sm text-rose-700 dark:bg-rose-900/20 dark:border-rose-700 dark:text-rose-300">{serviceError}</div>
                    )}
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Date" required>
                        <input
                          type="date"
                          value={serviceDraft.service_date}
                          onChange={(e) => setServiceDraft({ ...serviceDraft, service_date: e.target.value })}
                          className={inputClass}
                          required
                        />
                      </Field>
                      <Field label="Type" required>
                        <select
                          value={serviceDraft.service_type}
                          onChange={(e) => setServiceDraft({ ...serviceDraft, service_type: e.target.value as ServiceType })}
                          className={inputClass}
                          required
                        >
                          {SERVICE_TYPES.map((t) => (
                            <option key={t.value} value={t.value}>{t.label}</option>
                          ))}
                        </select>
                      </Field>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Odometer (mi)">
                        <input
                          type="number"
                          min={0}
                          value={serviceDraft.odometer_miles}
                          onChange={(e) => setServiceDraft({ ...serviceDraft, odometer_miles: e.target.value })}
                          placeholder="e.g. 48000"
                          className={inputClass}
                        />
                      </Field>
                      <Field label="Cost ($)">
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          value={serviceDraft.cost}
                          onChange={(e) => setServiceDraft({ ...serviceDraft, cost: e.target.value })}
                          placeholder="e.g. 85.00"
                          className={inputClass}
                        />
                      </Field>
                    </div>
                    <Field label="Vendor / Shop">
                      <input
                        type="text"
                        value={serviceDraft.vendor}
                        onChange={(e) => setServiceDraft({ ...serviceDraft, vendor: e.target.value })}
                        placeholder="e.g. Jiffy Lube"
                        className={inputClass}
                      />
                    </Field>
                    <Field label="Notes">
                      <textarea
                        value={serviceDraft.notes}
                        onChange={(e) => setServiceDraft({ ...serviceDraft, notes: e.target.value })}
                        rows={2}
                        placeholder="Any additional details…"
                        className={inputClass}
                      />
                    </Field>
                    <div className="flex justify-end gap-3 pt-1">
                      <button
                        type="button"
                        onClick={() => { setShowAddForm(false); setServiceError(null); }}
                        className="inline-flex items-center gap-1.5 min-h-[44px] px-4 rounded-xl text-sm font-semibold text-gray-700 dark:text-slate-200 bg-gray-100 dark:bg-slate-700"
                      >
                        <X className="w-4 h-4" /> Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={submittingService}
                        className="inline-flex items-center gap-1.5 min-h-[44px] px-6 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 disabled:opacity-50 text-white text-sm font-semibold shadow-lg shadow-blue-500/30"
                      >
                        {submittingService
                          ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</>
                          : <><CheckCircle2 className="w-4 h-4" /> Save Record</>
                        }
                      </button>
                    </div>
                  </form>
                )}
              </div>
            )}

            {/* Service records list */}
            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-200 dark:border-slate-700">
              <div className="px-5 py-4 border-b border-gray-100 dark:border-slate-700">
                <h2 className="text-sm font-semibold text-gray-900 dark:text-white uppercase tracking-wide">Service Records</h2>
              </div>

              {serviceLoading ? (
                <div className="flex items-center justify-center py-10">
                  <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
                </div>
              ) : serviceRecords.length === 0 ? (
                <div className="py-10 text-center">
                  <Wrench className="w-8 h-8 text-gray-300 dark:text-slate-600 mx-auto mb-2" />
                  <p className="text-sm text-gray-500 dark:text-slate-400 italic">No service records yet.</p>
                </div>
              ) : (
                <ul className="divide-y divide-gray-100 dark:divide-slate-700">
                  {serviceRecords.map((rec) => (
                    <li key={rec.id} className="px-5 py-4 space-y-2">
                      <div className="flex items-start justify-between gap-3 flex-wrap">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${TYPE_BADGE[rec.service_type as ServiceType] ?? TYPE_BADGE.other}`}>
                            {SERVICE_TYPES.find((t) => t.value === rec.service_type)?.label ?? rec.service_type}
                          </span>
                          <span className="text-sm font-semibold text-gray-900 dark:text-white">
                            {fmtDate(rec.service_date)}
                          </span>
                        </div>
                        {rec.cost != null && (
                          <span className="text-sm font-semibold text-gray-700 dark:text-slate-300">
                            {fmtCurrency(rec.cost)}
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500 dark:text-slate-400">
                        {rec.odometer_miles != null && (
                          <span className="flex items-center gap-1">
                            <Gauge className="w-3 h-3" />
                            {rec.odometer_miles.toLocaleString()} mi
                          </span>
                        )}
                        {rec.vendor && (
                          <span className="flex items-center gap-1">
                            <FileText className="w-3 h-3" />
                            {rec.vendor}
                          </span>
                        )}
                        {rec.performer?.full_name && (
                          <span className="flex items-center gap-1">
                            <User className="w-3 h-3" />
                            {rec.performer.full_name}
                          </span>
                        )}
                      </div>
                      {rec.notes && (
                        <p className="text-xs text-gray-600 dark:text-slate-300 bg-gray-50 dark:bg-slate-700/50 rounded-lg px-3 py-2 leading-relaxed">
                          {rec.notes}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Sticky save bar (edit mode only) */}
      {editing && (
        <div className="fixed bottom-0 inset-x-0 bg-white/95 dark:bg-slate-900/95 backdrop-blur border-t border-gray-200 dark:border-slate-700 shadow-lg z-30">
          <div className="max-w-3xl mx-auto p-3 sm:p-4 flex items-center justify-end gap-3">
            <button
              onClick={() => { setEditing(false); setError(null); }}
              className="inline-flex items-center justify-center gap-1.5 min-h-[44px] px-4 rounded-xl text-sm font-semibold text-gray-700 dark:text-slate-200 bg-gray-100 dark:bg-slate-700"
            >
              <X className="w-4 h-4" /> Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="inline-flex items-center justify-center gap-1.5 min-h-[44px] px-6 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 disabled:opacity-50 text-white text-sm font-semibold shadow-lg shadow-blue-500/30"
            >
              {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</> : <><Save className="w-4 h-4" /> Save changes</>}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

const inputClass = 'w-full px-3 py-3 rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-white text-base sm:text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500';

function TabBtn({
  active, onClick, children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg text-sm font-semibold transition-colors min-h-[44px] ${
        active
          ? 'bg-blue-600 text-white shadow'
          : 'text-gray-600 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-700'
      }`}
    >
      {children}
    </button>
  );
}

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
