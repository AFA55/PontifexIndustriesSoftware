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

// Render dynamic areas (L x W x Thickness x Qty)
function renderAreas(areasJson: string) {
  const areas = parseJsonArray<{ length: string; width: string; thickness?: string; qty?: string }>(areasJson, []);
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
  return (
    <div className="col-span-full space-y-1.5">
      <div className={`grid gap-2 text-[10px] font-semibold text-slate-400 uppercase tracking-wider px-1`} style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
        <span>Length</span><span>Width</span>{hasThickness && <span>Thickness</span>}{hasQty && <span>Qty</span>}
      </div>
      {areas.map((a, i) => (
        <div key={i} className="grid gap-2" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
          <div className="bg-white rounded-lg p-2 border border-blue-100 text-center">
            <span className="text-base font-bold text-slate-800">{a.length || '-'}<span className="text-xs text-slate-400 ml-0.5">ft</span></span>
          </div>
          <div className="bg-white rounded-lg p-2 border border-blue-100 text-center">
            <span className="text-base font-bold text-slate-800">{a.width || '-'}<span className="text-xs text-slate-400 ml-0.5">ft</span></span>
          </div>
          {hasThickness && (
            <div className="bg-white rounded-lg p-2 border border-blue-100 text-center">
              <span className="text-base font-bold text-slate-800">{a.thickness || '-'}<span className="text-xs text-slate-400 ml-0.5">in.</span></span>
            </div>
          )}
          {hasQty && (
            <div className="bg-white rounded-lg p-2 border border-blue-100 text-center">
              <span className="text-base font-bold text-slate-800">{a.qty || '1'}</span>
            </div>
          )}
        </div>
      ))}
      {totalSqFt > 0 && (
        <p className="text-xs font-semibold text-blue-600 px-1">{totalSqFt.toLocaleString()} total sq ft</p>
      )}
    </div>
  );
}

// JSON field keys that have special renderers
const JSON_FIELD_KEYS = new Set(['holes', 'cuts', 'areas']);

export default function ScopeDetailsDisplay({ scopeDetails, compact = false }: ScopeDetailsDisplayProps) {
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
              {fields.areas && renderAreas(fields.areas)}

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
      {removalData?.needed === 'true' && (
        <div className="bg-red-50/50 border border-red-100 rounded-xl p-3 sm:p-4">
          <h4 className="text-xs font-bold text-red-700 uppercase tracking-wider mb-2">
            Material Removal
          </h4>
          <div className="flex flex-wrap gap-2">
            <div className="bg-white rounded-lg p-2.5 border border-red-100">
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Method</p>
              <p className="text-lg font-bold text-slate-800 mt-0.5">
                {REMOVAL_METHOD_LABELS[removalData.method] || removalData.method}
              </p>
            </div>
            {removalData.equipment && (() => {
              const equip: string[] = parseJsonArray(removalData.equipment, []);
              return equip.length > 0 ? (
                <div className="bg-white rounded-lg p-2.5 border border-red-100">
                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Equipment</p>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {equip.map(e => (
                      <span key={e} className="px-2 py-0.5 bg-red-50 border border-red-200 rounded text-xs font-semibold text-red-700">
                        {REMOVAL_EQUIPMENT_LABELS[e] || e}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null;
            })()}
          </div>
        </div>
      )}
    </div>
  );
}
