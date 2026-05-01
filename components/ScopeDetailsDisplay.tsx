'use client';

/**
 * ScopeDetailsDisplay
 * Renders structured scope details (quantities) from the schedule form.
 * Used by operator job detail and admin views to show core drilling holes,
 * sawing linear feet, depths, etc.
 */

// Label mapping for field keys → display names
const FIELD_LABELS: Record<string, string> = {
  num_holes: 'Holes',
  diameter: 'Diameter',
  depth: 'Depth',
  linear_feet: 'Linear Feet',
  num_cuts: 'Cuts',
  area_sqft: 'Area (sq ft)',
  num_scans: 'Scans',
  volume_cuyd: 'Volume (cu yd)',
  description: 'Description',
  length: 'Length',
  width: 'Width',
  thickness: 'Thickness',
  num_areas: 'Areas',
  needed: 'Removal Needed',
  method: 'Removal Method',
};

// Service code → display name
const SERVICE_LABELS: Record<string, string> = {
  'ECD': 'Electric Core Drilling',
  'HFCD': 'High Frequency Core Drilling',
  'HCD': 'Hydraulic Core Drilling',
  'DFS': 'Floor Sawing',
  'WS/TS': 'Wall/Track Sawing',
  'CS': 'Chain Sawing',
  'HHS/PS': 'Handheld / Push Sawing',
  'HHS': 'Handheld Sawing', // legacy
  'WireSaw': 'Wire Sawing',
  'GPR': 'GPR Scanning',
  'Demo/Brokk': 'Selective Demo / Brokk', // legacy combined
  'Demo': 'Selective Demo',
  'Brokk': 'Brokk',
  'Other': 'Other',
};

// Suffix hints for field keys
const FIELD_SUFFIXES: Record<string, string> = {
  depth: 'in.',
  linear_feet: 'LF',
  area_sqft: 'sq ft',
  volume_cuyd: 'cu yd',
  diameter: 'in.',
  length: 'ft',
  width: 'ft',
  thickness: 'in.',
};

// Friendly labels for removal method values
const REMOVAL_METHOD_LABELS: Record<string, string> = {
  dumpster_on_site: 'Dumpster on Site',
  our_dump_truck: 'Our Dump Truck',
};

interface ScopeDetailsDisplayProps {
  scopeDetails: Record<string, Record<string, string>> | null | undefined;
  compact?: boolean;
  /**
   * Job-level fallback for overcut allowance — used when a per-area
   * `area.overcut_allowed` flag is not explicitly set. Defaults to false
   * (i.e., perimeter must be double-cut).
   */
  fallbackOvercutAllowed?: boolean;
}

/**
 * Pure helper: computes total linear feet of cutting for a single area.
 * Mirrors the formula used in the schedule form so admin and operator
 * see identical totals.
 *
 * Inputs (any string-coerced number is fine):
 *   - length (ft), width (ft), qty (count)
 *   - cross_cut_lengthwise_ft (spacing between length-wise cuts)
 *   - cross_cut_widthwise_ft  (spacing between width-wise cuts)
 *   - overcut_allowed (per-area override; falls back to job-level)
 *
 * Returns null when length/width are not parsable / non-positive.
 */
export function computeAreaLinearFt(
  area: { length?: string | number; width?: string | number; qty?: string | number; overcut_allowed?: boolean; cross_cut_lengthwise_ft?: string | number; cross_cut_widthwise_ft?: string | number } | null | undefined,
  fallbackOvercut: boolean,
): number | null {
  if (!area) return null;
  const length = parseFloat(String(area.length ?? ''));
  const width = parseFloat(String(area.width ?? ''));
  const qtyN = parseInt(String(area.qty ?? ''), 10);
  if (!isFinite(length) || !isFinite(width) || length <= 0 || width <= 0) return null;
  const qty = isFinite(qtyN) && qtyN > 0 ? qtyN : 1;
  const lengthSpacing = parseFloat(String(area.cross_cut_lengthwise_ft ?? '')) || 0;
  const widthSpacing = parseFloat(String(area.cross_cut_widthwise_ft ?? '')) || 0;
  const perimeter = 2 * (length + width);
  const lengthwiseCuts = lengthSpacing > 0 ? Math.max(0, Math.floor(length / lengthSpacing) - 1) : 0;
  const widthwiseCuts = widthSpacing > 0 ? Math.max(0, Math.floor(width / widthSpacing) - 1) : 0;
  const crossCutPerUnit = (lengthwiseCuts * width) + (widthwiseCuts * length);
  const overcut = typeof area.overcut_allowed === 'boolean' ? area.overcut_allowed : fallbackOvercut;
  const perimeterPerUnit = perimeter * (overcut ? 1 : 2);
  return (perimeterPerUnit + crossCutPerUnit) * qty;
}

