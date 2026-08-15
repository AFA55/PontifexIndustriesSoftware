/**
 * The operator's work-performed vocabulary + the pure logic behind the
 * scope-of-work-shaped entry form.
 *
 * WHY THIS FILE EXISTS (founder, Aug 15 2026): "Once the project manager inputs
 * core drilling or electric floor sawing or hydraulic core drilling, I would
 * like the operator's page when they're trying to submit work performed to look
 * exactly like this, because literally they're just inputting information as
 * well." The office's Scope of Work step (app/dashboard/admin/schedule-form,
 * step 3) picks work types as tiles first, then fills a measurement builder per
 * type. The operator screen now does the same thing — and this module holds
 * everything about it that is pure, so it can be unit-tested instead of
 * eyeballed inside a 5,000-line page.
 *
 * THE ONE RULE THAT MATTERS MOST: what comes out of here is the SAME
 * `details_json` shape the operator page has always written. Nothing downstream
 * (lib/work-items-format.ts, the printed ticket, the invoice, the customer
 * portal) has to learn a new shape, and a row saved yesterday still renders
 * exactly as it did. There is ONE write path — POST
 * /api/job-orders/[id]/work-items — and this file feeds it.
 */

// ── The work-type catalog (was inline in the work-performed page) ────────────
export const WORK_CATEGORIES: Record<string, string[]> = {
  'Core Drilling': ['CORE DRILL', 'HYDRAULIC CORE DRILL', 'SPOT/CAUGHT CORES'],
  Sawing: [
    'SLAB SAW',
    'ELECTRIC SLAB SAW',
    'WALL SAW',
    'WIRE SAW',
    'HAND SAW',
    'FLUSH CUT HAND SAW',
    'CHAIN SAW',
    'RING SAW',
    'PUSH SAW',
  ],
  'Breaking & Removal': ['BREAK & REMOVE', 'DEMOLITION', 'REMOVAL', 'EXCAVATE DIRT', 'BROKK'],
  'Concrete Work': ['POURED/FINISH CONCRETE', 'REPAIR', 'GRINDING', 'CHIPPING'],
  Installation: ['INSTALL BOLLARD(S)', 'INSTALL LINTEL(S)', 'MANHOLE BOOT', 'JOINT SEALING'],
  'Equipment & Tools': ['JACK HAMMERING', 'HAND DRILL', 'PRESSURE WASH', 'VACUUMING & WATER CONTROL'],
  Services: [
    'IMAGE SCAN',
    'SAFETY MEETINGS/ORIENTATION',
    'STANDBY TIME',
    'TRAVEL CHARGE',
    'TRIP CHARGE',
    'HAULING',
    'DELIVER',
    'DUMPSTER CHARGE',
  ],
  Materials: ['MATERIAL(S)', 'SALE OF'],
};

export const ALL_WORK_TYPES: string[] = Object.values(WORK_CATEGORIES).flat();

/** Work types the crew reaches for most — shown when the office scoped nothing. */
export const POPULAR_WORK_TYPES = [
  'CORE DRILL',
  'SLAB SAW',
  'WALL SAW',
  'HAND SAW',
  'CHAIN SAW',
  'BREAK & REMOVE',
  'JACK HAMMERING',
];

// ── Which measurement builder a work type gets ───────────────────────────────
export type WorkEntryMode = 'holes' | 'sawing' | 'demo' | 'generic';
/** Sawing asks the same either/or the office's scope form asks. */
export type SawInputMode = 'linear' | 'areas';

export const isCoreDrilling = (name: string) => name.toUpperCase().includes('CORE DRILL');
export const isSawing = (name: string) => {
  const n = name.toUpperCase();
  return n.includes('SAW') && !n.includes('CORE DRILL');
};
export const isChainsaw = (name: string) => name.toUpperCase().includes('CHAIN SAW');
const isBreakAndRemove = (name: string) => {
  const n = name.toUpperCase();
  return n.includes('BREAK & REMOVE') || n.includes('REMOVAL') || n.includes('DEMOLITION');
};
const isJackHammering = (name: string) => {
  const n = name.toUpperCase();
  return n.includes('JACK HAMMERING') || n.includes('JACKHAMMER');
};
const isChipping = (name: string) => name.toUpperCase().includes('CHIPPING');
const isBrokk = (name: string) => name.toUpperCase().includes('BROKK');

