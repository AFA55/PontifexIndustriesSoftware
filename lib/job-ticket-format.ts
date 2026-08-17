/**
 * lib/job-ticket-format.ts — the SHARED, pure rendering rules for everything the
 * office scoped onto a job: the measured areas/cuts/holes, the equipment that
 * was actually selected, and the jobsite conditions.
 *
 * WHY THIS FILE EXISTS (founder, Aug 16 2026, after printing job
 * TEST-2026-000103):
 *
 *  1. The printed EQUIPMENT REQ'D box listed only the three items he had TYPED
 *     into the free-text field ("Wall Saw", "Slab Saw", "dd160") and silently
 *     dropped the ~16 items he had actually TICKED per service in
 *     `equipment_selections`. His words: "I didn't even click wall saw or slab
 *     saw." A ticket that names three tools the crew doesn't need and omits the
 *     sixteen it does is worse than no equipment box at all.
 *
 *  2. `scope_details[code].areas` is a JSON *string* of L × W × thickness × qty
 *     rows. The printed ticket ignored it entirely, so a 10' × 10' × 10"
 *     ×2 scope printed as nothing.
 *
 * Both surfaces that show this data — the printed job ticket
 * (app/dashboard/admin/jobs/[id]/print) and the crew's digital ticket
 * (app/dashboard/my-jobs/[id], via components/ScopeDetailsDisplay) — now read
 * their numbers from here, because this repo has been bitten repeatedly by two
 * screens formatting the same row differently and disagreeing in front of a
 * customer.
 *
 * TWO RULES THAT DRIVE EVERY DECISION BELOW:
 *   - NEVER DROP A SELECTION. An unrecognised equipment key still prints,
 *     humanised from the key. A silently omitted tool is how a crew arrives at a
 *     jobsite without one.
 *   - NEVER INVENT A NUMBER. A blank/garbage dimension contributes nothing to a
 *     total, and a total that could not be computed is simply not printed rather
 *     than printed as 0.
 *
 * UNITS (verified against the schedule form's area inputs, Aug 16 2026 —
 * app/dashboard/admin/schedule-form/page.tsx, the L/W/Thickness/Qty grid):
 *   length  → FEET   (input suffix "ft")
 *   width   → FEET   (input suffix "ft")
 *   thickness → INCHES (input suffix "in.")
 *   qty     → a count of identical areas
 * They are labelled on output (`10' × 10' × 10" thick`) precisely because the
 * source mixes feet and inches and a bare "10 × 10 × 10" is unreadable.
 *
 * Everything here is pure — unit-tested in lib/job-ticket-format.test.ts.
 */

// ── Number / text primitives ────────────────────────────────────────────────

/**
 * A positive finite number out of whatever the form stored (it stores STRINGS),
 * or null. Blank, 'abc', '-3', NaN and Infinity all come back null so they can
 * never reach a total. Commas are tolerated because operators paste "1,200".
 *
 * STRICT ON PURPOSE — the WHOLE string must be a plain number. `parseFloat`
 * would read the chain-saw size `"20'"` as the quantity 20 and print
 * "chain saw ×20", i.e. nineteen saws nobody asked for. Values that legitimately
 * carry a unit mark go through `measurementNumber` below instead.
 */