/**
 * Returns the perimeter and cross-cut LF components separately,
 * so the UI can render a "perimeter X + cross-cuts Y" subtitle.
 */
export function computeAreaLinearFtParts(
  area: { length?: string | number; width?: string | number; qty?: string | number; overcut_allowed?: boolean; cross_cut_lengthwise_ft?: string | number; cross_cut_widthwise_ft?: string | number } | null | undefined,
  fallbackOvercut: boolean,
): { perimeterLf: number; crossCutLf: number; total: number; overcut: boolean } | null {
  if (!area) return null;
  const length = parseFloat(String(area.length ?? ''));
  const width = parseFloat(String(area.width ?? ''));
  const qtyN = parseInt(String(area.qty ?? ''), 10);
  if (!isFinite(length) || !isFinite(width) || length <= 0 || width <= 0) return null;
  const qty = isFinite(qtyN) && qtyN > 0 ? qtyN : 1;
  const lengthSpacing = parseFloat(String(area.cross_cut_lengthwise_ft ?? '')) || 0;
  const widthSpacing = parseFloat(String(area.cross_cut_widthwise_ft ?? '')) || 0;
  const perimeter = 2 * (length + width);
  const lengthwiseCuts = lengthSpacing > 0 ? Math.max(0, Math.floor(length / lengthSpacing) - 1) : 0;
  const widthwiseCuts = widthSpacing > 0 ? Math.max(0, Math.floor(width / widthSpacing) - 1) : 0;
  const crossCutPerUnit = (lengthwiseCuts * width) + (widthwiseCuts * length);
  const overcut = typeof area.overcut_allowed === 'boolean' ? area.overcut_allowed : fallbackOvercut;
  const perimeterPerUnit = perimeter * (overcut ? 1 : 2);
  return {
    perimeterLf: perimeterPerUnit * qty,
    crossCutLf: crossCutPerUnit * qty,
    total: (perimeterPerUnit + crossCutPerUnit) * qty,
    overcut,
  };
}

// Equipment labels for removal
const REMOVAL_EQUIPMENT_LABELS: Record<string, string> = {
  forklift: 'Forklift',
  skidsteer: 'Skidsteer',
  lull: 'Lull',
  dingo: 'Dingo',
  sherpa: 'Sherpa',
  mini_excavator: 'Mini Excavator',
};

// Helper to safely parse JSON arrays
function parseJsonArray<T>(val: string | undefined, fallback: T[]): T[] {
  if (!val) return fallback;
  try { return JSON.parse(val); } catch { return fallback; }
}

// Render dynamic holes (core drilling)
function renderHoles(holesJson: string) {
  const holes = parseJsonArray<{ qty: string; bit_size: string; depth: string }>(holesJson, []);
  if (holes.length === 0) return null;
  const totalHoles = holes.reduce((sum, h) => sum + (parseInt(h.qty) || 0), 0);
  return (
    <div className="col-span-full space-y-1.5">
      <div className="grid grid-cols-3 gap-2 text-[10px] font-semibold text-slate-400 uppercase tracking-wider px-1">
        <span># of Holes</span><span>Bit Size</span><span>Depth</span>
      </div>
      {holes.map((h, i) => (
        <div key={i} className="grid grid-cols-3 gap-2">
          <div className="bg-white rounded-lg p-2 border border-blue-100 text-center">
            <span className="text-base font-bold text-slate-800">{h.qty || '-'}</span>
          </div>
          <div className="bg-white rounded-lg p-2 border border-blue-100 text-center">
            <span className="text-base font-bold text-slate-800">{h.bit_size || '-'}<span className="text-xs text-slate-400 ml-0.5">in.</span></span>
          </div>
          <div className="bg-white rounded-lg p-2 border border-blue-100 text-center">
            <span className="text-base font-bold text-slate-800">{h.depth || '-'}<span className="text-xs text-slate-400 ml-0.5">in.</span></span>
          </div>
        </div>
      ))}
      {totalHoles > 0 && (
        <p className="text-xs font-semibold text-blue-600 px-1">{totalHoles} total hole{totalHoles !== 1 ? 's' : ''}</p>
      )}
    </div>
  );
}