/**
 * The builder a work type gets. Deliberately identical to the predicates the
 * page used before the rebuild — EXCAVATE DIRT stays generic, not demo, exactly
 * as it was, so no operator's habitual entry changes shape underneath them.
 */
export function workEntryMode(name: string): WorkEntryMode {
  if (isCoreDrilling(name)) return 'holes';
  if (isSawing(name)) return 'sawing';
  if (isBreakAndRemove(name) || isJackHammering(name) || isChipping(name) || isBrokk(name)) {
    return 'demo';
  }
  return 'generic';
}

/** Sensible default unit per work type, so the operator rarely changes it. */
export function defaultUnitFor(name: string): string {
  const n = name.toUpperCase();
  if (n.includes('CORE')) return 'holes';
  if (n.includes('GRINDING') || n.includes('CONCRETE') || n.includes('REPAIR')) return 'sq ft';
  if (n.includes('EXCAVATE') || n.includes('HAUL') || n.includes('DUMPSTER')) return 'loads';
  if (n.includes('INSTALL') || n.includes('BOLLARD') || n.includes('LINTEL') || n.includes('BOOT')) return 'each';
  if (n.includes('SEALING')) return 'linear ft';
  if (n.includes('STANDBY') || n.includes('TRAVEL') || n.includes('MEETING') || n.includes('WASH') || n.includes('VACUUM')) return 'hours';
  if (n.includes('SCAN')) return 'sq ft';
  return 'each';
}

export const UNIT_CHOICES = ['each', 'holes', 'linear ft', 'sq ft', 'loads', 'hours'];

// ── Recommended types: what the office actually sent this crew to do ─────────
//
// The office picks SERVICE CODES on the schedule form (ECD, EFS, HCD, …) and
// they land on `job_orders.scope_details` (keyed by code), on `job_scope_items`
// (as human labels) and on the legacy `job_type` CSV. The operator's picker
// leads with the work types those codes imply, because that is what the crew
// was dispatched for — everything else is one tap further away behind "Other".

export const SCOPE_CODE_TO_WORK_TYPES: Record<string, string[]> = {
  ECD: ['CORE DRILL'],
  HFCD: ['CORE DRILL'],
  HCD: ['HYDRAULIC CORE DRILL'],
  DFS: ['SLAB SAW'],
  EFS: ['ELECTRIC SLAB SAW'],
  'WS/TS': ['WALL SAW', 'SLAB SAW'],
  WS: ['WALL SAW'],
  TS: ['SLAB SAW'],
  CS: ['CHAIN SAW'],
  'HHS/PS': ['HAND SAW', 'PUSH SAW'],
  HHS: ['HAND SAW'],
  PS: ['PUSH SAW'],
  WireSaw: ['WIRE SAW'],
  GPR: ['IMAGE SCAN'],
  Demo: ['BREAK & REMOVE', 'DEMOLITION', 'JACK HAMMERING'],
  Brokk: ['BROKK'],
  Other: [],
};

/** The office's service labels, for reading `job_scope_items.work_type` back. */
export const SCOPE_LABEL_TO_CODE: Record<string, string> = {
  'electric core drilling': 'ECD',
  'high frequency core drilling': 'HFCD',
  'hydraulic core drilling': 'HCD',
  'diesel floor sawing': 'DFS',
  'electric floor sawing': 'EFS',
  'wall/track sawing': 'WS/TS',
  'chain sawing': 'CS',
  'handheld / push sawing': 'HHS/PS',
  'wire sawing': 'WireSaw',
  'gpr scanning': 'GPR',
  'selective demo': 'Demo',
  brokk: 'Brokk',
};

export interface RecommendedSource {
  /** `job_orders.scope_details` — an object keyed by service code. */
  scopeDetails?: Record<string, unknown> | null;
  /** `job_scope_items` rows (or anything with a `work_type` label). */
  scopeItems?: Array<{ work_type?: string | null }> | null;
  /** Legacy `job_orders.job_type` — a comma-separated code list. */
  jobType?: string | null;
}