export function positiveNumber(value: unknown): number | null {
  if (value == null || typeof value === 'boolean') return null;
  if (typeof value === 'number') return Number.isFinite(value) && value > 0 ? value : null;
  if (typeof value !== 'string') return null;
  const text = value.replace(/,/g, '').trim();
  if (!/^\d*\.?\d+$/.test(text)) return null;
  const n = parseFloat(text);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * A measurement that may carry its unit inline — `10"`, `10 ft`, `22'`. The
 * office's thickness box is a free-text field, so an operator typing the unit
 * they were asked for must not cost them the number.
 */
export function measurementNumber(value: unknown): number | null {
  if (typeof value !== 'string') return positiveNumber(value);
  const stripped = value
    .trim()
    .replace(/\s*(?:"|''|'|in\.?|inch(?:es)?|ft\.?|feet|foot|lf)$/i, '')
    .trim();
  return positiveNumber(stripped);
}

/** A count (qty / number of holes). Defaults to `fallback` when absent or junk. */
export function countOf(value: unknown, fallback = 1): number {
  const n = measurementNumber(value);
  if (n == null) return fallback;
  return Math.floor(n) || fallback;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

/**
 * Locale-independent thousands formatting. `toLocaleString` was avoided on
 * purpose: this string is asserted in unit tests and printed on a customer's
 * sheet, and the Node/browser default locale is not ours to depend on.
 */
export function formatNumber(n: number): string {
  const r = round2(n);
  const [whole, frac] = String(Math.abs(r)).split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${r < 0 ? '-' : ''}${grouped}${frac ? `.${frac}` : ''}`;
}

/**
 * `elevated_slab` → `Elevated slab`, `dingo` → `Dingo`, `no` → `No`.
 *
 * A value with WHITESPACE is prose somebody typed ("gate code 1234") and is
 * returned untouched — re-casing a human's own note on a sheet they signed is
 * not this function's business. Everything else is a storage token and gets
 * tidied.
 */
export function humanizeValue(value: unknown): string {
  const s = String(value ?? '').trim();
  if (!s) return '';
  if (/\s/.test(s)) return s;
  const spaced = s.replace(/_/g, ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

const plural = (n: number, one: string, many: string): string => (n === 1 ? one : many);

/**
 * A tri-state boolean out of whatever was stored. `true`/`false` when the office
 * actually recorded something, `null` when the key is absent or holds junk.
 *
 * The DISTINCTION MATTERS on this sheet: "recorded as no" and "never recorded"
 * are different facts, and collapsing them is exactly how the supply conditions
 * lost their explicit NO (see `formatJobsiteConditions`).
 */
export function booleanish(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value !== 0 : null;
  if (typeof value !== 'string') return null;
  const s = value.trim().toLowerCase();
  if (s === 'true' || s === 'yes' || s === 'y' || s === 'on' || s === '1') return true;
  if (s === 'false' || s === 'no' || s === 'n' || s === 'off' || s === '0') return false;
  return null;
}

// ── Cross-cut spacing + overcut (HOW to cut, not just what) ─────────────────
//
// WHY THIS EXISTS (guardian, Aug 17 2026, against production):
//
// The schedule form writes `cross_cut_lengthwise_ft` / `cross_cut_widthwise_ft`
// / `overcut_allowed` INTO the same `areas` / `cuts` row objects as the
// dimensions (app/dashboard/admin/schedule-form/page.tsx — the per-area sawing
// block). Nothing printed them. Because they sit inside the structured arrays,
// the leftover-field loop in `formatScopeSection` could not surface them either.
//
// 9 of the 48 production job orders carry cross-cut spacing, 7 of them still
// active. JOB-2026-793440 was `in_progress` on the day this was found: its row
// is `60' × 2' @ 6" deep` with a 2 ft × 2 ft cross-cut grid, and its Service
// Items total of 182 LF is only correct BECAUSE of that grid (124 ft of
// perimeter + 29 interior cuts × 2 ft). So the sheet printed a number that
// presupposed an instruction it never stated — a crew reading it saws the
// perimeter, hits 124 ft, and goes home.
//
// SPACING, NOT SIZE. `cross_cut_lengthwise_ft: 2` means "cut every 2 ft along
// the length" (the form's own placeholder text), so the wording is "every".
//
// OVERCUT: `false` doubles the perimeter in the office's LF math — it is
// billing-relevant, so it prints. `true` is the default and stays silent; a
// note on every single row is a note nobody reads.

export interface CrossCutSpec {
  /** Spacing in FEET between cuts running along the length, or null. */
  lengthwise: number | null;
  /** Spacing in FEET between cuts running along the width, or null. */
  widthwise: number | null;
  /** false → the office forbade overcutting. null → not recorded (or the default). */
  overcutAllowed: boolean | null;
}

/** Reads the cross-cut / overcut fields off ONE stored area or cut row. */
export function parseCrossCut(row: unknown): CrossCutSpec {
  const r = row && typeof row === 'object' && !Array.isArray(row) ? (row as Record<string, unknown>) : {};
  return {
    // `measurementNumber` refuses '' and '0', which is what makes a stored zero
    // print nothing instead of "cross-cut every 0' × 0'".
    lengthwise: measurementNumber(r.cross_cut_lengthwise_ft),
    widthwise: measurementNumber(r.cross_cut_widthwise_ft),
    overcutAllowed: booleanish(r.overcut_allowed),
  };
}

/**
 * The parenthetical that follows a row's dimensions:
 *
 *   (cross-cut every 2' × 2')
 *   (cross-cut every 100' lengthwise)          ← only one side was entered
 *   (cross-cut every 10' widthwise)
 *   (cross-cut every 5' × 5', no overcut)
 *   (no overcut)                               ← overcut recorded, no spacing
 *   ''                                          ← nothing recorded
 *
 * PARENTHESISED rather than comma-appended on purpose: `formatScopeAreas` joins
 * its ROWS with ', ', so a comma-led clause on a four-row job (JOB-2026-400368)
 * would be indistinguishable from the start of the next area. Same bracket
 * convention the hole rows already use for their location.
 */
export function crossCutText(spec: CrossCutSpec): string {
  const bits: string[] = [];
  const { lengthwise, widthwise } = spec;
  if (lengthwise != null && widthwise != null) {
    // Lengthwise first, matching the L × W order of the dimensions it follows.
    bits.push(`cross-cut every ${formatNumber(lengthwise)}' × ${formatNumber(widthwise)}'`);
  } else if (lengthwise != null) {
    bits.push(`cross-cut every ${formatNumber(lengthwise)}' lengthwise`);
  } else if (widthwise != null) {
    bits.push(`cross-cut every ${formatNumber(widthwise)}' widthwise`);
  }
  if (spec.overcutAllowed === false) bits.push('no overcut');
  return bits.length > 0 ? ` (${bits.join(', ')})` : '';
}

// ── Where the work happens (wall / floor / type) ────────────────────────────

/**
 * The stored tokens for "where does this go", verified against the schedule
 * form's ECD hole buttons (app/dashboard/admin/schedule-form/page.tsx — the
 * three-button row under every hole group writes exactly `elevated_slab`,
 * `slab_on_grade`, `on_wall`, or `''` when deselected) and against the legacy
 * SERVICE-level `scope_details[code].work_location`, which production rows
 * JOB-2026-402357 and JOB-2026-880425 still carry with the SAME tokens.
 *
 * `slab_on_grade` prints its acronym because that is what the crew says and
 * what the founder asked for: "elevated slab, Slab on Grade (SOG) or on wall".
 */
const SCOPE_LOCATION_LABELS: Record<string, string> = {
  on_wall: 'On wall',
  wall: 'On wall',
  elevated_slab: 'Elevated slab',
  slab_on_grade: 'Slab on grade (SOG)',
  sog: 'Slab on grade (SOG)',
  on_grade: 'Slab on grade (SOG)',
  floor: 'On floor',
  on_floor: 'On floor',
  ceiling: 'On ceiling',
  on_ceiling: 'On ceiling',
};

/**
 * `on_wall` → `On wall`. An UNKNOWN token is humanised and printed anyway
 * rather than dropped — the office ticked something, and a blank "wall/floor"
 * cell is how a crew turns up without a lift. Empty in → empty out, so callers
 * can fall back to the next source.
 */
export function scopeLocationLabel(value: unknown): string {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  return SCOPE_LOCATION_LABELS[raw.toLowerCase()] ?? humanizeValue(raw);
}

/**
 * The same label mid-sentence — `… @ 8" deep (on wall)`. Only the leading
 * character is lowered, so `Slab on grade (SOG)` keeps its acronym.
 */
export function scopeLocationLabelInline(value: unknown): string {
  const label = scopeLocationLabel(value);
  return label ? label.charAt(0).toLowerCase() + label.slice(1) : '';
}

/** Tolerates the two shapes the form has used: a JSON string, or a real array. */
export function parseJsonRows(raw: unknown): Record<string, unknown>[] {
  if (Array.isArray(raw)) return raw.filter((r) => r && typeof r === 'object') as Record<string, unknown>[];
  if (typeof raw !== 'string') return [];
  const text = raw.trim();
  if (!text) return [];
  try {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? (parsed.filter((r) => r && typeof r === 'object') as Record<string, unknown>[]) : [];
  } catch {
    return [];
  }
}

// ── Areas (L × W × thickness × qty) ─────────────────────────────────────────

export interface ScopeAreaRow {
  /** feet */
  length: number | null;
  /** feet */
  width: number | null;
  /** inches */
  thickness: number | null;
  /** how many identical areas of these dimensions */
  qty: number;
  /** length × width × qty, or null when length or width is missing. */
  squareFeet: number | null;
  /** HOW to cut it — the grid spacing + the overcut constraint. */
  crossCut: CrossCutSpec;
}

export interface ScopeAreaSummary {
  rows: ScopeAreaRow[];
  /** Sum of every row's qty — "2 areas". */
  areaCount: number;
  /** Sum of every row's square feet. 0 when nothing was computable. */
  totalSquareFeet: number;
  /** `2 areas — 10' × 10' × 10" thick = 200 sq ft total` */
  text: string;
}

/** Parses the stored area rows, dropping rows that carry no usable dimension. */
export function parseAreaRows(raw: unknown): ScopeAreaRow[] {
  const out: ScopeAreaRow[] = [];
  for (const row of parseJsonRows(raw)) {
    const length = measurementNumber(row.length);
    const width = measurementNumber(row.width);
    // `thickness` on the office form, `depth` on some older/quick-entry rows.
    const thickness = measurementNumber(row.thickness) ?? measurementNumber(row.depth);
    if (length == null && width == null && thickness == null) continue;
    const qty = countOf(row.qty ?? row.quantity, 1);
    out.push({
      length,
      width,
      thickness,
      qty,
      squareFeet: length != null && width != null ? round2(length * width * qty) : null,
      crossCut: parseCrossCut(row),
    });
  }
  return out;
}

/** One row's dimensions as printed text. `showQty` prefixes `2 × `. */
function areaRowText(row: ScopeAreaRow, showQty: boolean): string {
  const dims: string[] = [];
  if (row.length != null && row.width != null) {
    dims.push(`${formatNumber(row.length)}' × ${formatNumber(row.width)}'`);
  } else if (row.length != null) {
    // Only one side was entered. Say WHICH one — an unlabelled lone number on a
    // signed sheet is the kind of thing that gets cut wrong.
    dims.push(`${formatNumber(row.length)}' long`);
  } else if (row.width != null) {
    dims.push(`${formatNumber(row.width)}' wide`);
  }
  if (row.thickness != null) dims.push(`${formatNumber(row.thickness)}" thick`);
  const body = dims.join(' × ');
  // HOW to cut it. Appended AFTER the qty prefix so "2 × 8' × 2' × 12" thick
  // (cross-cut every 4' × 2')" reads as two identical areas, each cross-cut —
  // which is what it means.
  const withCuts = `${body}${crossCutText(row.crossCut)}`;
  return showQty && row.qty > 1 ? `${row.qty} × ${withCuts}` : withCuts;
}

/**
 * The founder's approved shape: dimensions PLUS the computed total.
 *   `2 areas — 10' × 10' × 10" thick = 200 sq ft total`
 *
 * The per-row `2 × ` prefix is suppressed when there is exactly ONE row, because
 * the leading "2 areas" already says it and "2 areas — 2 × 10' × 10'" reads as
 * four. With several rows the prefix is required — otherwise there is no way to
 * tell which row the count belongs to.
 *
 * Returns null when nothing usable was stored, so callers render nothing rather
 * than an empty heading.
 */
export function formatScopeAreas(raw: unknown): ScopeAreaSummary | null {
  const rows = parseAreaRows(raw);
  if (rows.length === 0) return null;

  const areaCount = rows.reduce((sum, r) => sum + r.qty, 0);
  const totalSquareFeet = round2(rows.reduce((sum, r) => sum + (r.squareFeet ?? 0), 0));

  const showQty = rows.length > 1;
  const parts = rows.map((r) => areaRowText(r, showQty)).filter(Boolean);

  let text = `${areaCount} ${plural(areaCount, 'area', 'areas')}`;
  if (parts.length > 0) text += ` — ${parts.join(', ')}`;
  // A total is printed only when it was actually computable from L × W.
  if (totalSquareFeet > 0) text += ` = ${formatNumber(totalSquareFeet)} sq ft total`;

  return { rows, areaCount, totalSquareFeet, text };
}

// ── Cuts (linear feet) ──────────────────────────────────────────────────────

export interface ScopeCutSummary {
  cutCount: number;
  totalLinearFeet: number;
  text: string;
}

/**
 * `2 cuts — 10 LF @ 10" deep, 25 LF @ 6" deep = 35 LF total`
 * A cut row may instead carry L × W (the office's area-shaped cut); those
 * dimensions are printed rather than silently dropped.
 */
export function formatScopeCuts(raw: unknown): ScopeCutSummary | null {
  const rows = parseJsonRows(raw);
  const parts: string[] = [];
  let totalLinearFeet = 0;
  let cutCount = 0;

  for (const row of rows) {
    const lf = measurementNumber(row.linear_feet);
    const depth = measurementNumber(row.depth);
    const length = measurementNumber(row.length);
    const width = measurementNumber(row.width);
    const num = measurementNumber(row.num_cuts);
    if (lf == null && depth == null && length == null && width == null) continue;

    // ONE ROW OF LINEAR FEET IS ONE CUT (founder, Aug 17 2026: "for linear ft,
    // if they only added 1 area then make number of cuts 1 because it's just
    // inputting linear ft"). The schedule form no longer asks for a count on a
    // single row — it stamps `num_cuts: '1'` — but rows saved before that stamp
    // carry no count at all, and this fallback is what stops them printing as
    // "0 cuts". A stored count still wins; nothing is overridden.
    cutCount += num != null ? Math.floor(num) : 1;
    if (lf != null) totalLinearFeet += lf;

    const bits: string[] = [];
    if (lf != null) bits.push(`${formatNumber(lf)} LF`);
    if (length != null && width != null) bits.push(`${formatNumber(length)}' × ${formatNumber(width)}'`);
    else if (length != null) bits.push(`${formatNumber(length)}' long`);
    else if (width != null) bits.push(`${formatNumber(width)}' wide`);
    if (depth != null) bits.push(`@ ${formatNumber(depth)}" deep`);
    // The office's cross-cut grid lives on cut rows too (JOB-2026-793440 is
    // `60' × 2' @ 6" deep` with a 2 ft × 2 ft grid, and its 182 LF target is
    // only reachable WITH the interior cuts).
    if (bits.length > 0) parts.push(`${bits.join(' ')}${crossCutText(parseCrossCut(row))}`);
  }

  if (parts.length === 0) return null;
  let text = `${cutCount} ${plural(cutCount, 'cut', 'cuts')}`;
  text += ` — ${parts.join(', ')}`;
  if (totalLinearFeet > 0) text += ` = ${formatNumber(round2(totalLinearFeet))} LF total`;
  return { cutCount, totalLinearFeet: round2(totalLinearFeet), text };
}

// ── Holes (core drilling) ───────────────────────────────────────────────────

export interface ScopeHoleSummary {
  holeCount: number;
  text: string;
}

/** `12 holes — 10 × 4" bit @ 8" deep, 2 × 10" bit @ 4" deep` */
export function formatScopeHoles(raw: unknown): ScopeHoleSummary | null {
  const rows = parseJsonRows(raw);
  const parts: string[] = [];
  let holeCount = 0;

  for (const row of rows) {
    const bit = measurementNumber(row.bit_size);
    const depth = measurementNumber(row.depth);
    const qtyRaw = measurementNumber(row.qty);
    if (bit == null && depth == null && qtyRaw == null) continue;
    const qty = qtyRaw != null ? Math.floor(qtyRaw) : 1;
    holeCount += qty;

    const bits: string[] = [`${qty} ×`];
    if (bit != null) bits.push(`${formatNumber(bit)}" bit`);
    if (depth != null) bits.push(`@ ${formatNumber(depth)}" deep`);
    const location = scopeLocationLabelInline(row.location);
    let line = bits.join(' ');
    if (location) line += ` (${location})`;
    parts.push(line);
  }

  if (parts.length === 0) return null;
  return { holeCount, text: `${holeCount} ${plural(holeCount, 'hole', 'holes')} — ${parts.join(', ')}` };
}

// ── A whole scope_details entry → printable lines ───────────────────────────

/** Service code → label. Mirrors lib/equipment-needs SERVICE_TYPE_LABELS. */
export const SCOPE_SERVICE_LABELS: Record<string, string> = {
  ECD: 'Electric Core Drilling',
  HFCD: 'High Frequency Core Drilling',
  HCD: 'Hydraulic Core Drilling',
  DFS: 'Diesel Floor Sawing',
  EFS: 'Electric Floor Sawing',
  'WS/TS': 'Wall/Track Sawing',
  WS: 'Wall Sawing',
  TS: 'Track Sawing',
  CS: 'Chain Sawing',
  'HHS/PS': 'Handheld / Push Sawing',
  HHS: 'Handheld Sawing',
  PS: 'Push Sawing',
  WireSaw: 'Wire Sawing',
  GPR: 'GPR Scanning',
  Demo: 'Selective Demo',
  'Demo/Brokk': 'Selective Demo / Brokk',
  Brokk: 'Brokk',
  Other: 'Other',
};

export function scopeServiceLabel(code: string): string {
  const trimmed = (code || '').trim();
  return SCOPE_SERVICE_LABELS[trimmed] ?? trimmed;
}

/** Labels for the plain (non-JSON) scope fields the form also stores. */
const SCOPE_FIELD_LABELS: Record<string, string> = {
  num_holes: 'Holes',
  diameter: 'Diameter',
  depth: 'Depth',
  linear_feet: 'Linear feet',
  num_cuts: 'Cuts',
  area_sqft: 'Area',
  num_scans: 'Scans',
  // GPR is time-and-materials, not measured work (founder, Aug 17 2026). The two
  // keys above are what the GPR scope USED to collect and are kept here on
  // purpose: a job saved before the change still prints its scans / square feet
  // rather than falling through to the raw key.
  hours_on_site: 'Hours on site',
  volume_cuyd: 'Volume',
  length: 'Length',
  width: 'Width',
  thickness: 'Thickness',
  num_areas: 'Areas',
  description: 'Note',
  work_location: 'Work location',
  lift_or_ladder_onsite: 'Lift/ladder on site',
  // The follow-up to a "no" on the above: if the customer isn't supplying
  // access, we are, and the crew has to know what to load before they leave.
  we_supply_access: 'We supply',
  ladder_height_ft: 'Ladder height',
};

const SCOPE_FIELD_SUFFIXES: Record<string, string> = {
  depth: 'in.',
  diameter: 'in.',
  thickness: 'in.',
  length: 'ft',
  width: 'ft',
  linear_feet: 'LF',
  area_sqft: 'sq ft',
  volume_cuyd: 'cu yd',
  ladder_height_ft: 'ft',
  // Matches SCOPE_UNIT_LABELS.hours below, so the GPR line on the ticket and the
  // GPR row in SERVICE ITEMS say the same word.
  hours_on_site: 'hrs',
};

const STRUCTURED_SCOPE_KEYS = new Set(['areas', 'cuts', 'holes']);

/** Fields whose stored value is a location token, not free text. */
const SCOPE_LOCATION_FIELDS = new Set(['work_location', 'location', 'wall_floor_type']);

/**
 * Where ONE measured row goes, for the printed WALL/FLOOR & TYPE column.
 *
 * Priority is newest-storage-first: the ROW's own `location` (what the schedule
 * form writes today — one pick per hole group), then the legacy SERVICE-level
 * `work_location` (still on prod rows JOB-2026-402357 / JOB-2026-880425), then
 * the older free-text `material` / `wall_floor_type`. Returns '' when the office
 * recorded nothing, so the caller decides what a blank cell looks like.
 *
 * The printed ticket read ONLY `material`/`wall_floor_type` — neither of which
 * any production row has — so this column was "—" on every job ever printed,
 * including ones where the office had picked a location per hole.
 */
export function rowLocationLabel(row: unknown, entry: unknown): string {
  const asRecord = (v: unknown): Record<string, unknown> =>
    v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  const r = asRecord(row);
  const e = asRecord(entry);
  return (
    scopeLocationLabel(r.location) ||
    scopeLocationLabel(e.work_location) ||
    scopeLocationLabel(e.material) ||
    scopeLocationLabel(e.wall_floor_type)
  );
}

export interface ScopeSection {
  /** The raw service code as stored — 'ECD', 'HHS/PS', … */
  code: string;
  /** 'Electric Core Drilling' */
  label: string;
  /** One printable line per measurement group / field. Never empty. */
  lines: string[];
}

/**
 * Everything measured for ONE service code, as printable lines.
 * Structured groups first (areas / cuts / holes — the numbers that get billed),
 * then any remaining non-empty field so nothing entered is lost.
 */
export function formatScopeSection(code: string, fields: unknown): ScopeSection | null {
  if (!fields || typeof fields !== 'object' || Array.isArray(fields)) return null;
  const f = fields as Record<string, unknown>;
  const lines: string[] = [];

  const holes = formatScopeHoles(f.holes);
  if (holes) lines.push(holes.text);
  const cuts = formatScopeCuts(f.cuts);
  if (cuts) lines.push(cuts.text);
  const areas = formatScopeAreas(f.areas);
  if (areas) lines.push(areas.text);

  for (const [key, value] of Object.entries(f)) {
    if (STRUCTURED_SCOPE_KEYS.has(key)) continue;
    if (value == null || value === false) continue;
    // A location token gets the location vocabulary ("Slab on grade (SOG)"),
    // not the generic humaniser ("Slab on grade") — same words on paper and phone.
    const format = SCOPE_LOCATION_FIELDS.has(key) ? scopeLocationLabel : humanizeValue;
    const text = Array.isArray(value)
      ? value.map((v) => format(v)).filter(Boolean).join(', ')
      : format(value);
    if (!text || text === '0') continue;
    const label = SCOPE_FIELD_LABELS[key] ?? humanizeValue(key);
    const suffix = SCOPE_FIELD_SUFFIXES[key];
    lines.push(`${label}: ${text}${suffix ? ` ${suffix}` : ''}`);
  }

  if (lines.length === 0) return null;
  return { code, label: scopeServiceLabel(code), lines };
}

const REMOVAL_METHOD_LABELS: Record<string, string> = {
  dumpster_on_site: 'Dumpster on site',
  our_dump_truck: 'Our dump truck',
  hand: 'Hand removal',
};

/**
 * Every service on the job, plus the synthetic `_removal` entry the schedule
 * form writes alongside them (it is not a service, so it gets its own section
 * rather than a bogus service heading).
 */
export function formatScopeDetails(
  scopeDetails: Record<string, unknown> | null | undefined
): ScopeSection[] {
  if (!scopeDetails || typeof scopeDetails !== 'object') return [];
  const out: ScopeSection[] = [];

  for (const [code, fields] of Object.entries(scopeDetails)) {
    if (code === '_removal') continue;
    // Other `_`-prefixed keys are synthetic too; render them but never as a
    // service label (resolveScopeCodes in lib/work-types.ts skips them as well).
    const section = formatScopeSection(code, fields);
    if (section) out.push(section);
  }

  const removal = scopeDetails._removal;
  if (removal && typeof removal === 'object') {
    const r = removal as Record<string, unknown>;
    const needed = r.needed === true || String(r.needed ?? '').toLowerCase() === 'true';
    if (needed) {
      const bits: string[] = [];
      const method = String(r.method ?? '').trim();
      if (method) bits.push(REMOVAL_METHOD_LABELS[method] ?? humanizeValue(method));
      const what = String(r.what ?? '').trim();
      if (what) bits.push(what);
      if (r.dumpster_size) bits.push(`${humanizeValue(r.dumpster_size)} dumpster`);
      if (r.responsible_party) bits.push(`by ${humanizeValue(r.responsible_party)}`);
      const equipment = Array.isArray(r.equipment)
        ? r.equipment.map((e) => humanizeValue(e)).filter(Boolean)
        : [];
      if (equipment.length > 0) bits.push(equipment.join(', '));
      out.push({
        code: '_removal',
        label: 'Material Removal',
        lines: [bits.length > 0 ? bits.join(' — ') : 'Required'],
      });
    }
  }

  return out;
}

// ── Service items (job_scope_items) ─────────────────────────────────────────
//
// WHY THIS SECTION EXISTS (founder, Aug 17 2026, holding a printout):
//
//   Wall/Track Sawing        Wall/Track Sawing — linear ft        48 linear_ft
//   Handheld / Push Sawing   Handheld / Push Sawing — %          100 percent
//
// Three faults in two lines. The unit printed as the RAW DATABASE KEY
// (`linear_ft`, `percent`). The Type and Description columns said the same words
// twice. And a separate "Target Qty" column implied a count that does not exist
// for linear feet — his words: "no quantities needed because it's total linear
// ft, unless they add an area of a different size." A count only means something
// when there are several distinct areas, and that case is already handled by
// `formatScopeAreas` above ("2 areas — 10' × 10' × 10" thick = 200 sq ft total").
//
// So a service item now prints as ONE resolved measure — `48 LF`, `12 holes`,
// `100%` — and the description prints only when a human actually wrote one.

interface UnitLabel {
  one: string;
  many: string;
  /** true → glued to the number with no space (`100%`). */
  suffix?: boolean;
}

/**
 * The unit vocabulary, VERIFIED against production (Supabase klatddoyncxidgqtcjnu,
 * Aug 17 2026) rather than guessed:
 *
 *   job_scope_items.unit  →  linear_ft (18 rows), percent (14), holes (7)
 *   takeoff_conditions.unit → LF (7), EA (1), SF (1)   ← already abbreviated
 *
 * and against every unit the code can WRITE, which is a wider set than the rows
 * that happen to exist today:
 *
 *   app/api/admin/schedule-form/route.ts  ALLOWED_UNITS
 *     linear_ft · holes · percent · sq_ft · items · each · hours
 *   lib/job-progress.ts  ScopeUnit          — the same seven
 *   components/JobScopePanel.tsx UNIT_OPTIONS — six of the seven, admin-editable
 *   lib/work-types.ts  UNIT_CHOICES / defaultUnitFor — the operator's spelling,
 *     which uses SPACES: 'linear ft', 'sq ft', 'each', 'holes', 'loads', 'hours'
 *
 * Both spellings of the same unit therefore have to resolve to the same printed
 * word, which is what `normalizeUnitKey` + `UNIT_ALIASES` are for. `loads` and
 * `cu_yd` are here because `defaultUnitFor` and the takeoff/estimating side can
 * produce them even though no scope row carries one yet.
 */
const SCOPE_UNIT_LABELS: Record<string, UnitLabel> = {
  linear_ft: { one: 'LF', many: 'LF' },
  sq_ft: { one: 'sq ft', many: 'sq ft' },
  cu_yd: { one: 'cu yd', many: 'cu yd' },
  holes: { one: 'hole', many: 'holes' },
  each: { one: 'ea', many: 'ea' },
  items: { one: 'item', many: 'items' },
  loads: { one: 'load', many: 'loads' },
  hours: { one: 'hr', many: 'hrs' },
  // A percentage is not a quantity of anything — it is "how much of this scope".
  // Printed glued to the number so it can never be mistaken for a unit of work.
  percent: { one: '%', many: '%', suffix: true },
};

/** Every spelling seen in the DB or written by the app, mapped to one key. */
const UNIT_ALIASES: Record<string, string> = {
  lf: 'linear_ft',
  linear_feet: 'linear_ft',
  linearft: 'linear_ft',
  linear_foot: 'linear_ft',
  ft: 'linear_ft',
  feet: 'linear_ft',
  sf: 'sq_ft',
  sqft: 'sq_ft',
  sq_feet: 'sq_ft',
  square_feet: 'sq_ft',
  square_ft: 'sq_ft',
  cy: 'cu_yd',
  cu_yds: 'cu_yd',
  cubic_yard: 'cu_yd',
  cubic_yards: 'cu_yd',
  hole: 'holes',
  ea: 'each',
  item: 'items',
  load: 'loads',
  hr: 'hours',
  hrs: 'hours',
  hour: 'hours',
  pct: 'percent',
  '%': 'percent',
  percentage: 'percent',
};

/** `'Linear Ft'`, `'linear ft'`, `'LINEAR-FT'`, `'linear_ft.'` → `'linear_ft'`. */
function normalizeUnitKey(unit: unknown): string {
  return String(unit ?? '')
    .trim()
    .toLowerCase()
    .replace(/\.$/, '')
    .replace(/[\s-]+/g, '_');
}

/**
 * A quantity that may legitimately be zero — `positiveNumber` refuses 0, and a
 * scope row with a 0 target is real data the ticket must still show.
 */
function quantityNumber(value: unknown): number | null {
  if (value == null || typeof value === 'boolean') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  const text = value.replace(/,/g, '').trim();
  if (!/^-?\d*\.?\d+$/.test(text)) return null;
  const n = parseFloat(text);
  return Number.isFinite(n) ? n : null;
}

/**
 * ONE service item's measure as printed text.
 *
 *   (48, 'linear_ft') → '48 LF'
 *   (1,  'holes')     → '1 hole'
 *   (100,'percent')   → '100%'
 *   (3,  'cubic_yds') → '3 cu yd'
 *   (2,  'pallets')   → '2 pallets'    ← unknown unit, humanised, NEVER dropped
 *   (null,'holes')    → 'holes'        ← the unit alone beats printing nothing
 *
 * An UNKNOWN unit prints its own key with the underscores taken out, for the
 * same reason an unknown equipment id still prints: the office recorded
 * something, and a blank measure on a sheet the crew works from is worse than an
 * unfamiliar word. Returns '' only when there is genuinely nothing to say.
 */
export function formatScopeQuantity(quantity: unknown, unit: unknown): string {
  const n = quantityNumber(quantity);
  const key = normalizeUnitKey(unit);
  const resolved = key ? UNIT_ALIASES[key] ?? key : '';
  const label = SCOPE_UNIT_LABELS[resolved];

  if (n == null) {
    if (!resolved) return '';
    // No number: name the unit rather than print a bare dash. `many` for every
    // unit — with no quantity there is nothing to agree with, and `one` vs
    // `many` differs for exactly two entries ('hole'/'holes', 'hr'/'hrs').
    // (This was `label.suffix ? label.many : label.many` — both branches
    // identical. The only suffix unit is `percent`, whose `one` and `many` are
    // BOTH '%', so no behaviour the ternary could have intended is recoverable
    // from it; it is simplified rather than guessed at.)
    return label ? label.many : resolved.replace(/_/g, ' ');
  }

  const num = formatNumber(n);
  if (!label) {
    // Unknown unit — humanised and appended. `formatNumber` has already made the
    // number readable; the key is all we know about the unit.
    const word = resolved.replace(/_/g, ' ').trim();
    return word ? `${num} ${word}` : num;
  }
  if (label.suffix) return `${num}${label.many}`;
  return `${num} ${n === 1 ? label.one : label.many}`;
}

/**
 * The unit words the schedule form appends when it AUTO-GENERATES a scope item's
 * description (app/dashboard/admin/schedule-form/page.tsx):
 *
 *   `${label} — linear ft` · `${label} — holes` · `${label} — % complete`
 *
 * Those three strings are 33 of the 39 descriptions in production, and every one
 * of them just repeats the work type followed by the unit — which is precisely
 * the doubled column the founder was looking at. They are stripped. Anything
 * else a human typed ("12 conduit penetrations, 4in bit, 8in SOG", "Equipment
 * trench 60ft x 3ft x 8in" — both real production rows) is left ALONE, in full.
 */
const GENERATED_DESCRIPTION_TAILS = new Set([
  '',
  'linear ft',
  'linear feet',
  'lf',
  'holes',
  'hole',
  'sq ft',
  'square feet',
  'each',
  'ea',
  'items',
  'hours',
  'hrs',
  'loads',
  'percent',
  '% complete',
  '%',
  'complete',
]);

/**
 * The description worth printing beside a service, or '' when the stored one is
 * only an echo of the work type.
 *
 * Deliberately conservative: the description is dropped ONLY when it is the work
 * type followed by nothing but a unit word. A description that merely STARTS
 * with the work type and then says something real is printed whole — mangling a
 * human's own note on a sheet a customer signs is not worth the tidier column.
 */
export function scopeItemDetail(workType: unknown, description: unknown): string {
  const detail = String(description ?? '').trim();
  if (!detail) return '';
  const type = String(workType ?? '').trim();
  if (!type) return detail;
  if (detail.toLowerCase() === type.toLowerCase()) return '';
  if (!detail.toLowerCase().startsWith(type.toLowerCase())) return detail;

  // What follows the work type, minus the em/en dash or hyphen separator.
  const tail = detail
    .slice(type.length)
    .replace(/^\s*[—–-]\s*/, '')
    .trim()
    .toLowerCase();
  return GENERATED_DESCRIPTION_TAILS.has(tail) ? '' : detail;
}

export interface ScopeItemInput {
  id?: string | null;
  work_type?: string | null;
  description?: string | null;
  unit?: string | null;
  target_quantity?: number | string | null;
}

export interface ScopeItemLine {
  /** Stable react key — the row id when there is one, else its index. */
  key: string;
  /** 'Wall/Track Sawing' */
  service: string;
  /** The human's own note, or '' when the stored description was an echo. */
  detail: string;
  /** '48 LF' · '12 holes' · '100%' · '' when nothing measurable was stored. */
  quantity: string;
}

/**
 * The SERVICE ITEMS block, identical on the printed HTML sheet and the react-pdf
 * ticket. Rows with no service name AND nothing to measure are dropped — they
 * would print as an empty ruled line and nothing else.
 */
export function formatScopeItems(items: ScopeItemInput[] | null | undefined): ScopeItemLine[] {
  if (!Array.isArray(items)) return [];
  const out: ScopeItemLine[] = [];
  items.forEach((item, index) => {
    if (!item || typeof item !== 'object') return;
    const service = String(item.work_type ?? '').trim();
    const quantity = formatScopeQuantity(item.target_quantity, item.unit);
    const detail = scopeItemDetail(service, item.description);
    if (!service && !quantity && !detail) return;
    out.push({ key: String(item.id ?? index), service, detail, quantity });
  });
  return out;
}

/**
 * Whether the DETAIL column earns its place on this job.
 *
 * On the 33 auto-generated rows in production every detail is stripped, so the
 * column would print as a full height of em-dashes next to the numbers that
 * actually matter. Both tickets ask this before drawing the column, so neither
 * can decide differently for the same job.
 */
export function scopeItemsHaveDetail(rows: ScopeItemLine[]): boolean {
  return rows.some((r) => !!r.detail);
}

// ── Equipment ───────────────────────────────────────────────────────────────

/**
 * Canonical human labels for `equipment_selections` item ids.
 *
 * Sourced from the schedule form's SERVICE_EQUIPMENT catalog (the screen the
 * office actually ticks) plus the legacy ids still present in production rows
 * (core_rig, slab_saw, track_saw, vac_base, water_supply, blades…). Anything
 * NOT in here still prints, humanised from the key — see `equipmentItemLabel`.
 */
export const EQUIPMENT_ITEM_LABELS: Record<string, string> = {
  // Machines & power
  ecd_machine: 'ECD machine',
  hfcd_machine: 'HFCD machine',
  hcd_stand: 'HCD stand',
  dpp: 'diesel power pack',
  gas_power_pack: 'gas power pack',
  generator: 'generator',
  core_rig: 'core rig',
  slab_saw: 'slab saw',
  track_saw: 'track saw',
  push_saw: 'push saw',
  backup_saw: 'backup saw',
  backup_track_saw: 'backup track saw',
  // DFS, electric-slab-saw branch only. Value is '15 HP' / '40 HP', which
  // positiveNumber() correctly refuses to read as a count, so this prints as
  // "slab saw motor (40 HP)" rather than "slab saw motor ×40".
  electric_saw_hp: 'slab saw motor',
  handsaw_20: '20" handsaw',
  handsaw_24: '24" handsaw',
  chain_saw: 'chain saw',
  '15_bar_chain': '15" bar & chain',
  '20_bar_chain': '20" bar & chain',
  // Containment / slurry
  pump_can: 'pump can',
  slurry_ring: 'slurry ring',
  slurry_drums: 'slurry drums',
  slurry_drums_pbg: 'slurry drums',
  extra_vacuum_head: 'extra vacuum head',
  vac_base: 'vac base',
  water_control: 'water control',
  water_supply: 'water supply',
  // Hoses & cords
  hydraulic_hose: 'hydraulic hose',
  '480_cord': '480 cord',
  extension_cord: 'extension cord',
  gfci: 'GFCI',
  // Guards / tracks / boots
  '32_guard': '32" guard',
  '42_guard': '42" guard',
  '63_backup': '63 backup system',
  blade_guard: 'blade guard',
  track_pent: 'track (Pentruder)',
  boots_pent: 'boots (Pentruder)',
  track_pbg: 'track (PBG)',
  guards_pbg: 'guards (PBG)',
  boots_pbg: 'boots (PBG)',
  // Consumables / supplies
  plastic: 'plastic',
  tape: 'tape',
  duct_tape: 'duct tape',
  chalk_line: 'chalk line',
  clear_spray: 'clear spray',
  spray_paint: 'spray paint',
  apron: 'apron',
  blades: 'blades',
  blade_size: 'blade size',
  bit_size: 'bit size',
  // Brokk kit
  brokk_480_cable: '480 cable',
  brokk_pigtail: 'pigtail / adapter',
  brokk_waterbomb: 'waterbomb',
  brokk_hepa_fans: 'HEPA fans',
  brokk_generator: 'generator',
  brokk_mist_water: 'mist water attachment',
};

/** Item ids whose numeric value is a LENGTH in feet, not a count. */
const EQUIPMENT_FOOTAGE_ITEMS = new Set(['hydraulic_hose', '480_cord', 'track_pent', 'track_pbg']);

const TOGGLE_ON = new Set(['yes', 'true', 'on', 'y']);
const TOGGLE_OFF = new Set(['no', 'false', 'off', '0', 'n', '']);

/**
 * `core_bit_10` → `10" core bit`; a known id → its catalog label; anything else
 * → the key with underscores turned into spaces. The fallback is deliberately
 * dumb (no clever "trailing number means inches" rule — that would turn
 * `cord_480` into a 480-inch cord) but it ALWAYS produces something, because a
 * dropped tool is the failure this whole file exists to prevent.
 */
export function equipmentItemLabel(itemId: string): string {
  const id = String(itemId || '').trim();
  if (!id) return '';
  if (id.startsWith('core_bit_')) {
    const size = id.slice('core_bit_'.length);
    const n = positiveNumber(size);
    return n != null ? `${formatNumber(n)}" core bit` : `${size.replace(/_/g, ' ')} core bit`;
  }
  return EQUIPMENT_ITEM_LABELS[id] ?? id.replace(/_/g, ' ').trim();
}

export interface EquipmentGroup {
  /** 'ECD' | 'HHS/PS' | 'CUSTOM' | 'RENTAL' */
  key: string;
  /** Printed heading — the service code, plus its sub-option when one was picked. */
  label: string;
  /** Full service name for the codes ('Electric Core Drilling'); '' otherwise. */
  sublabel: string;
  items: string[];
}

/**
 * `_sub` is the ONE machine a service goes out with — it belongs in the
 * heading, not the list. WS/TS picks the system; DFS picks the floor saw
 * (founder, Aug 2026), which is why the shop needs to read "DFS (Husqvarna
 * 7000)" and not just "DFS".
 */
export const SUB_OPTION_LABELS: Record<string, string> = {
  // WS/TS system
  pentruder: 'Pentruder',
  pbg: 'Track Saw (PBG)',
  // DFS saw
  tier4: 'Tier 4 Saw',
  white_saw: 'White Saw',
  husqvarna_5000: 'Husqvarna 5000',
  husqvarna_7000: 'Husqvarna 7000',
  electric_slab: 'Electric Slab Saw',
};

/** One `[itemId, value]` pick → its printed text, or null when it is switched off. */
export function equipmentSelectionText(itemId: string, rawValue: unknown): string | null {
  const label = equipmentItemLabel(itemId);
  if (!label) return null;
  if (rawValue === true) return label;
  if (rawValue === false || rawValue == null) return null;

  const value = String(rawValue).trim();
  const lower = value.toLowerCase();
  if (TOGGLE_OFF.has(lower)) return null;
  if (TOGGLE_ON.has(lower)) return label;

  const qty = positiveNumber(value);
  if (qty != null) {
    if (EQUIPMENT_FOOTAGE_ITEMS.has(itemId)) return `${label} — ${formatNumber(qty)} ft`;
    // Quantity 1 is the norm (one 4" core bit); printing "×1" is noise. Any
    // other count matters — the crew has to load that many.
    return qty === 1 ? label : `${label} ×${formatNumber(qty)}`;
  }

  // An option pick ("20'" for chain_saw) or free text — show it verbatim.
  return `${label} (${value})`;
}

export interface JobEquipmentInput {
  /** Per-service structured picks — the ones the printed ticket used to drop. */
  equipment_selections?: Record<string, Record<string, unknown>> | null;
  /** Free-text items the office typed. */
  equipment_needed?: string[] | null;
  /** Rented gear (already carries a "(PICKUP REQUIRED)" suffix when relevant). */
  equipment_rentals?: string[] | null;
  /** `{ 'Wall Saw': true }` — marks an `equipment_needed` item as a rental. */
  equipment_rental_flags?: Record<string, unknown> | null;
}

/**
 * Sorts a service's picks: catalog items in the order the office stored them,
 * then core bits ascending by size. Bits are the long tail of a coring job and
 * reading "3", 4", 5", 10"" in order is how the shop pulls them.
 */
function sortServiceItems(entries: [string, unknown][]): [string, unknown][] {
  const bitSize = (id: string): number | null =>
    id.startsWith('core_bit_') ? positiveNumber(id.slice('core_bit_'.length)) : null;
  const plain = entries.filter(([id]) => bitSize(id) == null);
  const bits = entries
    .filter(([id]) => bitSize(id) != null)
    .sort((a, b) => (bitSize(a[0]) ?? 0) - (bitSize(b[0]) ?? 0));
  return [...plain, ...bits];
}

/**
 * EVERYTHING the office selected, GROUPED BY SERVICE (founder's decision,
 * Aug 16 2026) — then the free-text CUSTOM items, then RENTAL.
 *
 * CUSTOM is a separate group on purpose: those three strings were what the
 * printed ticket presented as the WHOLE equipment list, and the founder's
 * objection was precisely that they read as selections he had made per service.
 * Labelling them "CUSTOM" says what they are — someone typed them in.
 *
 * RENTAL only appears when there is something to rent; an empty rental row on
 * every ticket trains people to stop reading it.
 */
export function groupJobEquipment(input: JobEquipmentInput): EquipmentGroup[] {
  const groups: EquipmentGroup[] = [];
  const selections = input.equipment_selections;

  if (selections && typeof selections === 'object') {
    for (const [code, picks] of Object.entries(selections)) {
      if (!picks || typeof picks !== 'object' || Array.isArray(picks)) continue;
      const entries = Object.entries(picks as Record<string, unknown>);
      const sub = entries.find(([id]) => id === '_sub')?.[1];
      const subText = sub ? SUB_OPTION_LABELS[String(sub)] ?? humanizeValue(sub) : '';

      const items: string[] = [];
      for (const [itemId, value] of sortServiceItems(entries.filter(([id]) => id !== '_sub'))) {
        const text = equipmentSelectionText(itemId, value);
        if (text) items.push(text);
      }
      // A service whose ONLY pick is the machine still has to print. `_sub` used
      // to exist only on WS/TS, which gates its whole item list behind that pick
      // — so there was always something else and dropping an empty group was
      // harmless. DFS now carries `_sub` too (Tier 4 / White Saw / Husqvarna
      // 5000 / 7000 / Electric Slab) and its item list is NOT gated, so the
      // office can legitimately tick the saw and nothing else. Dropping that
      // group would silently lose the one machine the crew has to load.
      if (items.length === 0 && !subText) continue;
      groups.push({
        key: code,
        label: subText ? `${code} (${subText})` : code,
        sublabel: scopeServiceLabel(code) === code ? '' : scopeServiceLabel(code),
        items,
      });
    }
  }

  const flags = input.equipment_rental_flags ?? {};
  const custom = (input.equipment_needed ?? [])
    .map((e) => String(e ?? '').trim())
    .filter(Boolean)
    // A flagged item is a rental; it is listed once, under RENTAL.
    .filter((e) => !flags[e]);
  if (custom.length > 0) {
    groups.push({ key: 'CUSTOM', label: 'CUSTOM', sublabel: 'typed in by the office', items: custom });
  }

  const rentals = [
    ...(input.equipment_rentals ?? []).map((r) => String(r ?? '').trim()).filter(Boolean),
    ...(input.equipment_needed ?? [])
      .map((e) => String(e ?? '').trim())
      .filter((e) => e && !!flags[e]),
  ];
  const seenRentals = new Set<string>();
  const dedupedRentals = rentals.filter((r) => {
    const key = r.toLowerCase();
    if (seenRentals.has(key)) return false;
    seenRentals.add(key);
    return true;
  });
  if (dedupedRentals.length > 0) {
    groups.push({ key: 'RENTAL', label: 'RENTAL', sublabel: '', items: dedupedRentals });
  }

  return groups;
}

/** True when the job carries no equipment at all (the ticket rules blank lines). */
export function hasNoJobEquipment(groups: EquipmentGroup[]): boolean {
  return groups.length === 0;
}

// ── Equipment: laying the list out so a crew can read it ────────────────────

export interface EquipmentRow {
  kind: 'heading' | 'item';
  /** What to print. A continued heading already carries its '(cont.)' marker. */
  text: string;
  /** The `EquipmentGroup.key` this row belongs to. */
  groupKey: string;
  /** Heading only: this is a REPEAT at the top of the next column, not a new service. */
  continued?: boolean;
}

/**
 * A heading line is taller than an item line (bigger leading + its rule +
 * spacing). Measured on the printed ticket: heading ≈ 10.4pt, item ≈ 8.6pt.
 * Balancing on line COUNT instead of this ratio puts visibly more ink in one
 * column than the other once a job has four or five services.
 */
const HEADING_WEIGHT = 1.2;

/**
 * Lay the grouped equipment out as N newspaper-style columns of roughly equal
 * height, one item per line.
 *
 * WHY THIS EXISTS (founder, Aug 16 2026): the printed EQUIPMENT REQ'D box
 * joined every pick with ' · ' into one wrapped paragraph — `pump can · ECD
 * machine · slurry ring · 3" core bit · 4" core bit · …`. Nobody can find a
 * single tool in that at 7am.
 *
 * One item per line is the fix, and on this sheet it only fits in two columns:
 * the ticket is LETTER LANDSCAPE and the equipment column is 246.7pt wide,
 * while the row it sits in is only as tall as WORK CONDITIONS (a fixed 188pt)
 * before it starts costing page space — and the tightest real jobs have 14pt of
 * page-1 slack. Splitting PER GROUP was measured at 210pt on the worst real job
 * (23 picks over 4 services, TEST-2026-000103) because every group wastes up to
 * half a row on its ragged last line. Balancing the rows CONTINUOUSLY across
 * both columns instead measures 167pt on that same job — inside the free
 * budget, so the ticket does not reflow at all.
 *
 * Two rules keep it readable when a service straddles the break:
 *   - a column never ENDS on a heading (an orphaned service name at the foot of
 *     a column reads as "this service needs nothing"), and
 *   - a column that OPENS mid-service repeats the heading with '(cont.)', so no
 *     item is ever left under the wrong service name.
 *
 * Falls back to one column when a balanced split would leave a column empty —
 * a blank half-box next to two lines of text just looks broken.
 */
export function layoutEquipmentColumns(
  groups: EquipmentGroup[],
  columns = 2
): EquipmentRow[][] {
  const rows: EquipmentRow[] = [];
  for (const group of groups) {
    // A heading with no items is legitimate — a service whose only pick is the
    // machine itself (the `_sub` saw). It prints as a bare service line.
    if (!group) continue;
    rows.push({ kind: 'heading', text: group.label, groupKey: group.key });
    for (const item of group.items) rows.push({ kind: 'item', text: item, groupKey: group.key });
  }
  if (rows.length === 0) return [];
  if (columns <= 1) return [rows];

  const weightOf = (r: EquipmentRow) => (r.kind === 'heading' ? HEADING_WEIGHT : 1);
  const labelFor = (key: string) => groups.find((g) => g.key === key)?.label ?? key;

  const out: EquipmentRow[][] = [];
  let idx = 0;
  for (let c = 0; c < columns; c++) {
    const col: EquipmentRow[] = [];
    // Opening mid-service: say which service these items belong to.
    if (c > 0 && idx < rows.length && rows[idx].kind === 'item') {
      col.push({
        kind: 'heading',
        text: `${labelFor(rows[idx].groupKey)} (cont.)`,
        groupKey: rows[idx].groupKey,
        continued: true,
      });
    }
    const remainingCols = columns - c;
    const remainingWeight = rows.slice(idx).reduce((sum, r) => sum + weightOf(r), 0);
    const target = remainingWeight / remainingCols;
    let filled = col.reduce((sum, r) => sum + weightOf(r), 0);
    while (idx < rows.length) {
      if (c < columns - 1 && filled >= target) break;
      col.push(rows[idx]);
      filled += weightOf(rows[idx]);
      idx += 1;
    }
    // Never leave a service name stranded at the foot of a column.
    while (
      col.length > 0 &&
      col[col.length - 1].kind === 'heading' &&
      !col[col.length - 1].continued &&
      idx < rows.length
    ) {
      col.pop();
      idx -= 1;
    }
    out.push(col);
  }

  // A balanced split that empties a column is worse than not splitting.
  if (out.some((col) => col.length === 0)) return [rows];
  return out;
}

// ── PPE & safety ────────────────────────────────────────────────────────────

/**
 * `gloves_cut_3` → `Gloves Cut Level 3`; `hard_hat` → `Hard Hat`.
 *
 * The react-pdf ticket already did this; the HTML ticket printed the raw
 * storage token, so the same job's PPE box read "gloves_cut_3" on one sheet and
 * "Gloves Cut Level 3" on the other. Shared here so that cannot recur.
 *
 * Free text an office typed is returned untouched — `humanizeValue`'s rule.
 */
export function ppeLabel(value: unknown): string {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  if (/\s/.test(raw)) return raw;
  const glove = raw.match(/^gloves_cut_(\d+)$/i);
  if (glove) return `Gloves Cut Level ${glove[1]}`;
  return raw
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Every PPE + additional-safety string on the job, humanised, blanks dropped. */
export function formatPpeAndSafety(
  ppe: unknown[] | null | undefined,
  safety: unknown[] | null | undefined
): string[] {
  return [...(Array.isArray(ppe) ? ppe : []), ...(Array.isArray(safety) ? safety : [])]
    .map((p) => ppeLabel(p))
    .filter(Boolean);
}

// ── Permits ─────────────────────────────────────────────────────────────────
//
// WHY THIS MOVED HERE (guardian, Aug 17 2026): the react-pdf ticket named the
// permits ("Hot Work Permit") while the HTML sheet printed only
// "Permit Required: Yes" — even though the raw array was already in its payload
// and simply never rendered. A production job carries a `hot_work` permit, and
// "Yes" tells a crew nothing about the fire watch, extinguisher and cool-down
// that a hot-work permit means. One table, both sheets.

export const PERMIT_TYPE_LABELS: Record<string, string> = {
  work_permit: 'Work Permit',
  hot_work: 'Hot Work Permit',
  excavation: 'Excavation Permit',
  confined_space: 'Confined Space Permit',
};

export interface PermitInput {
  type?: string | null;
  details?: string | null;
  number?: string | null;
}

/**
 * `[{ type: 'hot_work', details: '' }]` → `['Hot Work Permit']`.
 *
 * An UNKNOWN type is humanised and printed rather than dropped (same rule as the
 * equipment ids), and free-text `details` is appended in brackets when it says
 * something the label does not. A row with neither reads 'Other' — the office
 * ticked a permit, and a silently empty permit line is how a crew arrives
 * without one.
 */
export function formatPermits(permits: unknown): string[] {
  if (!Array.isArray(permits)) return [];
  const out: string[] = [];
  for (const raw of permits) {
    if (!raw || typeof raw !== 'object') continue;
    const p = raw as PermitInput;
    const type = String(p.type ?? '').trim();
    const details = String(p.details ?? '').trim();
    const label = PERMIT_TYPE_LABELS[type] || (type && type !== 'other' ? humanizeValue(type) : '') || details || 'Other';
    // Don't print "Other (Other)" or repeat the label back at itself.
    const text = details && details.toLowerCase() !== label.toLowerCase() ? `${label} (${details})` : label;
    out.push(text);
  }
  return out;
}

// ── Jobsite conditions ──────────────────────────────────────────────────────

interface ConditionField {
  key: string;
  label: string;
  /** Extra distance keys beyond the generated candidates. */
  distanceKeys?: string[];
}

/**
 * The boolean conditions, in the order they read best on a ticket.
 * Distance keys are NOT hardcoded per field — see `conditionDistance`.
 */
const CONDITION_FIELDS: ConditionField[] = [
  { key: 'water_available', label: 'Water available' },
  { key: 'electricity_available', label: 'Power available' },
  { key: 'cord_480', label: '480 cord req’d' },
  { key: 'hyd_hose', label: 'Hyd hose' },
  { key: 'water_control', label: 'Vac water' },
  { key: 'plastic_needed', label: 'Hang poly' },
  { key: 'clean_up_required', label: 'Cleanup required' },
  { key: 'overcutting_allowed', label: 'Overcutting OK' },
  { key: 'high_work', label: 'High work' },
  { key: 'scaffolding_provided', label: 'Scaffold/lift avail' },
  { key: 'manpower_provided', label: 'Manpower provided' },
  { key: 'proper_ventilation', label: 'Proper ventilation' },
];

/**
 * The SUPPLY conditions — the two that decide what the truck is loaded with.
 *
 * WHY THEY ARE SPECIAL (guardian, Aug 17 2026): the react-pdf ticket used to
 * draw a FIXED checkbox list, so `water_available: false` printed as an unticked
 * box — "no water on site", which is why the crew hooks up a water buggy before
 * leaving the shop. The chip rendering that replaced it shows only what is
 * TICKED, so `false` became indistinguishable from never-recorded. That is a
 * one-way loss of information: 31 of the 48 production jobs record these keys,
 * and 22 of them say water is NOT available.
 *
 * So a recorded `false` prints explicitly. DELIBERATELY ONLY THESE TWO: turning
 * all 19 condition keys into NO chips would double the WORK CONDITIONS box on a
 * sheet with a hard one-page budget, to say things nobody has to load a truck
 * for. `null`/absent still prints nothing — "not recorded" is not "no".
 */
const SUPPLY_CONDITION_NEGATIVES: Record<string, string> = {
  water_available: 'Water: NO',
  electricity_available: 'Power: NO',
};

/** Value-bearing (non-boolean) conditions. */
const CONDITION_VALUE_FIELDS: { key: string; label: string; values?: Record<string, string> }[] = [
  { key: 'inside_outside', label: 'Work location', values: { inside: 'Inside', outside: 'Outside' } },
  {
    key: 'high_work_access',
    label: 'High-work access',
    values: { lift_provided: 'Lift provided', we_provide: 'We provide lift', ladder: 'Ladder' },
  },
];

/**
 * The distance stored alongside a condition, in feet.
 *
 * BOTH naming conventions are accepted on purpose. Production today writes
 * `electricity_available_ft`; a concurrent change adds `electricity_distance_ft`.
 * Reading the KEYS rather than assuming one spelling means the ticket keeps
 * printing the run either way, and neither agent has to land first.
 */
export function conditionDistance(
  conditions: Record<string, unknown>,
  key: string
): number | null {
  const base = key.replace(/_(available|required|needed)$/, '');
  const candidates = [
    `${key}_ft`,
    `${key}_distance_ft`,
    `${base}_ft`,
    `${base}_distance_ft`,
    `${key}_distance`,
    `${base}_distance`,
  ];
  for (const candidate of candidates) {
    if (!(candidate in conditions)) continue;
    const n = measurementNumber(conditions[candidate]);
    if (n != null) return n;
  }
  return null;
}

/** Every key `formatJobsiteConditions` consumes, so leftovers can be found. */
function consumedConditionKeys(conditions: Record<string, unknown>): Set<string> {
  const used = new Set<string>();
  for (const { key } of CONDITION_FIELDS) {
    used.add(key);
    const base = key.replace(/_(available|required|needed)$/, '');
    for (const suffix of ['_ft', '_distance_ft', '_distance']) {
      used.add(`${key}${suffix}`);
      used.add(`${base}${suffix}`);
    }
  }
  for (const { key } of CONDITION_VALUE_FIELDS) used.add(key);
  // Any remaining *_ft key belongs to a distance we already printed or to a
  // condition that is switched off — either way it is not a line of its own.
  for (const key of Object.keys(conditions)) {
    if (/_(ft|distance_ft|distance)$/.test(key)) used.add(key);
  }
  return used;
}

/**
 * The printed WORK CONDITIONS list.
 *
 *   electricity_available: true, electricity_distance_ft: 75
 *     → "Power available — 75 ft"
 *   electricity_available: true (no distance key)
 *     → "Power available"
 *
 * Unknown truthy keys are printed humanised rather than dropped: a condition
 * the office ticked and the ticket omitted is the same class of bug as the
 * missing equipment.
 */
export function formatJobsiteConditions(
  conditions: Record<string, unknown> | null | undefined
): string[] {
  if (!conditions || typeof conditions !== 'object') return [];
  const out: string[] = [];

  for (const { key, label } of CONDITION_FIELDS) {
    const raw = conditions[key];
    // ON/OFF THROUGH `booleanish`, NOT raw truthiness. A JSONB blob that stored
    // the string 'false' (or '0') is truthy in JavaScript, so a plain `if
    // (!conditions[key])` printed "Power available" over an explicit NO — the
    // one direction that gets a crew to site without a generator. Production
    // stores real booleans today, so nothing changes now; this is the guard on
    // the day one write path starts sending strings.
    const flag = booleanish(raw);
    if (flag === false || (flag == null && !raw)) {
      // A SUPPLY condition the office actually answered "no" to is a fact the
      // crew loads equipment for — see SUPPLY_CONDITION_NEGATIVES. Everything
      // else that is off simply does not print.
      const negative = SUPPLY_CONDITION_NEGATIVES[key];
      if (negative && key in conditions && flag === false) out.push(negative);
      continue;
    }
    const ft = conditionDistance(conditions, key);
    out.push(ft != null ? `${label} — ${formatNumber(ft)} ft` : label);
  }

  for (const { key, label, values } of CONDITION_VALUE_FIELDS) {
    const raw = conditions[key];
    if (raw == null || raw === '' || raw === false) continue;
    // Case-insensitive: the schedule form writes 'inside', the schedule board's
    // Job Detail editor writes 'Inside' (see lib/jobsite-conditions.ts), and the
    // ticket must read the same either way.
    const text = values?.[String(raw).trim().toLowerCase()] ?? humanizeValue(raw);
    if (text) out.push(`${label}: ${text}`);
  }

  const used = consumedConditionKeys(conditions);
  for (const [key, value] of Object.entries(conditions)) {
    if (used.has(key)) continue;
    if (value == null || value === false || value === '' || value === 0 || value === '0') continue;
    const label = humanizeValue(key);
    if (value === true) out.push(label);
    else {
      const text = Array.isArray(value)
        ? value.map((v) => humanizeValue(v)).filter(Boolean).join(', ')
        : humanizeValue(value);
      if (text) out.push(`${label}: ${text}`);
    }
  }

  return out;
}
