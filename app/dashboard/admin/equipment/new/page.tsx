'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, Package, Loader2, CheckCircle, Cog, Hammer, Cable, Truck, Warehouse,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { getCurrentUser, type User } from '@/lib/auth';

const ALLOWED_ROLES = ['shop_manager','admin','super_admin','operations_manager'];

const KIND_OPTIONS: Array<{ value: string; label: string; icon: React.ElementType; needsPower: boolean }> = [
  { value: 'powered', label: 'Powered (saw / drill / generator)', icon: Cog, needsPower: true },
  { value: 'hand_tool', label: 'Hand tool', icon: Hammer, needsPower: false },
  { value: 'accessory', label: 'Accessory (dolly, chain, hose)', icon: Cable, needsPower: false },
  { value: 'trailer', label: 'Trailer', icon: Truck, needsPower: false },
];
const POWER_OPTIONS = ['diesel', 'gas', 'hydraulic', 'electric', 'pneumatic'];
const COMMON_CATEGORIES = [
  'slab_saw', 'wall_saw', 'wire_saw', 'core_drill', 'handheld_saw', 'chain_saw',
  'generator', 'compressor', 'vacuum', 'jack_hammer', 'breaker',
  'dolly', 'chain', 'hose', 'extension_cord', 'blade', 'bit', 'other',
];

