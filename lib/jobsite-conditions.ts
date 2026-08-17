/**
 * Step 8 (Jobsite Conditions) + Step 6 (Site Compliance) ⇄ job_orders jsonb.
 *
 * WHY THIS EXISTS (live data loss, TEST-2026-000103, Aug 2026):
 * The founder edited a job, ticked Water Control / Electricity Available /
 * Overcutting Allowed / Cleanup Required / Plastic Needed on Step 8, saved —
 * and the row still read `jobsite_conditions: {}`. Everything he checked was
 * silently discarded.
 *
 * The cause was a patch on top of a patch. The edit-mode PATCH deliberately did
 * NOT send `jobsite_conditions` / `site_compliance` / `permits` / `arrival_time`
 * / `estimated_hours`, because the edit-mode LOAD only ever mapped ONE key out
 * of `jobsite_conditions` (`overcutting_allowed`) — so sending the form's
 * defaults would have WIPED the real values. Somebody hit "editing wipes
 * conditions", stopped sending them, and turned it into "editing silently
 * discards conditions". A control that accepts input and throws it away is
 * worse than no control.
 *
 * The fix is to make the LOAD total: every key the form can write, the form can
 * also read back. That is what this module is — the single mapping both
 * directions go through, so the two halves cannot drift again. Keep it pure:
 * no React, no fetch, no Date.now(). It is unit-tested for round-trip equality
 * in `jobsite-conditions.test.ts`.
 *
 * KEY NAMES ARE LOAD-BEARING. The same jsonb is read by the printed field
 * ticket (`app/dashboard/admin/jobs/[id]/print/page.tsx`), the dispatch PDF,
 * the operator jobsite view, and written by the schedule board's Job Detail
 * editor. The board editor stores footages as STRINGS and inside/outside
 * capitalised ('Inside'), so the loader normalises rather than assuming the
 * schedule form wrote the row.
 */

/** Boolean condition keys, paired with the optional "how many feet" companion. */
export const CONDITION_BOOLEAN_KEYS = [
  'water_available',
  'water_control',
  'manpower_provided',
  'scaffolding_provided',
  'electricity_available',
  'proper_ventilation',
  'overcutting_allowed',
  'cord_480',
  'clean_up_required',
  'high_work',
  'hyd_hose',
  'plastic_needed',
] as const;

/**
 * Conditions that carry a distance. The founder's complaint (Aug 2026) was that
 * he typed a number into the Electricity row and could not see what he had
 * entered or what it meant — hence the explicit "How far from the work area?"
 * label in the UI and the readback summary these keys feed.
 */
export const CONDITION_DISTANCE_KEYS = [
  'water_available_ft',
  'electricity_available_ft',
  'cord_480_ft',
  'high_work_ft',
  'hyd_hose_ft',
] as const;

export type ConditionBooleanKey = (typeof CONDITION_BOOLEAN_KEYS)[number];
export type ConditionDistanceKey = (typeof CONDITION_DISTANCE_KEYS)[number];

