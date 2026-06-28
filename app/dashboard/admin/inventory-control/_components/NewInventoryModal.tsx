'use client';

import { useState, useRef } from 'react';
import {
  X, Zap, Wrench, Link2, Package, Truck, ArrowLeft,
  ArrowRight, Check, Loader2, AlertTriangle,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';

// ── Types ────────────────────────────────────────────────────────────────────

type EquipmentKind = 'powered' | 'hand_tool' | 'accessory' | 'vehicle' | 'trailer';

interface TypeOption {
  kind: EquipmentKind;
  label: string;
  sublabel: string;
  icon: React.ElementType;
  color: string;
  gradient: string;
  examples: string;
  redirectToFleet?: boolean;
}

const TYPES: TypeOption[] = [
  {
    kind: 'powered',
    label: 'Powered Equipment',
    sublabel: 'Saws, core drills, grinders',
    icon: Zap,
    color: 'text-amber-600 dark:text-amber-400',
    gradient: 'from-amber-500 to-orange-600',
    examples: 'FS5000, HS61, core drill, wall saw…',
  },
  {
    kind: 'hand_tool',
    label: 'Hand Tool',
    sublabel: 'Non-powered tools',
    icon: Wrench,
    color: 'text-sky-600 dark:text-sky-400',
    gradient: 'from-sky-500 to-blue-600',
    examples: 'chisels, levels, wrenches, vacuums…',
  },
  {
    kind: 'accessory',
    label: 'Accessory / Attachment',
    sublabel: 'Blades, bits, adapters',
    icon: Link2,
    color: 'text-violet-600 dark:text-violet-400',
    gradient: 'from-violet-500 to-indigo-600',
    examples: 'diamond blades, core bits, extensions…',
  },
  {
    kind: 'trailer',
    label: 'Trailer',
    sublabel: 'Equipment trailers',
    icon: Package,
    color: 'text-teal-600 dark:text-teal-400',
    gradient: 'from-teal-500 to-cyan-600',
    examples: 'equipment trailer, water trailer…',
  },
  {
    kind: 'vehicle',
    label: 'Vehicle / Truck',
    sublabel: 'Managed under Fleet',
    icon: Truck,
    color: 'text-slate-500 dark:text-slate-400',
    gradient: 'from-slate-500 to-gray-600',
    examples: 'pickup trucks, flatbeds, vans…',
    redirectToFleet: true,
  },
];

// ── Field configs per kind ────────────────────────────────────────────────────

const POWER_SOURCES = ['gas', 'electric', 'hydraulic', 'propane', 'diesel', 'battery'];

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  onClose: () => void;
  onCreated: () => void;
}