/** Service codes the office put on this job, in the order they were found. */
export function resolveScopeCodes(source: RecommendedSource): string[] {
  const codes: string[] = [];
  const push = (raw: unknown) => {
    const code = typeof raw === 'string' ? raw.trim() : '';
    // `_removal` and friends are synthetic keys the schedule form writes into
    // scope_details; they are not services.
    if (!code || code.startsWith('_')) return;
    if (!codes.includes(code)) codes.push(code);
  };

  if (source.scopeDetails && typeof source.scopeDetails === 'object') {
    for (const key of Object.keys(source.scopeDetails)) push(key);
  }
  for (const item of source.scopeItems ?? []) {
    const label = (item?.work_type || '').trim().toLowerCase();
    if (!label) continue;
    const mapped = SCOPE_LABEL_TO_CODE[label];
    if (mapped) push(mapped);
  }
  for (const raw of (source.jobType || '').split(',')) push(raw);

  return codes;
}

/**
 * The work types to show FIRST — resolved from the job's scope, deduped, in
 * order, and filtered to types the picker can actually build a measurement for.
 * An unknown code contributes nothing rather than a tile that goes nowhere.
 */
export function resolveRecommendedWorkTypes(source: RecommendedSource): string[] {
  const out: string[] = [];
  for (const code of resolveScopeCodes(source)) {
    for (const name of SCOPE_CODE_TO_WORK_TYPES[code] ?? []) {
      if (ALL_WORK_TYPES.includes(name) && !out.includes(name)) out.push(name);
    }
  }
  return out;
}

// ── Rebar (see the storage note in lib/work-items-format.ts) ─────────────────
export interface RebarFields {
  /** '#4', or free text ('unknown'), or '' for none. */
  rebarSize?: string;
  cutSteel: boolean;
  steelEncountered?: string;
}

export const EMPTY_REBAR: RebarFields = { rebarSize: '', cutSteel: false, steelEncountered: '' };

/**
 * Stamps the legacy fields from the rebar-size answer. All three are written:
 * every reader built before the size question keys off `cutSteel` /
 * `steelEncountered`, and nothing stored is ever renamed or migrated.
 */
export function withRebarCompat<T extends RebarFields>(entry: T): T {
  const size = (entry.rebarSize || '').trim();
  return {
    ...entry,
    rebarSize: size,
    cutSteel: size.length > 0,
    steelEncountered: size ? (size.startsWith('#') ? `${size} rebar` : size) : '',
  };
}

// ── The stored detail shapes (unchanged — see the file header) ───────────────
export interface CoreDrillingHole extends RebarFields {
  bitSize: string;
  depthInches: number;
  quantity: number;
  plasticSetup: boolean;
}
export interface CoreDrillingDetails {
  holes: CoreDrillingHole[];
  notes?: string;
  materialRemoval?: StoredMaterialRemoval;
}
export interface CutArea extends RebarFields {
  length: number;
  width: number;
  depth: number;
  quantity: number;
  overcut: boolean;
  chainsawed: boolean;
}
export interface SawingCut extends RebarFields {
  inputMode: 'linear' | 'area';
  linearFeet: number;
  cutDepth: number;
  areas?: CutArea[];
  bladesUsed: string[];
  overcut: boolean;
  chainsawed: boolean;
}
export interface SawingDetails {
  cuts: SawingCut[];
  cutType: 'wet' | 'dry';
  notes?: string;
  materialRemoval?: StoredMaterialRemoval;
}
export interface DemolitionArea {
  length: number;
  width: number;
  depth?: number;
  thickness?: number;
  /**
   * How many identical areas. THE TOTAL IS COMPUTED FROM THIS, so it has to be
   * stored: it was used to work out `totalSquareFeet` and then dropped from the
   * stored row, which meant five 10x10 pads submitted as 500 sq ft came back as
   * one 10x10 with no quantity — and a resubmit (open day-complete, press Back,
   * submit again) silently re-billed it as 100. The printed sheet also read
   * "500 sq ft" beside a single 10x10 rectangle, so the office had no way to
   * tell which number was real.
   */
  quantity?: number;
}
export interface DemolitionDetails {
  areas: DemolitionArea[];
  totalSquareFeet: number;
  method?: string;
  equipment?: string;
  avgThicknessInches?: number;
  notes?: string;
  materialRemoval?: StoredMaterialRemoval;
}
export interface GeneralDetails {
  unit?: string;
  notes?: string;
  materialRemoval?: StoredMaterialRemoval;
}

