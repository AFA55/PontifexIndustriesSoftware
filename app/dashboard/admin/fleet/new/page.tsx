'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Truck, Loader2, CheckCircle } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { getCurrentUser, type User } from '@/lib/auth';

const ALLOWED_ROLES = ['shop_manager','admin','super_admin','operations_manager'];

export default function NewVehiclePage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  const [name, setName] = useState('');
  const [shortName, setShortName] = useState('');
  const [unitNumber, setUnitNumber] = useState('');
  const [make, setMake] = useState('');
  const [model, setModel] = useState('');
  const [year, setYear] = useState('');
  const [vin, setVin] = useState('');
  const [licensePlate, setLicensePlate] = useState('');
  const [fuelType, setFuelType] = useState('diesel');
  const [odometer, setOdometer] = useState('');
  const [registrationExpiry, setRegistrationExpiry] = useState('');
  const [insuranceExpiry, setInsuranceExpiry] = useState('');
  const [inspectionExpiry, setInspectionExpiry] = useState('');
  const [notes, setNotes] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ id: string; asset_tag: string } | null>(null);

  useEffect(() => {
    const cu = getCurrentUser();
    if (!cu) { router.push('/login'); return; }
    if (!ALLOWED_ROLES.includes(cu.role)) { router.push('/dashboard/admin'); return; }
    setUser(cu);
    setAuthLoading(false);
  }, [router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) { setError('Vehicle name is required.'); return; }
    if (!unitNumber.trim()) { setError('Unit number is required (e.g. truck 5).'); return; }

    setSubmitting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setError('Session expired'); return; }

      const res = await fetch('/api/admin/fleet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({
          name: name.trim(),
          short_name: shortName.trim() || null,
          unit_number: unitNumber.trim(),
          make: make.trim() || null,
          model: model.trim() || null,
          year: year ? parseInt(year, 10) : null,
          vin: vin.trim() || null,
          license_plate: licensePlate.trim() || null,
          fuel_type: fuelType,
          odometer: odometer ? parseFloat(odometer) : 0,
          registration_expiry: registrationExpiry || null,
          insurance_expiry: insuranceExpiry || null,
          inspection_expiry: inspectionExpiry || null,
          notes: notes.trim() || null,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error || j.details || 'Failed to create vehicle');
        return;
      }
      const j = await res.json();
      setSuccess({ id: j.data.id, asset_tag: j.data.asset_tag });
    } catch (err: any) {
      setError(err.message || 'Failed to create vehicle');
    } finally {
      setSubmitting(false);
    }
  }

  if (authLoading) {
    return <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-slate-900"><Loader2 className="w-6 h-6 animate-spin text-blue-600" /></div>;
  }

  if (success) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-slate-900 flex items-center justify-center p-6">
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg border border-emerald-200 dark:border-emerald-900/40 p-8 max-w-md w-full text-center">
          <div className="w-14 h-14 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-7 h-7 text-emerald-600 dark:text-emerald-400" />
          </div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">Vehicle added</h2>
          <p className="text-sm text-gray-500 dark:text-slate-400">Asset tag: <strong className="font-mono">{success.asset_tag}</strong></p>
          <div className="flex gap-2 mt-5">
            <Link href={`/dashboard/admin/fleet/${success.id}`} className="flex-1 px-4 py-2.5 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white text-sm font-semibold">View</Link>
            <Link href="/dashboard/admin/fleet" className="flex-1 px-4 py-2.5 rounded-xl bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-slate-200 text-sm font-semibold text-center">Back</Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-900 pb-24">
      <div className="max-w-3xl mx-auto p-4 sm:p-6 space-y-5 sm:space-y-6">
        <Link href="/dashboard/admin/fleet" className="inline-flex items-center gap-1.5 text-sm text-gray-600 dark:text-slate-300 hover:text-blue-600">
          <ArrowLeft className="w-4 h-4" /> Back to Fleet
        </Link>

        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-blue-500 via-indigo-600 to-purple-600 p-5 sm:p-7 shadow-xl shadow-blue-500/30 text-white">
          <div className="flex items-center gap-3 sm:gap-4">
            <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center ring-1 ring-white/30 flex-shrink-0">
              <Truck className="w-7 h-7 text-white" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold">New Vehicle</h1>
              <p className="text-sm text-white/80 mt-0.5">Asset tag is auto-generated</p>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <Section title="Identity">
            <Field label="Name" required hint="e.g. 'Truck 5' or 'Ford F-450 #5'">
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} required placeholder="Truck 5" className={inputClass} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Short name"><input type="text" value={shortName} onChange={(e) => setShortName(e.target.value)} placeholder="F450" className={inputClass} /></Field>
              <Field label="Unit number" required><input type="text" value={unitNumber} onChange={(e) => setUnitNumber(e.target.value)} required placeholder="5" className={inputClass} /></Field>
            </div>
          </Section>

          <Section title="Vehicle details">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Make"><input type="text" value={make} onChange={(e) => setMake(e.target.value)} placeholder="Ford" className={inputClass} /></Field>
              <Field label="Model"><input type="text" value={model} onChange={(e) => setModel(e.target.value)} placeholder="F-450" className={inputClass} /></Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Year"><input type="number" value={year} onChange={(e) => setYear(e.target.value)} placeholder="2024" className={inputClass} /></Field>
              <Field label="Fuel type">
                <select value={fuelType} onChange={(e) => setFuelType(e.target.value)} className={inputClass}>
                  <option value="diesel">Diesel</option>
                  <option value="gasoline">Gasoline</option>
                  <option value="electric">Electric</option>
                  <option value="hybrid">Hybrid</option>
                </select>
              </Field>
            </div>
            <Field label="VIN"><input type="text" value={vin} onChange={(e) => setVin(e.target.value)} className={inputClass} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="License plate"><input type="text" value={licensePlate} onChange={(e) => setLicensePlate(e.target.value)} className={inputClass} /></Field>
              <Field label="Odometer"><input type="number" value={odometer} onChange={(e) => setOdometer(e.target.value)} placeholder="0" className={inputClass} /></Field>
            </div>
          </Section>

          <Section title="Compliance dates">
            <Field label="Registration expiry">
              <input type="date" value={registrationExpiry} onChange={(e) => setRegistrationExpiry(e.target.value)} className={inputClass} />
            </Field>
            <Field label="Insurance expiry">
              <input type="date" value={insuranceExpiry} onChange={(e) => setInsuranceExpiry(e.target.value)} className={inputClass} />
            </Field>
            <Field label="Inspection expiry">
              <input type="date" value={inspectionExpiry} onChange={(e) => setInspectionExpiry(e.target.value)} className={inputClass} />
            </Field>
          </Section>

          <Section title="Notes">
            <Field label="Notes"><textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={inputClass} /></Field>
          </Section>

          {error && <div className="rounded-lg bg-rose-50 dark:bg-rose-900/20 border border-rose-200 p-3 text-sm text-rose-700">{error}</div>}
        </form>
      </div>

      <div className="fixed bottom-0 inset-x-0 bg-white/95 dark:bg-slate-900/95 backdrop-blur border-t border-gray-200 dark:border-slate-700 shadow-lg z-30">
        <div className="max-w-3xl mx-auto p-3 sm:p-4 flex items-center justify-end gap-3">
          <Link href="/dashboard/admin/fleet" className="inline-flex items-center justify-center min-h-[44px] px-4 rounded-xl text-sm font-semibold text-gray-700 dark:text-slate-200 bg-gray-100 dark:bg-slate-700">Cancel</Link>
          <button type="button" onClick={handleSubmit} disabled={submitting} className="inline-flex items-center justify-center gap-1.5 min-h-[44px] px-6 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 disabled:opacity-50 text-white text-sm font-semibold shadow-lg shadow-blue-500/30">
            {submitting ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</> : <><Truck className="w-4 h-4" /> Add Vehicle</>}
          </button>
        </div>
      </div>
    </div>
  );
}

const inputClass = 'w-full px-3 py-3 rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-white text-base sm:text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-200 dark:border-slate-700 p-5 space-y-4">
      <h2 className="text-sm font-semibold text-gray-900 dark:text-white uppercase tracking-wide">{title}</h2>
      {children}
    </section>
  );
}
function Field({ label, required, hint, children }: { label: string; required?: boolean; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-sm font-semibold text-gray-700 dark:text-slate-200 mb-1.5 flex items-center gap-1.5">
        {label}{required && <span className="text-rose-500">*</span>}
      </label>
      {children}
      {hint && <p className="text-xs text-gray-500 dark:text-slate-400 mt-1.5">{hint}</p>}
    </div>
  );
}
