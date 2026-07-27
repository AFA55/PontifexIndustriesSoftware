'use client';

export const dynamic = 'force-dynamic';

/**
 * Concrete Weight Calculator — available to ALL users (no role gate).
 * Estimates the weight of a concrete slab cut/removal or a core, so a crew
 * knows lifting/hauling weight before they cut. Pure client-side math, no DB.
 *
 * weight = volume × density.  Standard normal-weight concrete ≈ 150 lb/ft³.
 */

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Scale, Square, Circle, Info } from 'lucide-react';

type Shape = 'slab' | 'core';

const DENSITIES: { key: string; label: string; lbPerFt3: number }[] = [
  { key: 'standard', label: 'Standard concrete', lbPerFt3: 150 },
  { key: 'reinforced', label: 'Reinforced (with rebar)', lbPerFt3: 156 },
  { key: 'lightweight', label: 'Lightweight', lbPerFt3: 115 },
  { key: 'custom', label: 'Custom…', lbPerFt3: 150 },
];

function num(v: string): number {
  const n = parseFloat(v);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

export default function ConcreteCalculatorPage() {
  const [shape, setShape] = useState<Shape>('slab');
  // Slab (Length × Width in feet, Thickness in inches)
  const [lengthFt, setLengthFt] = useState('');
  const [widthFt, setWidthFt] = useState('');
  const [thicknessIn, setThicknessIn] = useState('');
  // Core (Diameter × Depth in inches)
  const [diameterIn, setDiameterIn] = useState('');
  const [depthIn, setDepthIn] = useState('');
  // Density
  const [densityKey, setDensityKey] = useState('standard');
  const [customDensity, setCustomDensity] = useState('150');

  const densityLbPerFt3 =
    densityKey === 'custom' ? num(customDensity) : DENSITIES.find((d) => d.key === densityKey)!.lbPerFt3;

  const result = useMemo(() => {
    // Compute volume in cubic INCHES, then convert.
    let cubicInches = 0;
    if (shape === 'slab') {
      cubicInches = num(lengthFt) * 12 * (num(widthFt) * 12) * num(thicknessIn);
    } else {
      const r = num(diameterIn) / 2;
      cubicInches = Math.PI * r * r * num(depthIn);
    }
    const ft3 = cubicInches / 1728;
    const yd3 = ft3 / 27;
    const lbs = ft3 * densityLbPerFt3;
    const tons = lbs / 2000;
    const kg = lbs * 0.453592;
    return { ft3, yd3, lbs, tons, kg, hasInput: cubicInches > 0 };
  }, [shape, lengthFt, widthFt, thicknessIn, diameterIn, depthIn, densityLbPerFt3]);

  const fmt = (n: number, digits = 0) =>
    n.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });

  const inputCls =
    'w-full px-4 py-3 rounded-xl border-2 border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 text-slate-900 dark:text-white text-base focus:outline-none focus:border-violet-500';

  return (
    <div className="max-w-lg mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex items-center gap-2 mb-5">
        <Link href="/dashboard/tools" className="p-2 -ml-2 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-white/10 min-h-[44px] min-w-[44px] flex items-center justify-center" aria-label="Back to tools">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-600 to-fuchsia-600 flex items-center justify-center shrink-0">
          <Scale className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-slate-900 dark:text-white leading-tight">Concrete Weight Calculator</h1>
          <p className="text-xs text-slate-500 dark:text-white/50">Know how much a cut or core weighs before you lift it.</p>
        </div>
      </div>

      {/* Shape toggle */}
      <div className="grid grid-cols-2 gap-2 mb-5">
        {([
          { s: 'slab' as Shape, icon: Square, label: 'Slab / Wall' },
          { s: 'core' as Shape, icon: Circle, label: 'Core / Cylinder' },
        ]).map(({ s, icon: Icon, label }) => (
          <button
            key={s}
            onClick={() => setShape(s)}
            className={`flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-semibold border-2 min-h-[48px] transition-colors ${
              shape === s
                ? 'bg-violet-600 text-white border-violet-600'
                : 'border-slate-200 dark:border-white/10 text-slate-600 dark:text-white/60'
            }`}
          >
            <Icon className="w-4 h-4" /> {label}
          </button>
        ))}
      </div>

      {/* Dimensions */}
      <div className="bg-white dark:bg-white/[0.04] rounded-2xl p-4 sm:p-5 ring-1 ring-slate-100 dark:ring-white/10 mb-4 space-y-4">
        {shape === 'slab' ? (
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs font-semibold text-slate-500 dark:text-white/60">Length (ft)</span>
              <input type="number" min="0" inputMode="decimal" value={lengthFt} onChange={(e) => setLengthFt(e.target.value)} placeholder="e.g. 10" className={`mt-1 ${inputCls}`} />
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-slate-500 dark:text-white/60">Width (ft)</span>
              <input type="number" min="0" inputMode="decimal" value={widthFt} onChange={(e) => setWidthFt(e.target.value)} placeholder="e.g. 4" className={`mt-1 ${inputCls}`} />
            </label>
            <label className="block col-span-2">
              <span className="text-xs font-semibold text-slate-500 dark:text-white/60">Thickness / depth (in)</span>
              <input type="number" min="0" inputMode="decimal" value={thicknessIn} onChange={(e) => setThicknessIn(e.target.value)} placeholder="e.g. 6" className={`mt-1 ${inputCls}`} />
            </label>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs font-semibold text-slate-500 dark:text-white/60">Diameter (in)</span>
              <input type="number" min="0" inputMode="decimal" value={diameterIn} onChange={(e) => setDiameterIn(e.target.value)} placeholder="e.g. 6" className={`mt-1 ${inputCls}`} />
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-slate-500 dark:text-white/60">Depth (in)</span>
              <input type="number" min="0" inputMode="decimal" value={depthIn} onChange={(e) => setDepthIn(e.target.value)} placeholder="e.g. 8" className={`mt-1 ${inputCls}`} />
            </label>
          </div>
        )}

        {/* Density */}
        <div>
          <span className="text-xs font-semibold text-slate-500 dark:text-white/60">Concrete type</span>
          <div className="mt-1 grid grid-cols-2 gap-2">
            {DENSITIES.map((d) => (
              <button
                key={d.key}
                onClick={() => setDensityKey(d.key)}
                className={`px-3 py-2.5 rounded-xl text-xs font-semibold border min-h-[44px] text-left ${
                  densityKey === d.key
                    ? 'bg-violet-50 dark:bg-violet-500/10 border-violet-400 text-violet-700 dark:text-violet-300'
                    : 'border-slate-200 dark:border-white/10 text-slate-600 dark:text-white/60'
                }`}
              >
                {d.label}
                {d.key !== 'custom' && <span className="block text-[10px] text-slate-400 font-normal">{d.lbPerFt3} lb/ft³</span>}
              </button>
            ))}
          </div>
          {densityKey === 'custom' && (
            <label className="block mt-2">
              <span className="text-xs font-semibold text-slate-500 dark:text-white/60">Custom density (lb/ft³)</span>
              <input type="number" min="0" inputMode="decimal" value={customDensity} onChange={(e) => setCustomDensity(e.target.value)} className={`mt-1 ${inputCls}`} />
            </label>
          )}
        </div>
      </div>

      {/* Result */}
      <div className="rounded-2xl p-5 bg-gradient-to-br from-violet-600 to-fuchsia-600 text-white shadow-lg shadow-violet-500/20">
        <p className="text-xs font-semibold uppercase tracking-wide text-white/70">Estimated weight</p>
        <p className="text-4xl font-black mt-1">{result.hasInput ? fmt(result.lbs) : '—'}<span className="text-lg font-bold text-white/80"> lbs</span></p>
        <div className="grid grid-cols-3 gap-2 mt-4 text-center">
          <div className="rounded-xl bg-white/10 py-2">
            <p className="text-lg font-bold">{result.hasInput ? fmt(result.tons, 2) : '—'}</p>
            <p className="text-[10px] text-white/70 uppercase tracking-wide">tons</p>
          </div>
          <div className="rounded-xl bg-white/10 py-2">
            <p className="text-lg font-bold">{result.hasInput ? fmt(result.kg) : '—'}</p>
            <p className="text-[10px] text-white/70 uppercase tracking-wide">kg</p>
          </div>
          <div className="rounded-xl bg-white/10 py-2">
            <p className="text-lg font-bold">{result.hasInput ? fmt(result.ft3, 1) : '—'}</p>
            <p className="text-[10px] text-white/70 uppercase tracking-wide">ft³ ({result.hasInput ? fmt(result.yd3, 2) : '—'} yd³)</p>
          </div>
        </div>
      </div>

      <div className="mt-4 flex items-start gap-2 text-xs text-slate-500 dark:text-white/50">
        <Info className="w-4 h-4 shrink-0 mt-0.5" />
        <p>An estimate at {fmt(densityLbPerFt3)} lb/ft³. Actual weight varies with the mix, rebar amount, and moisture — verify before rigging or hauling. Standard concrete is about 150 lb/ft³ (≈ 4,050 lb per cubic yard).</p>
      </div>
    </div>
  );
}