export type WorkItemDetails =
  | CoreDrillingDetails
  | SawingDetails
  | DemolitionDetails
  | GeneralDetails;

export interface WorkItem {
  name: string;
  quantity: number;
  /** QUICK NOTE — INTERNAL. Never crosses a customer-facing boundary; see
   *  `stripInternalNotes` / `toCompletionPdfWorkItems` in work-items-format. */
  notes?: string;
  details?: WorkItemDetails;
}

// ── Material removal (the founder asked for hand removal alongside the two
//    dumpster options the office form offers) ──────────────────────────────
export type RemovalMethod = '' | 'dumpster_on_site' | 'our_dump_truck' | 'hand';

export const REMOVAL_METHODS: { value: Exclude<RemovalMethod, ''>; label: string }[] = [
  { value: 'dumpster_on_site', label: 'Dumpster on Site' },
  { value: 'our_dump_truck', label: 'Our Dump Truck' },
  { value: 'hand', label: 'Hand Removal' },
];

export const REMOVAL_EQUIPMENT = [
  'Forklift',
  'Skidsteer',
  'Lull',
  'Dingo',
  'Sherpa',
  'Mini Excavator',
  'Wheelbarrow',
  'By Hand',
];

export interface MaterialRemoval {
  removed: boolean;
  method: RemovalMethod;
  equipment: string[];
}

export const EMPTY_REMOVAL: MaterialRemoval = { removed: false, method: '', equipment: [] };

/** What actually lands in `details_json`. Structured, office-readable, and
 *  invisible to the measurement formatter unless it is a removal work type. */
export interface StoredMaterialRemoval {
  removed: true;
  method: string;
  equipment: string[];
}

export function removalMethodLabel(method: RemovalMethod): string {
  return REMOVAL_METHODS.find((m) => m.value === method)?.label ?? '';
}

// ── The editable form row shapes (strings — a phone keyboard types strings) ──
export interface HoleRow {
  quantity: string;
  bitSize: string;
  depthInches: string;
  plasticSetup: boolean;
}
export interface LinearCutRow {
  linearFeet: string;
  cutDepth: string;
}
export interface AreaRow {
  length: string;
  width: string;
  thickness: string;
  quantity: string;
}

export interface WorkEntry {
  name: string;
  mode: WorkEntryMode;
  sawMode: SawInputMode;
  cutType: 'wet' | 'dry';
  /** One rebar answer per work type — see the note in the form component. */
  rebarSize: string;
  holes: HoleRow[];
  cuts: LinearCutRow[];
  areas: AreaRow[];
  quantity: string;
  unit: string;
  notes: string;
}

export const emptyHoleRow = (): HoleRow => ({ quantity: '', bitSize: '', depthInches: '', plasticSetup: false });
export const emptyCutRow = (): LinearCutRow => ({ linearFeet: '', cutDepth: '' });
export const emptyAreaRow = (): AreaRow => ({ length: '', width: '', thickness: '', quantity: '' });

export function emptyWorkEntry(name: string): WorkEntry {
  const mode = workEntryMode(name);
  return {
    name,
    mode,
    sawMode: 'linear',
    cutType: 'wet',
    rebarSize: '',
    holes: mode === 'holes' ? [emptyHoleRow()] : [],
    cuts: mode === 'sawing' ? [emptyCutRow()] : [],
    areas: mode === 'demo' ? [emptyAreaRow()] : [],
    quantity: '',
    unit: defaultUnitFor(name),
    notes: '',
  };
}

// ── Number helpers ───────────────────────────────────────────────────────────
const num = (v: unknown): number => {
  const x = typeof v === 'number' ? v : parseFloat(String(v ?? ''));
  return isFinite(x) ? x : 0;
};
const round2 = (v: number): number => Math.round(v * 100) / 100;

/** Perimeter × qty. We bill LINEAR FEET OF CUT, not square feet — this is the
 *  same math the operator page has always used for an L × W cut area, kept
 *  byte-for-byte so no already-entered number changes meaning. */
export function areaLinearFeet(area: { length: number; width: number; quantity?: number }): number {
  const perimeter = 2 * area.length + 2 * area.width;
  return perimeter * (area.quantity || 1);
}

export function totalHoles(entry: WorkEntry): number {
  return entry.holes.reduce((sum, h) => {
    const q = num(h.quantity);
    // A row with a size/depth but a blank count is one hole, not zero.
    if (q > 0) return sum + q;
    return sum + (h.bitSize.trim() || num(h.depthInches) > 0 ? 1 : 0);
  }, 0);
}

