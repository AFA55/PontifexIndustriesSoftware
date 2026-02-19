// ── Work Performed Constants & Interfaces ──
// Extracted from work-performed/page.tsx for reuse and cleaner code

// Organized work item categories based on DSM screenshots
export const WORK_CATEGORIES: Record<string, string[]> = {
  'Core Drilling': [
    'CORE DRILL',
    'HYDRAULIC CORE DRILL',
    'SPOT/CAUGHT CORES'
  ],
  'Sawing': [
    'SLAB SAW',
    'ELECTRIC SLAB SAW',
    'WALL SAW',
    'WIRE SAW',
    'HAND SAW',
    'FLUSH CUT HAND SAW',
    'CHAIN SAW',
    'RING SAW'
  ],
  'Breaking & Removal': [
    'BREAK & REMOVE',
    'DEMOLITION',
    'REMOVAL',
    'EXCAVATE DIRT',
    'BROKK'
  ],
  'Concrete Work': [
    'POURED/FINISH CONCRETE',
    'REPAIR',
    'GRINDING',
    'CHIPPING'
  ],
  'Installation': [
    'INSTALL BOLLARD(S)',
    'INSTALL LINTEL(S)',
    'MANHOLE BOOT',
    'JOINT SEALING'
  ],
  'Equipment & Tools': [
    'JACK HAMMERING',
    'HAND DRILL',
    'PRESSURE WASH',
    'VACUUMING & WATER CONTROL'
  ],
  'Services': [
    'IMAGE SCAN',
    'SAFETY MEETINGS/ORIENTATION',
    'STANDBY TIME',
    'TRAVEL CHARGE',
    'TRIP CHARGE',
    'HAULING',
    'DELIVER',
    'DUMPSTER CHARGE'
  ],
  'Materials': [
    'MATERIAL(S)',
    'SALE OF'
  ]
};

// Popular/Common items for quick access
export const POPULAR_ITEMS = [
  'CORE DRILL',
  'SLAB SAW',
  'WALL SAW',
  'HAND SAW',
  'CHAIN SAW',
  'BREAK & REMOVE',
  'JACK HAMMERING'
];

// ── Interfaces ──

export interface WorkItem {
  name: string;
  quantity: number;
  notes?: string;
  details?: CoreDrillingDetails | SawingDetails | GeneralDetails;
}

export interface CoreDrillingHole {
  bitSize: string;
  depthInches: number;
  quantity: number;
  plasticSetup: boolean;
  cutSteel: boolean;
  steelEncountered?: string;
}

export interface CoreDrillingDetails {
  holes: CoreDrillingHole[];
  notes?: string;
}

export interface CutArea {
  length: number; // in feet
  width: number; // in feet
  depth: number; // in inches
  quantity: number; // number of areas
  cutSteel: boolean;
  overcut: boolean;
  steelEncountered?: string;
  chainsawed: boolean;
  chainsawAreas?: number;
  chainsawWidthInches?: number;
}

export interface SawingCut {
  inputMode: 'linear' | 'area'; // How the cut was specified
  linearFeet: number; // Total linear feet (calculated from areas or direct input)
  cutDepth: number;
  areas?: CutArea[]; // If using area mode
  bladesUsed: string[];
  cutSteel: boolean;
  steelEncountered?: string;
  overcut: boolean;
  chainsawed: boolean;
  chainsawAreas?: number;
  chainsawWidthInches?: number;
}

export interface SawingDetails {
  cuts: SawingCut[];
  cutType: 'wet' | 'dry';
  notes?: string;
}

export interface GeneralDetails {
  duration?: number;
  equipment?: string[];
  notes?: string;
}
