'use client';

/**
 * RecommendedItems — Smart recommendations based on job_type codes
 * Parses job_type (comma-separated codes from schedule form) and maps to work items.
 */

// Job type code → recommended work items mapping
const JOB_TYPE_TO_ITEMS: Record<string, string[]> = {
  'ECD': ['CORE DRILL', 'ELECTRIC CORE DRILL'],
  'HFCD': ['CORE DRILL', 'HIGH FREQUENCY CORE DRILL'],
  'HCD': ['CORE DRILL', 'HYDRAULIC CORE DRILL'],
  'WS': ['WALL SAW'],
  'TS': ['SLAB SAW'],
  'WS/TS': ['WALL SAW', 'SLAB SAW'],
  'CS': ['CHAIN SAW'],
  'HHS': ['HAND SAW', 'FLUSH CUT HAND SAW'],
  'DFS': ['SLAB SAW'],
  'EFS': ['ELECTRIC SLAB SAW'],
  'Demo': ['BREAK & REMOVE', 'DEMOLITION', 'BROKK', 'JACK HAMMERING'],
  'GPR': ['IMAGE SCAN'],
  'WireSaw': ['WIRE SAW'],
  'PS': ['PUSH SAW'],
  'Other': [],
};

interface RecommendedItemsProps {
  jobType: string; // Comma-separated job_type codes from schedule form
  selectedItems: string[]; // Already selected item names
  onAddItem: (itemName: string) => void; // Callback to add an item
}

export default function RecommendedItems({ jobType, selectedItems, onAddItem }: RecommendedItemsProps) {
  if (!jobType) return null;

  // Parse comma-separated job type codes
  const codes = jobType.split(',').map(c => c.trim()).filter(Boolean);

  // Get unique recommended items from all codes
  const recommendedSet = new Set<string>();
  for (const code of codes) {
    const items = JOB_TYPE_TO_ITEMS[code];
    if (items) {
      items.forEach(item => recommendedSet.add(item));
    }
  }

  // Filter out already-selected items
  const recommendations = Array.from(recommendedSet).filter(
    item => !selectedItems.includes(item)
  );

  if (recommendations.length === 0) return null;

  return (
    <div className="mb-4">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xs font-bold text-brand bg-brand/10 px-2.5 py-1 rounded-lg border border-brand/30">
          Recommended
        </span>
        <span className="text-xs text-gray-500">Based on job type: {jobType}</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {recommendations.map((item) => (
          <button
            key={item}
            onClick={() => onAddItem(item)}
            className="px-3 py-2 bg-gradient-to-r from-brand/5 to-brand-accent/5 border-2 border-brand/30 text-brand rounded-xl text-xs font-bold hover:from-brand/10 hover:to-brand-accent/10 hover:border-brand/50 transition-all flex items-center gap-1.5"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            {item}
          </button>
        ))}
      </div>
    </div>
  );
}