export function totalLinearFeet(entry: WorkEntry): number {
  if (entry.sawMode === 'areas') {
    return round2(
      entry.areas.reduce(
        (sum, a) => sum + areaLinearFeet({ length: num(a.length), width: num(a.width), quantity: num(a.quantity) || 1 }),
        0
      )
    );
  }
  return round2(entry.cuts.reduce((sum, c) => sum + num(c.linearFeet), 0));
}

export function totalSquareFeet(entry: WorkEntry): number {
  return round2(
    entry.areas.reduce((sum, a) => sum + num(a.length) * num(a.width) * (num(a.quantity) || 1), 0)
  );
}

/**
 * Has the operator actually said what they did? A ticked work type with nothing
 * behind it is not a record of anything, and submitting one tells the office a
 * work type happened and nothing about it. The submit gate uses this.
 */
export function entryHasMeasurements(entry: WorkEntry): boolean {
  switch (entry.mode) {
    case 'holes':
      return entry.holes.some((h) => h.bitSize.trim() !== '' || num(h.depthInches) > 0 || num(h.quantity) > 0);
    case 'sawing':
      return entry.sawMode === 'areas'
        ? entry.areas.some((a) => num(a.length) > 0 && num(a.width) > 0)
        : entry.cuts.some((c) => num(c.linearFeet) > 0);
    case 'demo':
      return entry.areas.some((a) => num(a.length) > 0 && num(a.width) > 0);
    case 'generic':
    default:
      return num(entry.quantity) > 0;
  }
}

function storedRemoval(removal?: MaterialRemoval | null): StoredMaterialRemoval | undefined {
  if (!removal?.removed) return undefined;
  return {
    removed: true,
    method: removalMethodLabel(removal.method),
    equipment: [...removal.equipment],
  };
}

/**
 * One WorkEntry → the one `work_items` row it becomes.
 *
 * `details` is the SAME shape the page has always written, so
 * `lib/work-items-format.ts` renders it with no change: `holes[]` for core
 * drilling, `cuts[]` (optionally carrying nested `areas[]`) for sawing, a
 * top-level `areas[]` for demolition, and `{ unit }` for everything else.
 */