export default function NewEquipmentPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  // Form state
  const [name, setName] = useState('');
  const [shortName, setShortName] = useState('');
  const [unitNumber, setUnitNumber] = useState('');
  const [aliases, setAliases] = useState('');
  const [kind, setKind] = useState<string>('powered');
  const [powerSource, setPowerSource] = useState<string>('');
  const [category, setCategory] = useState('');
  const [requiresMaintenanceSchedule, setRequiresMaintenanceSchedule] = useState(true);
  const [make, setMake] = useState('');
  const [model, setModel] = useState('');
  const [serialNumber, setSerialNumber] = useState('');
  const [homeLocation, setHomeLocation] = useState('Shop'); // default to Shop on new equipment
  const [notes, setNotes] = useState('');
  const [trucks, setTrucks] = useState<Array<{
    id: string;
    name: string;
    short_name: string | null;
    unit_number: string | null;
    current_custodian: { full_name: string | null } | null;
  }>>([]);

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

  // Load trucks for the location dropdown.
  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;
        const res = await fetch('/api/admin/equipment?kind=vehicle&limit=200', {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (res.ok) {
          const json = await res.json();
          setTrucks(json.data ?? []);
        }
      } catch { /* silent */ }
    })();
  }, [user]);

  // Auto-toggle requires_maintenance_schedule based on kind selection
  useEffect(() => {
    setRequiresMaintenanceSchedule(kind === 'powered' || kind === 'trailer');
    if (kind !== 'powered') setPowerSource('');
  }, [kind]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!name.trim()) { setError('Equipment name is required.'); return; }
    if (!unitNumber.trim()) { setError('Unit number is required.'); return; }

    setSubmitting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setError('Session expired. Please log in again.'); return; }

      const aliasList = aliases.split(',').map((s) => s.trim()).filter(Boolean);

      const res = await fetch('/api/admin/equipment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({
          name: name.trim(),
          short_name: shortName.trim() || null,
          unit_number: unitNumber.trim(),
          aliases: aliasList,
          kind,
          power_source: powerSource || null,
          category: category.trim() || null,
          requires_maintenance_schedule: requiresMaintenanceSchedule,
          make: make.trim() || null,
          model: model.trim() || null,
          serial_number: serialNumber.trim() || null,
          home_location: homeLocation.trim() || null,
          notes: notes.trim() || null,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error || j.details || 'Failed to create equipment.');
        return;
      }
      const j = await res.json();
      setSuccess({ id: j.data.id, asset_tag: j.data.asset_tag });
    } catch (err: any) {
      setError(err.message || 'Failed to create equipment.');
    } finally {
      setSubmitting(false);
    }
  }

  if (authLoading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-slate-900 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-cyan-600" />
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-slate-900 flex items-center justify-center p-6">
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg border border-emerald-200 dark:border-emerald-900/40 p-8 max-w-md w-full text-center">
          <div className="w-14 h-14 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-7 h-7 text-emerald-600 dark:text-emerald-400" />
          </div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">Equipment added</h2>
          <p className="text-sm text-gray-500 dark:text-slate-400 mb-2">Asset tag: <strong className="font-mono">{success.asset_tag}</strong></p>
          <div className="flex gap-2 mt-5">
            <Link
              href={`/dashboard/admin/equipment/${success.id}`}
              className="flex-1 px-4 py-2.5 rounded-xl bg-gradient-to-br from-cyan-500 to-sky-600 text-white text-sm font-semibold shadow-md"
            >
              View
            </Link>
            <button
              type="button"
              onClick={() => {
                setSuccess(null);
                setName(''); setShortName(''); setUnitNumber(''); setAliases('');
                setMake(''); setModel(''); setSerialNumber(''); setHomeLocation(''); setNotes('');
              }}
              className="flex-1 px-4 py-2.5 rounded-xl bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-slate-200 text-sm font-semibold"
            >
              Add another
            </button>
          </div>
          <Link href="/dashboard/admin/equipment" className="block mt-3 text-xs text-gray-500 dark:text-slate-400 hover:underline">
            ← Back to inventory
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-900 pb-24">
      <div className="max-w-3xl mx-auto p-4 sm:p-6 space-y-5 sm:space-y-6">
        <Link href="/dashboard/admin/equipment" className="inline-flex items-center gap-1.5 text-sm text-gray-600 dark:text-slate-300 hover:text-cyan-600">
          <ArrowLeft className="w-4 h-4" /> Back to Inventory
        </Link>

        {/* Vibrant gradient hero */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-cyan-500 via-sky-600 to-blue-600 p-5 sm:p-7 shadow-xl shadow-cyan-500/30 text-white">
          <div className="flex items-center gap-3 sm:gap-4">
            <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center ring-1 ring-white/30 flex-shrink-0">
              <Package className="w-7 h-7 text-white" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold">New Equipment</h1>
              <p className="text-sm text-white/80 mt-0.5">Asset tag is auto-generated</p>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Identity */}
          <section className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-200 dark:border-slate-700 p-5 space-y-4">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white uppercase tracking-wide">Identity</h2>

            <Field label="Equipment name" required hint="Full descriptive name. e.g. 'Husqvarna FS5000'">
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                placeholder="Husqvarna FS5000"
                className={inputClass}
              />
            </Field>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Short name (optional)" hint="Compact form for lists. e.g. 'FS5000'">
                <input type="text" value={shortName} onChange={(e) => setShortName(e.target.value)} placeholder="FS5000" className={inputClass} />
              </Field>
              <Field label="Unit number" required hint="What operators say. e.g. '5'">
                <input type="text" value={unitNumber} onChange={(e) => setUnitNumber(e.target.value)} required placeholder="5" className={inputClass} />
              </Field>
            </div>

            <Field
              label="Aliases (optional)"
              hint="Comma-separated alternative names operators say in voice checkout. The system auto-adds the asset tag + short name. Add others like '5000 slab saw', 'DFS 5'."
            >
              <input type="text" value={aliases} onChange={(e) => setAliases(e.target.value)} placeholder="5000 slab saw, DFS 5, big saw" className={inputClass} />
            </Field>
          </section>

          {/* Kind + Power */}
          <section className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-200 dark:border-slate-700 p-5 space-y-4">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white uppercase tracking-wide">Type</h2>

            <div className="grid grid-cols-2 gap-2">
              {KIND_OPTIONS.map((k) => {
                const Icon = k.icon;
                return (
                  <button
                    key={k.value}
                    type="button"
                    onClick={() => setKind(k.value)}
                    className={`text-left p-3 rounded-xl border-2 transition flex items-start gap-2 ${
                      kind === k.value
                        ? 'border-cyan-500 bg-cyan-50 dark:bg-cyan-900/20'
                        : 'border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 hover:border-cyan-300'
                    }`}
                  >
                    <Icon className={`w-5 h-5 mt-0.5 flex-shrink-0 ${kind === k.value ? 'text-cyan-600' : 'text-gray-400'}`} />
                    <p className="text-xs sm:text-sm font-semibold text-gray-900 dark:text-white">{k.label}</p>
                  </button>
                );
              })}
            </div>

            {kind === 'powered' && (
              <Field label="Power source" hint="What drives it">
                <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                  {POWER_OPTIONS.map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setPowerSource(p === powerSource ? '' : p)}
                      className={`px-2 py-2 rounded-lg border-2 text-xs font-semibold capitalize transition ${
                        powerSource === p
                          ? 'border-cyan-500 bg-cyan-50 dark:bg-cyan-900/20 text-cyan-700 dark:text-cyan-300'
                          : 'border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-600 dark:text-slate-300 hover:border-cyan-300'
                      }`}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </Field>
            )}

            <Field label="Category (optional)" hint="Specific class — drives schedule-form filtering ('show me all slab saws')">
              <input type="text" value={category} onChange={(e) => setCategory(e.target.value)} list="category-list" placeholder="slab_saw" className={inputClass} />
              <datalist id="category-list">
                {COMMON_CATEGORIES.map((c) => <option key={c} value={c} />)}
              </datalist>
            </Field>

            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={requiresMaintenanceSchedule}
                onChange={(e) => setRequiresMaintenanceSchedule(e.target.checked)}
                className="w-5 h-5 mt-0.5 rounded border-gray-300 text-cyan-600 focus:ring-cyan-500"
              />
              <div>
                <p className="text-sm font-semibold text-gray-900 dark:text-white">Requires maintenance schedule</p>
                <p className="text-xs text-gray-500 dark:text-slate-400">Powered equipment + vehicles usually do; hand tools usually don't.</p>
              </div>
            </label>
          </section>

          {/* Manufacturer */}
          <section className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-200 dark:border-slate-700 p-5 space-y-4">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white uppercase tracking-wide">Manufacturer (optional)</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Make"><input type="text" value={make} onChange={(e) => setMake(e.target.value)} placeholder="Husqvarna" className={inputClass} /></Field>
              <Field label="Model"><input type="text" value={model} onChange={(e) => setModel(e.target.value)} placeholder="FS5000" className={inputClass} /></Field>
            </div>
            <Field label="Serial number">
              <input type="text" value={serialNumber} onChange={(e) => setSerialNumber(e.target.value)} className={inputClass} />
            </Field>
          </section>

          {/* Other */}
          <section className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-200 dark:border-slate-700 p-5 space-y-4">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white uppercase tracking-wide">Storage</h2>
            <Field label="Home location" hint="Either Shop or a specific truck — keeps inventory location consistent + searchable.">
              <select value={homeLocation} onChange={(e) => setHomeLocation(e.target.value)} className={inputClass}>
                <option value="Shop">🏭 Shop</option>
                {trucks.length > 0 && (
                  <optgroup label="On a truck">
                    {trucks.map((t) => {
                      const display = t.short_name && t.unit_number
                        ? `${t.short_name} #${t.unit_number}`
                        : t.name;
                      const op = t.current_custodian?.full_name?.split(' ')[0];
                      const label = op ? `🚚 ${display} · ${op}` : `🚚 ${display}`;
                      return <option key={t.id} value={label}>{label}</option>;
                    })}
                  </optgroup>
                )}
              </select>
            </Field>
            <Field label="Notes">
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={inputClass} />
            </Field>
          </section>

          {error && (
            <div className="rounded-lg bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800/40 p-3 text-sm text-rose-700 dark:text-rose-300">
              {error}
            </div>
          )}
        </form>
      </div>

      {/* Sticky bottom action bar */}
      <div className="fixed bottom-0 inset-x-0 bg-white/95 dark:bg-slate-900/95 backdrop-blur border-t border-gray-200 dark:border-slate-700 shadow-lg z-30">
        <div className="max-w-3xl mx-auto p-3 sm:p-4 flex items-center justify-end gap-3">
          <Link
            href="/dashboard/admin/equipment"
            className="inline-flex items-center justify-center gap-1.5 min-h-[44px] px-4 rounded-xl text-sm font-semibold text-gray-700 dark:text-slate-200 bg-gray-100 dark:bg-slate-700"
          >
            Cancel
          </Link>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className="inline-flex items-center justify-center gap-1.5 min-h-[44px] px-6 rounded-xl bg-gradient-to-br from-cyan-500 to-sky-600 hover:from-cyan-600 hover:to-sky-700 disabled:opacity-50 text-white text-sm font-semibold shadow-lg shadow-cyan-500/30 transition"
          >
            {submitting ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</> : <><Package className="w-4 h-4" /> Add Equipment</>}
          </button>
        </div>
      </div>
    </div>
  );
}

const inputClass = 'w-full px-3 py-3 rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-white text-base sm:text-sm focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500';

function Field({
  label, required, hint, children,
}: { label: string; required?: boolean; hint?: string; children: React.ReactNode }) {
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
