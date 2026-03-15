'use client';

/**
 * EquipmentSelectionsDisplay
 * Renders the per-service-type equipment selections from the schedule form.
 * Shows toggles, quantities, and options in a clean read-only format.
 */

// Service code → display name
const SERVICE_LABELS: Record<string, string> = {
  'ECD': 'Electric Core Drilling',
  'HFCD': 'High Frequency Core Drilling',
  'HCD': 'Hydraulic Core Drilling',
  'DFS': 'Floor Sawing',
  'WS/TS': 'Wall/Track Sawing',
  'CS': 'Chain Sawing',
  'HHS/PS': 'Handheld / Push Sawing',
  'WireSaw': 'Wire Sawing',
  'GPR': 'GPR Scanning',
  'Demo': 'Selective Demo',
  'Brokk': 'Brokk',
};

// Item ID → friendly label
const ITEM_LABELS: Record<string, string> = {
  '_sub': 'System Type',
  'ecd_machine': 'ECD',
  'hfcd_machine': 'HFCD',
  'pump_can': 'Pump Can',
  'slurry_ring': 'Slurry Ring',
  'hydraulic_hose': 'Hydraulic Hose',
  'dpp': 'Diesel Power Pack',
  'hcd_stand': 'HCD Stand',
  'slurry_drums': 'Slurry Drums',
  'extra_vacuum_head': 'Extra Vacuum Head',
  'backup_saw': 'Backup Saw',
  'chalk_line': 'Chalk Line',
  'clear_spray': 'Clear Spray',
  '480_cord': '480 Cord',
  '32_guard': '32" Guard',
  '42_guard': '42" Guard',
  '63_backup': '63 Backup System',
  'track_pent': 'Track',
  'boots_pent': 'Boots',
  'generator': 'Generator',
  'backup_track_saw': 'Backup Track Saw',
  'track_pbg': 'Track',
  'guards_pbg': 'Guards',
  'boots_pbg': 'Boots',
  'slurry_drums_pbg': 'Slurry Drums',
  'plastic': 'Plastic',
  'duct_tape': 'Duct Tape',
  'apron': 'Apron',
  'chain_saw': 'Chain Saw',
  'spray_paint': 'Spray Paint',
  '15_bar_chain': '15" Bar & Chain',
  '20_bar_chain': '20" Bar & Chain',
};

// Sub-option value → label
const SUB_OPTION_LABELS: Record<string, string> = {
  'pentruder': 'Pentruder',
  'pbg': 'Track Saw (PBG)',
};

interface EquipmentSelectionsDisplayProps {
  equipmentSelections: Record<string, Record<string, string>> | null | undefined;
}

export default function EquipmentSelectionsDisplay({ equipmentSelections }: EquipmentSelectionsDisplayProps) {
  if (!equipmentSelections || typeof equipmentSelections !== 'object') return null;

  const entries = Object.entries(equipmentSelections).filter(
    ([, items]) => items && typeof items === 'object' && Object.keys(items).length > 0
  );

  if (entries.length === 0) return null;

  return (
    <div className="space-y-3">
      {entries.map(([code, items]) => {
        const subOption = items._sub;
        const equipItems = Object.entries(items).filter(
          ([k, v]) => k !== '_sub' && v && v.trim() !== ''
        );

        if (equipItems.length === 0 && !subOption) return null;

        return (
          <div key={code} className="bg-emerald-50/50 border border-emerald-100 rounded-xl p-3 sm:p-4">
            <div className="flex items-center gap-2 mb-2">
              <h4 className="text-xs font-bold text-emerald-700 uppercase tracking-wider">
                {SERVICE_LABELS[code] || code}
              </h4>
              {subOption && (
                <span className="px-2 py-0.5 bg-emerald-100 border border-emerald-200 rounded-full text-[10px] font-bold text-emerald-700">
                  {SUB_OPTION_LABELS[subOption] || subOption}
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {equipItems.map(([itemId, value]) => {
                // Determine the label
                let label = ITEM_LABELS[itemId] || itemId.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

                // Core bit items
                if (itemId.startsWith('core_bit_')) {
                  const size = itemId.replace('core_bit_', '');
                  label = `${size}" Core Bit`;
                }

                // Determine display value
                const isToggle = value === 'yes';
                const isNumber = !isNaN(Number(value)) && value !== 'yes';

                return (
                  <span
                    key={itemId}
                    className="inline-flex items-center gap-1 px-2.5 py-1 bg-white border border-emerald-200 rounded-lg text-xs font-semibold text-emerald-800"
                  >
                    {label}
                    {isNumber && (
                      <span className="text-emerald-600 font-bold">x{value}</span>
                    )}
                    {!isToggle && !isNumber && value !== 'yes' && (
                      <span className="text-emerald-600 font-bold">{value}</span>
                    )}
                  </span>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