export default function NewInventoryModal({ onClose, onCreated }: Props) {
  const [step, setStep] = useState<1 | 2>(1);
  const [selectedType, setSelectedType] = useState<TypeOption | null>(null);

  // Step 2 fields — shared
  const [name, setName] = useState('');
  const [shortName, setShortName] = useState('');
  const [unitNumber, setUnitNumber] = useState('');
  const [make, setMake] = useState('');
  const [model, setModel] = useState('');
  const [serial, setSerial] = useState('');
  const [notes, setNotes] = useState('');
  const [purchaseDate, setPurchaseDate] = useState('');
  const [purchaseCost, setPurchaseCost] = useState('');
  const [location, setLocation] = useState('');

  // Powered-only
  const [powerSource, setPowerSource] = useState('');
  const [needsMaintenance, setNeedsMaintenance] = useState(true);

  // Accessory-only
  const [compatibleWith, setCompatibleWith] = useState('');
  const [category, setCategory] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setStep(1);
    setSelectedType(null);
    setName(''); setShortName(''); setUnitNumber(''); setMake(''); setModel('');
    setSerial(''); setNotes(''); setPurchaseDate(''); setPurchaseCost('');
    setLocation(''); setPowerSource(''); setNeedsMaintenance(true);
    setCompatibleWith(''); setCategory(''); setError(null);
  }

  async function handleSubmit() {
    if (!selectedType) return;
    if (!name.trim()) { setError('Equipment name is required.'); return; }
    if (!unitNumber.trim()) { setError('Unit number is required.'); return; }

    setSubmitting(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setError('Session expired — please log in again.'); return; }

      const body: Record<string, unknown> = {
        name: name.trim(),
        short_name: shortName.trim() || null,
        unit_number: unitNumber.trim(),
        kind: selectedType.kind,
        make: make.trim() || null,
        model: model.trim() || null,
        serial_number: serial.trim() || null,
        notes: notes.trim() || null,
        purchase_date: purchaseDate || null,
        purchase_cost: purchaseCost ? parseFloat(purchaseCost) : null,
        location: location.trim() || 'shop',
      };

      if (selectedType.kind === 'powered') {
        body.power_source = powerSource || null;
        body.requires_maintenance_schedule = needsMaintenance;
      }

      if (selectedType.kind === 'accessory') {
        body.category = category.trim() || null;
        body.notes = [compatibleWith.trim() ? `Compatible with: ${compatibleWith.trim()}` : '', notes.trim()].filter(Boolean).join('\n') || null;
      }

      const res = await fetch('/api/admin/equipment', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(body),
      });

      const json = await res.json();
      if (!res.ok) { setError(json.error || json.details || 'Failed to create item.'); return; }

      onCreated();
      reset();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Something went wrong.');
    } finally {
      setSubmitting(false);
    }
  }

  const isPowered = selectedType?.kind === 'powered';
  const isAccessory = selectedType?.kind === 'accessory';
  const isHandTool = selectedType?.kind === 'hand_tool';
  const isTrailer = selectedType?.kind === 'trailer';

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm">
      <div className="w-full sm:max-w-2xl bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden max-h-[95vh] flex flex-col">

        {/* Header */}
        <div className={`flex items-center justify-between px-5 py-4 flex-shrink-0 ${
          selectedType
            ? `bg-gradient-to-r ${selectedType.gradient} text-white`
            : 'border-b border-gray-200 dark:border-slate-700'
        }`}>
          <div className="flex items-center gap-3 min-w-0 flex-1">
            {step === 2 && (
              <button
                type="button"
                onClick={() => { setStep(1); setError(null); }}
                className="w-11 h-11 rounded-full bg-white/20 flex items-center justify-center hover:bg-white/30 transition flex-shrink-0"
                aria-label="Back"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
            )}
            <div className="min-w-0">
              <h2 className={`font-bold text-lg truncate ${selectedType ? 'text-white' : 'text-gray-900 dark:text-white'}`}>
                {step === 1 ? 'Add New Inventory' : `New ${selectedType?.label}`}
              </h2>
              {step === 2 && selectedType && (
                <p className={`text-xs truncate ${selectedType ? 'text-white/70' : 'text-gray-500'}`}>
                  {selectedType.examples}
                </p>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className={`w-11 h-11 rounded-full flex items-center justify-center transition flex-shrink-0 ${
              selectedType ? 'bg-white/20 hover:bg-white/30 text-white' : 'bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 text-gray-600 dark:text-slate-300'
            }`}
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 p-5 space-y-4">

          {/* ── STEP 1: Type Picker ─────────────────────────────────────── */}
          {step === 1 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {TYPES.map((t) => {
                const Icon = t.icon;
                return (
                  <button
                    key={t.kind}
                    type="button"
                    onClick={() => {
                      if (t.redirectToFleet) {
                        window.location.href = '/dashboard/admin/fleet';
                        return;
                      }
                      setSelectedType(t);
                      setStep(2);
                    }}
                    className="flex items-start gap-4 text-left p-4 rounded-2xl border-2 border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-brand hover:shadow-lg transition group"
                  >
                    <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${t.gradient} flex items-center justify-center flex-shrink-0 shadow-md`}>
                      <Icon className="w-5 h-5 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-gray-900 dark:text-white">{t.label}</p>
                      <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">{t.sublabel}</p>
                      <p className="text-[11px] text-gray-400 dark:text-slate-500 mt-1 italic truncate">{t.examples}</p>
                    </div>
                    {t.redirectToFleet ? (
                      <span className="text-[10px] font-semibold bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 px-2 py-1 rounded-full self-center flex-shrink-0">→ Fleet</span>
                    ) : (
                      <ArrowRight className="w-4 h-4 text-gray-300 dark:text-slate-600 group-hover:text-brand transition self-center flex-shrink-0" />
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {/* ── STEP 2: Smart Form ──────────────────────────────────────── */}
          {step === 2 && selectedType && (
            <div className="space-y-4">

              {/* Name + Short Name */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 dark:text-slate-200 mb-1.5">
                    Full Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={isPowered ? 'Husqvarna FS5000' : isHandTool ? 'Torque Wrench' : isAccessory ? 'Diamond Blade 14"' : 'Equipment Trailer'}
                    className="w-full px-3 py-2.5 min-h-[44px] rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-gray-900 dark:text-white text-base sm:text-sm focus:ring-2 focus:ring-brand focus:border-brand"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 dark:text-slate-200 mb-1.5">
                    Short Name / Nickname
                  </label>
                  <input
                    type="text"
                    value={shortName}
                    onChange={(e) => setShortName(e.target.value)}
                    placeholder={isPowered ? 'FS5000' : isAccessory ? 'Blade' : 'Short name'}
                    className="w-full px-3 py-2.5 min-h-[44px] rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-gray-900 dark:text-white text-base sm:text-sm focus:ring-2 focus:ring-brand focus:border-brand"
                  />
                  <p className="text-[11px] text-gray-400 mt-1">Used for voice check-out recognition</p>
                </div>
              </div>

              {/* Unit Number */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 dark:text-slate-200 mb-1.5">
                    Unit Number <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={unitNumber}
                    onChange={(e) => setUnitNumber(e.target.value)}
                    placeholder="e.g. 5, 12, T-01"
                    className="w-full px-3 py-2.5 min-h-[44px] rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-gray-900 dark:text-white text-base sm:text-sm focus:ring-2 focus:ring-brand focus:border-brand"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 dark:text-slate-200 mb-1.5">
                    Home Location
                  </label>
                  <input
                    type="text"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    placeholder="shop (default)"
                    className="w-full px-3 py-2.5 min-h-[44px] rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-gray-900 dark:text-white text-base sm:text-sm focus:ring-2 focus:ring-brand focus:border-brand"
                  />
                </div>
              </div>

              {/* Make + Model + Serial — shown for powered, hand_tool, trailer */}
              {(isPowered || isHandTool || isTrailer) && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 dark:text-slate-200 mb-1.5">Make</label>
                    <input
                      type="text"
                      value={make}
                      onChange={(e) => setMake(e.target.value)}
                      placeholder={isPowered ? 'Husqvarna' : 'Brand'}
                      className="w-full px-3 py-2.5 min-h-[44px] rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-gray-900 dark:text-white text-base sm:text-sm focus:ring-2 focus:ring-brand focus:border-brand"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 dark:text-slate-200 mb-1.5">Model</label>
                    <input
                      type="text"
                      value={model}
                      onChange={(e) => setModel(e.target.value)}
                      placeholder={isPowered ? 'FS5000' : 'Model #'}
                      className="w-full px-3 py-2.5 min-h-[44px] rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-gray-900 dark:text-white text-base sm:text-sm focus:ring-2 focus:ring-brand focus:border-brand"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 dark:text-slate-200 mb-1.5">Serial Number</label>
                    <input
                      type="text"
                      value={serial}
                      onChange={(e) => setSerial(e.target.value)}
                      placeholder="Serial / VIN"
                      className="w-full px-3 py-2.5 min-h-[44px] rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-gray-900 dark:text-white text-base sm:text-sm focus:ring-2 focus:ring-brand focus:border-brand"
                    />
                  </div>
                </div>
              )}

              {/* Powered-only: Power Source + Maintenance */}
              {isPowered && (
                <>
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 dark:text-slate-200 mb-2">Power Source</label>
                    <div className="flex flex-wrap gap-2">
                      {POWER_SOURCES.map((ps) => (
                        <button
                          key={ps}
                          type="button"
                          onClick={() => setPowerSource(ps === powerSource ? '' : ps)}
                          className={`px-3 py-2.5 min-h-[44px] rounded-lg text-sm font-semibold border-2 transition capitalize ${
                            powerSource === ps
                              ? 'border-amber-500 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300'
                              : 'border-gray-200 dark:border-slate-600 text-gray-600 dark:text-slate-300 hover:border-amber-300'
                          }`}
                        >
                          {ps}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="bg-amber-50 dark:bg-amber-900/10 rounded-xl border border-amber-200 dark:border-amber-800/40 p-4">
                    <label className="flex items-start gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={needsMaintenance}
                        onChange={(e) => setNeedsMaintenance(e.target.checked)}
                        className="w-5 h-5 rounded border-gray-300 text-amber-600 focus:ring-amber-500 mt-0.5 flex-shrink-0"
                      />
                      <div>
                        <p className="text-sm font-semibold text-gray-900 dark:text-white">Requires maintenance schedule</p>
                        <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">
                          Track oil changes, blade replacements, and service intervals for this equipment.
                        </p>
                      </div>
                    </label>
                  </div>
                </>
              )}

              {/* Accessory-only: Category + Compatible With */}
              {isAccessory && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 dark:text-slate-200 mb-1.5">Category</label>
                    <select
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                      className="w-full px-3 py-2.5 min-h-[44px] rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-gray-900 dark:text-white text-base sm:text-sm focus:ring-2 focus:ring-brand focus:border-brand"
                    >
                      <option value="">Select category…</option>
                      <option value="blade">Diamond Blade</option>
                      <option value="core_bit">Core Bit</option>
                      <option value="chain">Chain / Bar</option>
                      <option value="bit">Drill Bit</option>
                      <option value="extension">Extension / Adapter</option>
                      <option value="guard">Guard / Safety</option>
                      <option value="hose">Hose / Coupling</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 dark:text-slate-200 mb-1.5">Compatible With</label>
                    <input
                      type="text"
                      value={compatibleWith}
                      onChange={(e) => setCompatibleWith(e.target.value)}
                      placeholder="e.g. FS5000, HS61"
                      className="w-full px-3 py-2.5 min-h-[44px] rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-gray-900 dark:text-white text-base sm:text-sm focus:ring-2 focus:ring-brand focus:border-brand"
                    />
                  </div>
                </div>
              )}

              {/* Purchase Info */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 dark:text-slate-200 mb-1.5">Purchase Date</label>
                  <input
                    type="date"
                    value={purchaseDate}
                    onChange={(e) => setPurchaseDate(e.target.value)}
                    className="w-full px-3 py-2.5 min-h-[44px] rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-gray-900 dark:text-white text-base sm:text-sm focus:ring-2 focus:ring-brand focus:border-brand"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 dark:text-slate-200 mb-1.5">Purchase Cost ($)</label>
                  <input
                    type="number"
                    value={purchaseCost}
                    onChange={(e) => setPurchaseCost(e.target.value)}
                    placeholder="0.00"
                    min="0"
                    step="0.01"
                    className="w-full px-3 py-2.5 min-h-[44px] rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-gray-900 dark:text-white text-base sm:text-sm focus:ring-2 focus:ring-brand focus:border-brand"
                  />
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-slate-200 mb-1.5">Notes (optional)</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  placeholder="Any additional details…"
                  className="w-full px-3 py-2.5 rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-gray-900 dark:text-white text-base sm:text-sm focus:ring-2 focus:ring-brand focus:border-brand"
                />
              </div>

              {error && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800/40 text-rose-700 dark:text-rose-300 text-sm">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                  {error}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        {step === 2 && (
          <div className="flex-shrink-0 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] border-t border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900">
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting}
              className={`w-full inline-flex items-center justify-center gap-2 min-h-[48px] rounded-xl text-white text-sm font-bold shadow-lg transition disabled:opacity-50 disabled:cursor-not-allowed bg-gradient-to-br ${selectedType?.gradient ?? 'from-violet-500 to-indigo-600'}`}
            >
              {submitting ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</>
              ) : (
                <><Check className="w-4 h-4" /> Add to Inventory</>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