/** The subset of the schedule form's state that Step 8 owns. */
export interface JobsiteConditionsForm {
  water_available: boolean;
  water_available_ft: string;
  water_control: boolean;
  manpower_provided: boolean;
  scaffolding_provided: boolean;
  electricity_available: boolean;
  electricity_available_ft: string;
  /**
   * Free-form on purpose. The form offers inside/outside; the schedule board's
   * editor also offers 'Both'. Widening to a string means a 'Both' the board
   * set survives a schedule-form save instead of being flattened to ''.
   */
  inside_outside: string;
  proper_ventilation: boolean;
  overcutting_allowed: boolean;
  cord_480: boolean;
  cord_480_ft: string;
  clean_up_required: boolean;
  high_work: boolean;
  high_work_ft: string;
  high_work_access: string;
  hyd_hose: boolean;
  hyd_hose_ft: string;
  plastic_needed: boolean;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = Record<string, any> | null | undefined;

/** `true` / `'true'` / `'yes'` / `1` all mean checked; everything else doesn't. */
export function toBool(v: unknown): boolean {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  if (typeof v === 'string') {
    const s = v.trim().toLowerCase();
    return s === 'true' || s === 'yes' || s === '1';
  }
  return false;
}

/**
 * jsonb number-ish → the string an <input type="number"> wants.
 * Nulls, empties and NaN all become '' so the field renders blank rather than
 * the string "null".
 */
export function toFtString(v: unknown): string {
  if (v === null || v === undefined || v === '') return '';
  const n = typeof v === 'number' ? v : Number(String(v).trim());
  return Number.isFinite(n) ? String(n) : '';
}

/** The inverse: '' → null (absent), otherwise a real number. */
export function toFtNumber(v: string | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  if (s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/**
 * job_orders.jobsite_conditions → form state.
 *
 * TOTAL by construction: every key `serializeJobsiteConditions` writes is read
 * back here. That is the property the round-trip test pins, and the reason the
 * PATCH is now safe to send.
 */
export function loadJobsiteConditions(jc: Json): JobsiteConditionsForm {
  const j = jc || {};
  const insideOutside = typeof j.inside_outside === 'string' ? j.inside_outside.trim() : '';
  return {
    water_available: toBool(j.water_available),
    water_available_ft: toFtString(j.water_available_ft),
    water_control: toBool(j.water_control),
    manpower_provided: toBool(j.manpower_provided),
    scaffolding_provided: toBool(j.scaffolding_provided),
    electricity_available: toBool(j.electricity_available),
    electricity_available_ft: toFtString(j.electricity_available_ft),
    // Lower-cased so the board's 'Inside' lights up the form's 'inside' button;
    // anything else (e.g. 'both') is preserved verbatim and written back.
    inside_outside: insideOutside.toLowerCase(),
    proper_ventilation: toBool(j.proper_ventilation),
    overcutting_allowed: toBool(j.overcutting_allowed),
    cord_480: toBool(j.cord_480),
    cord_480_ft: toFtString(j.cord_480_ft),
    clean_up_required: toBool(j.clean_up_required),
    high_work: toBool(j.high_work),
    high_work_ft: toFtString(j.high_work_ft),
    high_work_access: typeof j.high_work_access === 'string' ? j.high_work_access : '',
    hyd_hose: toBool(j.hyd_hose),
    hyd_hose_ft: toFtString(j.hyd_hose_ft),
    plastic_needed: toBool(j.plastic_needed),
  };
}

/** form state → job_orders.jobsite_conditions. */
export function serializeJobsiteConditions(
  f: JobsiteConditionsForm
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Record<string, any> {
  return {
    water_available: f.water_available,
    water_available_ft: toFtNumber(f.water_available_ft),
    water_control: f.water_control,
    manpower_provided: f.manpower_provided,
    scaffolding_provided: f.scaffolding_provided,
    electricity_available: f.electricity_available,
    electricity_available_ft: toFtNumber(f.electricity_available_ft),
    inside_outside: f.inside_outside || null,
    proper_ventilation: f.proper_ventilation,
    overcutting_allowed: f.overcutting_allowed,
    cord_480: f.cord_480,
    cord_480_ft: toFtNumber(f.cord_480_ft),
    clean_up_required: f.clean_up_required,
    high_work: f.high_work,
    high_work_ft: toFtNumber(f.high_work_ft),
    high_work_access: f.high_work_access || null,
    hyd_hose: f.hyd_hose,
    hyd_hose_ft: toFtNumber(f.hyd_hose_ft),
    plastic_needed: f.plastic_needed,
  };
}

// ── Step 6: site_compliance ──────────────────────────────────────────────────

/** The subset of the schedule form's state that `site_compliance` owns. */
export interface SiteComplianceForm {
  orientation_required: boolean;
  orientation_datetime: string;
  badging_required: boolean;
  badging_type: string;
  photos_prohibited: boolean;
  special_instructions: string;
  compliance_attachment_urls: string[];
  facility_id: string;
  facility_name: string;
  facility_requirements: string;
}

/** job_orders.site_compliance → form state. Total, same contract as above. */
export function loadSiteCompliance(sc: Json): SiteComplianceForm {
  const c = sc || {};
  const str = (v: unknown) => (typeof v === 'string' ? v : '');
  return {
    orientation_required: toBool(c.orientation_required),
    orientation_datetime: str(c.orientation_datetime),
    badging_required: toBool(c.badging_required),
    badging_type: str(c.badging_type),
    photos_prohibited: toBool(c.photos_prohibited),
    special_instructions: str(c.special_instructions),
    compliance_attachment_urls: Array.isArray(c.attachment_urls)
      ? c.attachment_urls.filter((u: unknown): u is string => typeof u === 'string')
      : [],
    facility_id: str(c.facility_id),
    facility_name: str(c.facility_name),
    facility_requirements: str(c.facility_requirements),
  };
}

/** form state → job_orders.site_compliance. */
export function serializeSiteCompliance(
  f: SiteComplianceForm
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Record<string, any> {
  return {
    orientation_required: f.orientation_required,
    orientation_datetime: f.orientation_datetime || null,
    badging_required: f.badging_required,
    badging_type: f.badging_type || null,
    // Secure-facility flag: operators' photo requirement is waived (with an
    // explicit skip acknowledgment) when this is true.
    photos_prohibited: f.photos_prohibited,
    special_instructions: f.special_instructions || null,
    attachment_urls:
      f.compliance_attachment_urls.length > 0 ? f.compliance_attachment_urls : undefined,
    facility_id: f.facility_id || null,
    facility_name: f.facility_name || null,
    facility_requirements: f.facility_requirements || null,
  };
}

// ── Misc round-trip helpers the same edit path needs ─────────────────────────

/**
 * `arrival_time` is a text column and comes back as 'HH:MM:SS'; an
 * <input type="time"> only accepts 'HH:MM'. Without this the edit form showed a
 * blank start time and a re-save would have overwritten a real 08:00 with the
 * 07:00 default — the exact wipe this whole module exists to prevent.
 */
export function toTimeInputValue(v: unknown): string {
  if (typeof v !== 'string') return '';
  const m = v.trim().match(/^(\d{1,2}):(\d{2})/);
  if (!m) return '';
  return `${m[1].padStart(2, '0')}:${m[2]}`;
}

export interface PermitEntry {
  type: string;
  details: string;
}

/** job_orders.permits (jsonb array) → the form's permit chips. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function loadPermits(permits: any): PermitEntry[] {
  if (!Array.isArray(permits)) return [];
  return permits
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .filter((p: any) => p && typeof p === 'object' && typeof p.type === 'string')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((p: any) => ({ type: p.type, details: typeof p.details === 'string' ? p.details : '' }));
}

/** The free-text "Other Permit" box is stored as a permit of type 'other'. */
export function permitOtherText(permits: PermitEntry[]): string {
  return permits.find((p) => p.type === 'other')?.details || '';
}