// Render dynamic cuts (sawing linear mode)
function renderCuts(cutsJson: string) {
  const cuts = parseJsonArray<{ linear_feet: string; depth: string; num_cuts: string }>(cutsJson, []);
  if (cuts.length === 0) return null;
  const totalLF = cuts.reduce((sum, c) => sum + (parseFloat(c.linear_feet) || 0), 0);
  const totalCuts = cuts.reduce((sum, c) => sum + (parseInt(c.num_cuts) || 0), 0);
  return (
    <div className="col-span-full space-y-1.5">
      <div className="grid grid-cols-3 gap-2 text-[10px] font-semibold text-slate-400 uppercase tracking-wider px-1">
        <span>Linear Feet</span><span>Cut Depth</span><span># of Cuts</span>
      </div>
      {cuts.map((c, i) => (
        <div key={i} className="grid grid-cols-3 gap-2">
          <div className="bg-white rounded-lg p-2 border border-blue-100 text-center">
            <span className="text-base font-bold text-slate-800">{c.linear_feet || '-'}<span className="text-xs text-slate-400 ml-0.5">ft</span></span>
          </div>
          <div className="bg-white rounded-lg p-2 border border-blue-100 text-center">
            <span className="text-base font-bold text-slate-800">{c.depth || '-'}<span className="text-xs text-slate-400 ml-0.5">in.</span></span>
          </div>
          <div className="bg-white rounded-lg p-2 border border-blue-100 text-center">
            <span className="text-base font-bold text-slate-800">{c.num_cuts || '-'}</span>
          </div>
        </div>
      ))}
      <div className="flex gap-3 px-1">
        {totalLF > 0 && <p className="text-xs font-semibold text-blue-600">{totalLF.toLocaleString()} total LF</p>}
        {totalCuts > 0 && <p className="text-xs font-semibold text-blue-600">{totalCuts} total cut{totalCuts !== 1 ? 's' : ''}</p>}
      </div>
    </div>
  );
}

// Per-area cutting metadata type (extends the basic L×W×T×Q with overcut + cross-cut info).
type AreaRow = {
  length: string;
  width: string;
  thickness?: string;
  qty?: string;
  overcut_allowed?: boolean;
  cross_cut_lengthwise_ft?: string | number;
  cross_cut_widthwise_ft?: string | number;
};