export function buildWorkItemFromEntry(entry: WorkEntry, removal?: MaterialRemoval | null): WorkItem {
  const notes = entry.notes.trim() || undefined;
  const rebar = withRebarCompat({ ...EMPTY_REBAR, rebarSize: entry.rebarSize });
  const materialRemoval = storedRemoval(removal);

  if (entry.mode === 'holes') {
    const holes: CoreDrillingHole[] = entry.holes
      .filter((h) => h.bitSize.trim() !== '' || num(h.depthInches) > 0 || num(h.quantity) > 0)
      .map((h) => ({
        bitSize: h.bitSize.trim(),
        depthInches: num(h.depthInches),
        quantity: num(h.quantity) || 1,
        plasticSetup: h.plasticSetup,
        ...rebar,
      }));
    const details: CoreDrillingDetails = { holes, notes, ...(materialRemoval ? { materialRemoval } : {}) };
    return {
      name: entry.name,
      quantity: holes.reduce((sum, h) => sum + (h.quantity || 1), 0),
      notes,
      details,
    };
  }

  if (entry.mode === 'sawing') {
    // BOTH SIDES ARE SERIALIZED, not just the active tab.
    //
    // This used to store only whichever mode was showing. Type three areas,
    // mis-tap "Linear Ft + Cut Depth", and the autosaved draft became
    // `{cuts: []}` — the areas survived in React state so the screen still
    // looked right, and then a reload, a phone lock or the app being killed
    // lost them. That is the Aug-10 Devin/Zack failure in a new costume: data
    // visibly on screen that quietly is not saved.
    //
    // Storing both is also the shape the reader now expects (see the
    // round-trip below) and the one production already contains.
    const areaCuts: SawingCut[] = (() => {
      const areas: CutArea[] = entry.areas
        .filter((a) => num(a.length) > 0 && num(a.width) > 0)
        .map((a) => ({
          length: num(a.length),
          width: num(a.width),
          depth: num(a.thickness),
          quantity: num(a.quantity) || 1,
          overcut: false,
          chainsawed: false,
          ...rebar,
        }));
      // ONE cut carrying every rectangle — the shape `describeCut` already
      // prints the dimensions from ("120 LF @ 6" (10' × 9', 4' × 6')").
      return areas.length
        ? [
            {
              inputMode: 'area' as const,
              linearFeet: round2(areas.reduce((sum, a) => sum + areaLinearFeet(a), 0)),
              cutDepth: areas[0].depth,
              areas,
              bladesUsed: [],
              overcut: false,
              chainsawed: false,
              ...rebar,
            },
          ]
        : [];
    })();

    const linearCuts: SawingCut[] = entry.cuts
      .filter((c) => num(c.linearFeet) > 0 || num(c.cutDepth) > 0)
      .map((c) => ({
        inputMode: 'linear' as const,
        linearFeet: num(c.linearFeet),
        cutDepth: num(c.cutDepth),
        areas: [],
        bladesUsed: [],
        overcut: false,
        chainsawed: false,
        ...rebar,
      }));

    // Active mode first so `describeCut` leads with what the operator was
    // looking at; the other side is kept rather than discarded.
    const cuts: SawingCut[] =
      entry.sawMode === 'areas' ? [...areaCuts, ...linearCuts] : [...linearCuts, ...areaCuts];
    const details: SawingDetails = {
      cuts,
      cutType: entry.cutType,
      notes,
      ...(materialRemoval ? { materialRemoval } : {}),
    };
    return {
      name: entry.name,
      quantity: round2(cuts.reduce((sum, c) => sum + c.linearFeet, 0)),
      notes,
      details,
    };
  }

  if (entry.mode === 'demo') {
    const areas: DemolitionArea[] = entry.areas
      .filter((a) => num(a.length) > 0 && num(a.width) > 0)
      .map((a) => ({
        length: num(a.length),
        width: num(a.width),
        depth: num(a.thickness),
        quantity: num(a.quantity) || 1,
      }));
    const sqft = round2(
      entry.areas.reduce((sum, a) => sum + num(a.length) * num(a.width) * (num(a.quantity) || 1), 0)
    );
    const details: DemolitionDetails = {
      areas,
      totalSquareFeet: sqft,
      // The demo branch of `workItemDetailLine` already renders these two, so a
      // removal answer shows up on the ticket for exactly the work types it is
      // about — and nowhere else.
      ...(removal?.removed && removal.method ? { method: removalMethodLabel(removal.method) } : {}),
      ...(removal?.removed && removal.equipment.length ? { equipment: removal.equipment.join(', ') } : {}),
      notes,
      ...(materialRemoval ? { materialRemoval } : {}),
    };
    return { name: entry.name, quantity: sqft, notes, details };
  }

  const details: GeneralDetails = {
    unit: entry.unit,
    notes,
    ...(materialRemoval ? { materialRemoval } : {}),
  };
  return { name: entry.name, quantity: num(entry.quantity), notes, details };
}

/**
 * The way back: a stored WorkItem → an editable WorkEntry.
 *
 * The draft (localStorage + `work-performed-draft`) and the "you already
 * submitted today" hydration both hand back WorkItems, including ones written
 * by the PREVIOUS version of this screen. Everything here reads defensively so
 * an old draft opens rather than throwing away the operator's morning.
 */