// Render dynamic areas (L x W x Thickness x Qty) — plus per-area overcut + cross-cut
// info and computed total linear feet.
function renderAreas(areasJson: string, fallbackOvercut: boolean) {
  const areas = parseJsonArray<AreaRow>(areasJson, []);
  if (areas.length === 0) return null;
  const totalSqFt = areas.reduce((sum, a) => {
    const l = parseFloat(a.length) || 0;
    const w = parseFloat(a.width) || 0;
    const q = parseInt(a.qty || '1') || 1;
    return sum + (l * w * q);
  }, 0);
  const hasThickness = areas.some(a => a.thickness);
  const hasQty = areas.some(a => a.qty && parseInt(a.qty) > 1);
  const cols = 2 + (hasThickness ? 1 : 0) + (hasQty ? 1 : 0);

  // Aggregate per-section grand total of linear feet.
  let grandTotalLf = 0;
  for (const a of areas) {
    const lf = computeAreaLinearFt(a, fallbackOvercut);
    if (lf != null) grandTotalLf += lf;
  }

  return (
    <div className="col-span-full space-y-2">
      <div className={`grid gap-2 text-[10px] font-semibold text-slate-400 uppercase tracking-wider px-1`} style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
        <span>Length</span><span>Width</span>{hasThickness && <span>Thickness</span>}{hasQty && <span>Qty</span>}
      </div>
      {areas.map((a, i) => {
        const parts = computeAreaLinearFtParts(a, fallbackOvercut);
        const lengthSpacing = parseFloat(String(a.cross_cut_lengthwise_ft ?? '')) || 0;
        const widthSpacing = parseFloat(String(a.cross_cut_widthwise_ft ?? '')) || 0;
        const hasCrossCut = lengthSpacing > 0 || widthSpacing > 0;
        const overcutResolved = typeof a.overcut_allowed === 'boolean' ? a.overcut_allowed : fallbackOvercut;
        return (
          <div key={i} className="space-y-1.5">
            <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
              <div className="bg-white dark:bg-slate-900/40 rounded-lg p-2 border border-blue-100 dark:border-blue-500/20 text-center">
                <span className="text-base font-bold text-slate-800 dark:text-white">{a.length || '-'}<span className="text-xs text-slate-400 dark:text-white/40 ml-0.5">ft</span></span>
              </div>
              <div className="bg-white dark:bg-slate-900/40 rounded-lg p-2 border border-blue-100 dark:border-blue-500/20 text-center">
                <span className="text-base font-bold text-slate-800 dark:text-white">{a.width || '-'}<span className="text-xs text-slate-400 dark:text-white/40 ml-0.5">ft</span></span>
              </div>
              {hasThickness && (
                <div className="bg-white dark:bg-slate-900/40 rounded-lg p-2 border border-blue-100 dark:border-blue-500/20 text-center">
                  <span className="text-base font-bold text-slate-800 dark:text-white">{a.thickness || '-'}<span className="text-xs text-slate-400 dark:text-white/40 ml-0.5">in.</span></span>
                </div>
              )}
              {hasQty && (
                <div className="bg-white dark:bg-slate-900/40 rounded-lg p-2 border border-blue-100 dark:border-blue-500/20 text-center">
                  <span className="text-base font-bold text-slate-800 dark:text-white">{a.qty || '1'}</span>
                </div>
              )}
            </div>

            {/* Per-area cutting info row: overcut + optional cross-cut + total LF */}
            {parts && (
              <div className="flex flex-wrap items-center gap-1.5 px-1">
                {/* Overcut state */}
                <span
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                    overcutResolved
                      ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-500/30'
                      : 'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-500/30'
                  }`}
                >
                  {overcutResolved ? 'Overcut allowed' : 'No overcut — double-cut perimeter'}
                </span>

                {/* Cross-cut spacings (only when set) */}
                {hasCrossCut && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border bg-violet-50 dark:bg-violet-500/10 text-violet-700 dark:text-violet-300 border-violet-200 dark:border-violet-500/30">
                    Cross-cut:{lengthSpacing > 0 ? ` every ${lengthSpacing}ft length-wise` : ''}{lengthSpacing > 0 && widthSpacing > 0 ? ',' : ''}{widthSpacing > 0 ? ` ${widthSpacing}ft width-wise` : ''}
                  </span>
                )}

                {/* Computed total linear feet for this area */}
                <span className="inline-flex flex-col items-start px-2 py-0.5 rounded-full text-[10px] font-bold border bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-500/30">
                  <span>Total: {parts.total.toLocaleString(undefined, { maximumFractionDigits: 1 })} linear ft</span>
                  {parts.crossCutLf > 0 && (
                    <span className="text-[9px] font-semibold text-emerald-600/80 dark:text-emerald-400/70">
                      (perimeter {parts.perimeterLf.toLocaleString(undefined, { maximumFractionDigits: 1 })} + cross-cuts {parts.crossCutLf.toLocaleString(undefined, { maximumFractionDigits: 1 })})
                    </span>
                  )}
                </span>
              </div>
            )}
          </div>
        );
      })}
      <div className="flex flex-wrap items-center gap-3 px-1">
        {totalSqFt > 0 && (
          <p className="text-xs font-semibold text-blue-600 dark:text-blue-300">{totalSqFt.toLocaleString()} total sq ft</p>
        )}
        {grandTotalLf > 0 && (
          <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-300">
            {grandTotalLf.toLocaleString(undefined, { maximumFractionDigits: 1 })} total linear ft
          </p>
        )}
      </div>
    </div>
  );
}

// JSON field keys that have special renderers
const JSON_FIELD_KEYS = new Set(['holes', 'cuts', 'areas']);

export default function ScopeDetailsDisplay({ scopeDetails, compact = false, fallbackOvercutAllowed = false }: ScopeDetailsDisplayProps) {
  if (!scopeDetails || typeof scopeDetails !== 'object') return null;

  // Separate _removal from scope service entries
  const removalData = scopeDetails._removal as Record<string, string> | undefined;
  const entries = Object.entries(scopeDetails).filter(
    ([key, fields]) => key !== '_removal' && fields && typeof fields === 'object' && Object.values(fields).some(v => v && v.toString().trim() !== '' && v !== '0')
  );

  if (entries.length === 0 && !removalData) return null;

  if (compact) {
    return (
      <div className="flex flex-wrap gap-2">
        {entries.map(([code, fields]) => {
          // Build compact summary from JSON fields or regular fields
          const summaryParts: string[] = [];
          if (fields.holes) {
            const holes = parseJsonArray<{ qty: string }>(fields.holes, []);
            const total = holes.reduce((s, h) => s + (parseInt(h.qty) || 0), 0);
            if (total > 0) summaryParts.push(`${total} holes`);
          }
          if (fields.cuts) {
            const cuts = parseJsonArray<{ linear_feet: string }>(fields.cuts, []);
            const total = cuts.reduce((s, c) => s + (parseFloat(c.linear_feet) || 0), 0);
            if (total > 0) summaryParts.push(`${total.toLocaleString()} LF`);
          }
          if (fields.areas) {
            const areas = parseJsonArray<{ length: string; width: string; qty?: string }>(fields.areas, []);
            const total = areas.reduce((s, a) => s + ((parseFloat(a.length) || 0) * (parseFloat(a.width) || 0) * (parseInt(a.qty || '1') || 1)), 0);
            if (total > 0) summaryParts.push(`${total.toLocaleString()} sq ft`);
          }
          // Add regular non-JSON fields
          Object.entries(fields)
            .filter(([k, v]) => !JSON_FIELD_KEYS.has(k) && v && v.toString().trim() !== '' && v !== '0')
            .forEach(([key, val]) => {
              summaryParts.push(key === 'description' ? val : `${val}${FIELD_SUFFIXES[key] ? ` ${FIELD_SUFFIXES[key]}` : ''} ${FIELD_LABELS[key] || key}`);
            });

          return (
            <div key={code} className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-blue-50 border border-blue-200 rounded-lg text-xs">
              <span className="font-bold text-blue-700">{SERVICE_LABELS[code] || code}</span>
              {summaryParts.length > 0 && (
                <>
                  <span className="text-blue-500">—</span>
                  <span className="text-blue-600">{summaryParts.join(' · ')}</span>
                </>
              )}
            </div>
          );
        })}
        {removalData?.needed === 'true' && (
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-red-50 border border-red-200 rounded-lg text-xs">
            <span className="font-bold text-red-700">Removal</span>
            <span className="text-red-500">—</span>
            <span className="text-red-600">{REMOVAL_METHOD_LABELS[removalData.method] || removalData.method}</span>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {entries.map(([code, fields]) => {
        const hasJsonFields = fields.holes || fields.cuts || fields.areas;
        const regularFields = Object.entries(fields).filter(
          ([k, v]) => !JSON_FIELD_KEYS.has(k) && v && v.toString().trim() !== '' && v !== '0'
        );

        return (
          <div key={code} className="bg-blue-50/50 border border-blue-100 rounded-xl p-3 sm:p-4">
            <h4 className="text-xs font-bold text-blue-700 uppercase tracking-wider mb-2">
              {SERVICE_LABELS[code] || code}
            </h4>
            <div className="space-y-2">
              {/* Render JSON-based structured data */}
              {fields.holes && renderHoles(fields.holes)}
              {fields.cuts && renderCuts(fields.cuts)}
              {fields.areas && renderAreas(fields.areas, fallbackOvercutAllowed)}

              {/* Render regular fields */}
              {regularFields.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {regularFields.map(([key, val]) => (
                    <div key={key} className={`bg-white rounded-lg p-2.5 border border-blue-100 ${key === 'description' ? 'col-span-full' : ''}`}>
                      <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                        {FIELD_LABELS[key] || key}
                      </p>
                      {key === 'description' ? (
                        <p className="text-sm text-slate-800 mt-0.5 whitespace-pre-wrap">{val}</p>
                      ) : (
                        <p className="text-lg font-bold text-slate-800 mt-0.5">
                          {val}
                          {FIELD_SUFFIXES[key] && (
                            <span className="text-xs font-semibold text-slate-400 ml-1">{FIELD_SUFFIXES[key]}</span>
                          )}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        );
      })}
      {removalData?.needed === 'true' && (() => {
        const equip: string[] = removalData.equipment ? parseJsonArray<string>(removalData.equipment, []) : [];
        const hasMethod = !!removalData.method;
        const hasEquip = equip.length > 0;
        const hasWhat = !!removalData.what;
        const hasResponsible = !!removalData.responsible_party;
        const hasDumpsterSize = !!removalData.dumpster_size;
        return (
          <div className="bg-red-50/50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 rounded-xl p-3 sm:p-4">
            <h4 className="text-xs font-bold text-red-700 dark:text-red-300 uppercase tracking-wider mb-2">
              Material Removal
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {hasMethod && (
                <div className="bg-white dark:bg-slate-900/40 rounded-lg p-2.5 border border-red-100 dark:border-red-500/30">
                  <p className="text-[10px] font-semibold text-slate-400 dark:text-white/50 uppercase tracking-wider">Method</p>
                  <p className="text-lg font-bold text-slate-800 dark:text-white mt-0.5">
                    {REMOVAL_METHOD_LABELS[removalData.method] || removalData.method}
                  </p>
                </div>
              )}
              {hasDumpsterSize && (
                <div className="bg-white dark:bg-slate-900/40 rounded-lg p-2.5 border border-red-100 dark:border-red-500/30">
                  <p className="text-[10px] font-semibold text-slate-400 dark:text-white/50 uppercase tracking-wider">Dumpster Size</p>
                  <p className="text-lg font-bold text-slate-800 dark:text-white mt-0.5">{removalData.dumpster_size}</p>
                </div>
              )}
              {hasResponsible && (
                <div className="bg-white dark:bg-slate-900/40 rounded-lg p-2.5 border border-red-100 dark:border-red-500/30">
                  <p className="text-[10px] font-semibold text-slate-400 dark:text-white/50 uppercase tracking-wider">Responsible Party</p>
                  <p className="text-lg font-bold text-slate-800 dark:text-white mt-0.5">{removalData.responsible_party}</p>
                </div>
              )}
              {hasWhat && (
                <div className="bg-white dark:bg-slate-900/40 rounded-lg p-2.5 border border-red-100 dark:border-red-500/30 sm:col-span-2">
                  <p className="text-[10px] font-semibold text-slate-400 dark:text-white/50 uppercase tracking-wider">What is Being Removed</p>
                  <p className="text-base font-semibold text-slate-800 dark:text-white mt-0.5 whitespace-pre-wrap">{removalData.what}</p>
                </div>
              )}
              {hasEquip && (
                <div className="bg-white dark:bg-slate-900/40 rounded-lg p-2.5 border border-red-100 dark:border-red-500/30 sm:col-span-2">
                  <p className="text-[10px] font-semibold text-slate-400 dark:text-white/50 uppercase tracking-wider">Equipment</p>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {equip.map(e => (
                      <span key={e} className="px-2 py-0.5 bg-red-50 dark:bg-red-500/20 border border-red-200 dark:border-red-500/40 rounded text-xs font-semibold text-red-700 dark:text-red-300">
                        {REMOVAL_EQUIPMENT_LABELS[e] || e}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })()}
    </div>
  );
}