export function workEntryFromWorkItem(item: WorkItem): WorkEntry {
  const entry = emptyWorkEntry(item.name);
  entry.notes = item.notes ?? '';

  const details = item.details as Partial<CoreDrillingDetails & SawingDetails & DemolitionDetails & GeneralDetails> | undefined;
  if (!details) {
    if (entry.mode === 'generic' && item.quantity > 0) entry.quantity = String(item.quantity);
    return entry;
  }
  if (!entry.notes && typeof details.notes === 'string') entry.notes = details.notes;

  if (Array.isArray(details.holes) && details.holes.length > 0) {
    entry.mode = 'holes';
    entry.holes = details.holes.map((h) => ({
      quantity: h?.quantity ? String(h.quantity) : '',
      bitSize: h?.bitSize ? String(h.bitSize) : '',
      depthInches: h?.depthInches ? String(h.depthInches) : '',
      plasticSetup: !!h?.plasticSetup,
    }));
    entry.rebarSize = (details.holes.find((h) => (h as RebarFields)?.rebarSize)?.rebarSize as string) || '';
    return entry;
  }

  if (Array.isArray(details.cuts) && details.cuts.length > 0) {
    entry.mode = 'sawing';
    entry.cutType = details.cutType === 'dry' ? 'dry' : 'wet';
    entry.rebarSize = (details.cuts.find((c) => (c as RebarFields)?.rebarSize)?.rebarSize as string) || '';
    const nestedAreas = details.cuts.flatMap((c) => (Array.isArray(c?.areas) ? c.areas : []));
    if (nestedAreas.length > 0) {
      // BOTH SHAPES CAN COEXIST on one saw item — the old page stored a cuts
      // ARRAY where each cut carried its own inputMode, so "120 LF of linear
      // plus a 10x9 area" is a real row sitting in production today. This used
      // to see the areas, flip the whole entry to 'areas' and RESET cuts to a
      // blank row, so reopening that item to fix a note and resubmitting turned
      // 158 linear feet into 38 on the invoice. Keep whatever is there.
      entry.sawMode = 'areas';
      entry.areas = nestedAreas.map((a) => ({
        length: a?.length ? String(a.length) : '',
        width: a?.width ? String(a.width) : '',
        thickness: a?.depth ? String(a.depth) : '',
        quantity: a?.quantity ? String(a.quantity) : '',
      }));
      const survivingLinear = details.cuts
        // inputMode matters: an AREA cut also carries a linearFeet total (the
        // perimeter), so filtering on linearFeet alone re-imported the area as
        // a linear cut and double-counted it — 158 LF came back as 196.
        .filter((c) => c?.inputMode !== 'area' && (c?.linearFeet ?? 0) > 0)
        .map((c) => ({
          linearFeet: c?.linearFeet ? String(c.linearFeet) : '',
          cutDepth: c?.cutDepth ? String(c.cutDepth) : '',
        }));
      entry.cuts = survivingLinear.length > 0 ? survivingLinear : [emptyCutRow()];
    } else {
      entry.sawMode = 'linear';
      entry.cuts = details.cuts.map((c) => ({
        linearFeet: c?.linearFeet ? String(c.linearFeet) : '',
        cutDepth: c?.cutDepth ? String(c.cutDepth) : '',
      }));
      entry.areas = [emptyAreaRow()];
    }
    return entry;
  }

  if (Array.isArray(details.areas) && details.areas.length > 0) {
    entry.mode = 'demo';
    entry.areas = details.areas.map((a) => ({
      length: a?.length ? String(a.length) : '',
      width: a?.width ? String(a.width) : '',
      thickness: a?.depth ? String(a.depth) : a?.thickness ? String(a.thickness) : '',
      // Rows written before `quantity` was stored have none; 1 is the honest
      // reading of "one area of these dimensions", and it round-trips to the
      // same total rather than collapsing it.
      quantity: a?.quantity ? String(a.quantity) : '',
    }));
    return entry;
  }

  // Nothing measured. DO NOT force `generic` here: a work type that was only
  // TICKED still stores its (empty) container — `{ holes: [] }` for a core
  // drill, `{ cuts: [] }` for a saw — and the branches above only match a
  // NON-empty one. Overriding the mode turned a ticked-but-empty CORE DRILL
  // into a "how much / unit" box when the operator's draft came back, i.e.
  // exactly the row they had not finished filling in. The name already decided
  // the builder in `emptyWorkEntry` above; leave it alone.
  if (entry.mode === 'generic') {
    if (typeof details.unit === 'string' && details.unit) entry.unit = details.unit;
    if (item.quantity > 0) entry.quantity = String(item.quantity);
  }
  return entry;
}

/** Reads a stored removal answer back out of any of the day's items. */
export function removalFromWorkItems(items: WorkItem[]): MaterialRemoval {
  for (const item of items) {
    const stored = (item.details as { materialRemoval?: StoredMaterialRemoval } | undefined)?.materialRemoval;
    if (!stored?.removed) continue;
    const method = REMOVAL_METHODS.find((m) => m.label === stored.method)?.value ?? '';
    return { removed: true, method, equipment: Array.isArray(stored.equipment) ? [...stored.equipment] : [] };
  }
  return { ...EMPTY_REMOVAL, equipment: [] };
}
