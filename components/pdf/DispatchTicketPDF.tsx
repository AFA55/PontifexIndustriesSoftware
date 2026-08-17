import React from 'react';
import { Document, Page, Text, View, Image, StyleSheet } from '@react-pdf/renderer';
import { asArray } from '@/lib/job-arrays';
// SHARED with the HTML print page and the crew's digital ticket. Two surfaces
// formatting the same job differently is a recurring bug class here, and this
// sheet is the one the customer signs.
import { groupJobEquipment, layoutEquipmentColumns, rowLocationLabel } from '@/lib/job-ticket-format';
import { chunkPhotoPages, type TicketPhoto } from '@/lib/job-ticket-photos';

// ── Styles ──────────────────────────────────────────────────
const s = StyleSheet.create({
  page: {
    padding: 18,
    fontSize: 8,
    fontFamily: 'Helvetica',
    flexDirection: 'column',
  },

  // Header
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
    paddingBottom: 6,
    borderBottom: '2 solid #1E293B',
  },
  companyName: { fontSize: 15, fontWeight: 'bold', color: '#1E293B' },
  jobNumberBox: { borderWidth: 1.5, borderColor: '#1E293B', borderRadius: 3, paddingHorizontal: 6, paddingVertical: 2 },
  jobNumberText: { fontSize: 14, fontWeight: 'bold', color: '#1E293B', letterSpacing: 0.5 },
  companyAddress: { fontSize: 7, color: '#475569', marginTop: 1 },
  companyPhone: { fontSize: 7, color: '#475569' },
  headerCenter: { alignItems: 'center', justifyContent: 'center' },
  jobTicketTitle: { fontSize: 18, fontWeight: 'bold', color: '#1E293B', letterSpacing: 1 },
  headerRight: { alignItems: 'flex-end' },
  employeesLabel: { fontSize: 8, fontWeight: 'bold', color: '#475569', marginBottom: 2 },
  employeeLine: { fontSize: 8, color: '#1E293B', marginBottom: 1 },

  // Three-column layout
  threeColumns: { flexDirection: 'row', gap: 8, marginBottom: 6 },
  col: { flex: 1 },

  // Section card
  section: { border: '0.75 solid #CBD5E1', borderRadius: 3, marginBottom: 5, overflow: 'hidden' },
  sectionHeader: { backgroundColor: '#F1F5F9', paddingHorizontal: 6, paddingVertical: 3, borderBottom: '0.75 solid #CBD5E1' },
  sectionTitle: { fontSize: 9, fontWeight: 'bold', color: '#334155', textTransform: 'uppercase', letterSpacing: 0.5 },
  sectionBody: { padding: 5 },

  // Field rows
  fieldRow: { flexDirection: 'row', marginBottom: 2.5, alignItems: 'flex-start' },
  fieldLabel: { fontSize: 8.5, fontWeight: 'bold', color: '#64748B', width: 82, textTransform: 'uppercase' },
  fieldValue: { fontSize: 9.5, color: '#1E293B', flex: 1 },
  fieldValueBold: { fontSize: 8, fontWeight: 'bold', color: '#1E293B', flex: 1 },

  // Checkbox row for conditions
  checkRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 2.5 },
  checkBox: { width: 8, height: 8, border: '0.75 solid #94A3B8', borderRadius: 1, marginRight: 4, justifyContent: 'center', alignItems: 'center' },
  checkBoxFilled: { width: 8, height: 8, border: '0.75 solid #1E293B', borderRadius: 1, marginRight: 4, backgroundColor: '#1E293B', justifyContent: 'center', alignItems: 'center' },
  checkMark: { fontSize: 6, color: '#FFFFFF', fontWeight: 'bold' },
  checkLabel: { fontSize: 8.5, color: '#334155', flex: 1 },
  checkDetail: { fontSize: 6.5, color: '#64748B', marginLeft: 2 },

  // Scope table
  scopeTable: { border: '0.75 solid #CBD5E1', borderRadius: 3, overflow: 'hidden', marginBottom: 5 },
  scopeHeaderRow: { flexDirection: 'row', backgroundColor: '#F1F5F9', borderBottom: '0.75 solid #CBD5E1' },
  scopeHeaderCell: { fontSize: 6.5, fontWeight: 'bold', color: '#475569', paddingHorizontal: 4, paddingVertical: 3, textTransform: 'uppercase' },
  scopeDataRow: { flexDirection: 'row', borderBottom: '0.5 solid #E2E8F0' },
  scopeDataRowAlt: { flexDirection: 'row', borderBottom: '0.5 solid #E2E8F0', backgroundColor: '#FAFAFA' },
  scopeCell: { fontSize: 7.5, color: '#1E293B', paddingHorizontal: 4, paddingVertical: 2.5 },

  // Bottom sections
  textBlock: { border: '0.75 solid #CBD5E1', borderRadius: 3, padding: 5, marginBottom: 5 },
  textBlockLabel: { fontSize: 7, fontWeight: 'bold', color: '#475569', textTransform: 'uppercase', marginBottom: 2 },
  textBlockValue: { fontSize: 8, color: '#1E293B', lineHeight: 1.3 },

  // Notes lines
  notesSection: { border: '0.75 solid #CBD5E1', borderRadius: 3, padding: 5, marginBottom: 5 },
  notesTitle: { fontSize: 7, fontWeight: 'bold', color: '#94A3B8', textTransform: 'uppercase', marginBottom: 4 },
  notesLine: { borderBottom: '0.5 solid #CBD5E1', height: 14, marginBottom: 0 },

  // Footer / Signature
  footer: { marginTop: 'auto', borderTop: '1 solid #CBD5E1', paddingTop: 6, flexDirection: 'row', gap: 16 },
  sigBox: { flex: 1, borderBottom: '1 solid #94A3B8', paddingBottom: 16 },
  sigLabel: { fontSize: 7, color: '#64748B', fontWeight: 'bold', textTransform: 'uppercase' },

  // Equipment Req'd — a SCANNABLE list, not a paragraph.
  // See the block that uses these for the measurements behind the sizes.
  eqGroupTitle: {
    fontSize: 7,
    fontWeight: 'bold',
    color: '#334155',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    borderBottom: '0.5 solid #CBD5E1',
    paddingBottom: 1,
    marginTop: 3.5,
    marginBottom: 1.5,
  },
  /** Same heading with no leading gap — it is already against the box edge. */
  eqGroupTitleFirst: {
    fontSize: 7,
    fontWeight: 'bold',
    color: '#334155',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    borderBottom: '0.5 solid #CBD5E1',
    paddingBottom: 1,
    marginBottom: 1.5,
  },
  eqCols: { flexDirection: 'row' },
  eqColFirst: { flex: 1, paddingRight: 5 },
  eqColLast: { flex: 1 },
  eqItem: { fontSize: 7.5, color: '#1E293B', lineHeight: 1.2 },

  // ── Photo pages (page 2+) ──
  // Every size below is EXPLICIT rather than flexed, because a photo page that
  // reflows silently drops to one photo per page. LETTER landscape is
  // 792 × 612pt; at padding 18 the content box is 756 × 576. Header band 16pt +
  // 6pt gap leaves 554pt for two rows; rows are 272pt (NOT the 277pt that fits
  // exactly — measured at exactly 576pt total, i.e. zero margin, and a single
  // point of rounding would push row two onto a page of its own).
  // Two cells of 370pt + a 16pt gutter = 756pt exactly. A 370pt-wide image
  // prints 5.1 inches across — wide enough to read a chalk mark on a wall.
  photoPage: { padding: 18, fontFamily: 'Helvetica', flexDirection: 'column' },
  photoHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    borderBottom: '1 solid #1E293B',
    paddingBottom: 3,
    marginBottom: 6,
    height: 16,
  },
  photoHeaderTitle: { fontSize: 10, fontWeight: 'bold', color: '#1E293B', letterSpacing: 0.5 },
  photoHeaderMeta: { fontSize: 7.5, color: '#64748B' },
  photoRow: { flexDirection: 'row', height: 272 },
  photoCell: { width: 370, height: 272 },
  photoCellFirst: { width: 370, height: 272, marginRight: 16 },
  photoFrame: {
    height: 257,
    border: '0.75 solid #CBD5E1',
    borderRadius: 3,
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  // A page holding only one or two photos gets the WHOLE height instead of
  // leaving the bottom half blank — the point of printing them is that the crew
  // can see the detail, and a 1-up fills the sheet (719 × 539 for a 4:3 shot,
  // ~10 inches wide).
  photoRowTall: { flexDirection: 'row', height: 554 },
  photoCellTall: { width: 370, height: 554 },
  photoCellTallFirst: { width: 370, height: 554, marginRight: 16 },
  photoCellTallSolo: { width: 756, height: 554 },
  photoFrameTall: {
    height: 539,
    border: '0.75 solid #CBD5E1',
    borderRadius: 3,
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  photoImage: { maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' },
  photoCaption: { fontSize: 7.5, fontWeight: 'bold', color: '#475569', marginTop: 2.5 },

  // Permit banner
  permitBanner: { backgroundColor: '#FEF3C7', border: '1 solid #F59E0B', borderRadius: 3, padding: 5, marginBottom: 6, flexDirection: 'row', alignItems: 'center' },
  permitLabel: { fontSize: 8, fontWeight: 'bold', color: '#92400E', marginRight: 4 },
  permitText: { fontSize: 7.5, color: '#78350F' },
});

// ── Branding prop for PDF (cannot use hooks) ───────────────
export interface PDFBranding {
  company_name?: string;
  company_address?: string;
  company_phone?: string;
  logo_url?: string | null;
  /** Pre-fetched PNG/JPEG data URI for react-pdf <Image> (see lib/pdf-branding.ts fetchLogoDataUri). */
  logoDataUri?: string | null;
  pdf_header_text?: string | null;
  pdf_footer_text?: string | null;
  pdf_show_logo?: boolean;
  primary_color?: string;
  secondary_color?: string;
}

// ── Interfaces ──────────────────────────────────────────────
interface DispatchTicketData {
  job_number: string;
  title: string;
  customer_name: string;
  customer_contact?: string;
  site_contact_phone?: string;
  foreman_phone?: string;
  address?: string;
  location?: string;
  job_type?: string;
  description?: string;
  scheduled_date?: string;
  end_date?: string;
  arrival_time?: string;
  estimated_cost?: number;
  estimated_hours?: number;
  po_number?: string;
  salesman_name?: string;
  operator_name?: string;
  helper_name?: string;
  equipment_needed?: string[];
  /** The per-service picks (core bits, saws, hoses). This ticket never read
   *  them, which is why ~16 selections were missing from the printed sheet. */
  equipment_selections?: Record<string, Record<string, unknown>> | null;
  equipment_rentals?: string[];
  equipment_rental_flags?: Record<string, boolean>;
  ppe_required?: string[];
  scope_details?: Record<string, any>;
  site_compliance?: Record<string, any>;
  jobsite_conditions?: Record<string, any>;
  additional_info?: string;
  job_difficulty_rating?: number;
  difficulty_rating?: number;
  permit_required?: boolean;
  permits?: { type: string; details?: string }[];
  is_multi_day?: boolean;
  total_days_worked?: number;
  scheduling_flexibility?: Record<string, any>;
  directions?: string;
  /** Resolved by the route (lib/job-ticket-photos) — bytes already inlined. */
  photos?: TicketPhoto[];
}

/**
 * One parsed row out of `scope_details[code].cuts` / `.holes`.
 *
 * `location` is on here because the schedule form writes it PER ROW (each hole
 * group carries its own Elevated Slab / Slab on Grade / On Wall pick). The old
 * type omitted it, which is part of why the printed WALL/FLOOR column silently
 * read a service-level key that does not exist instead.
 */
interface ScopeRowInput {
  qty?: string;
  bit_size?: string;
  depth?: string;
  linear_feet?: string;
  num_cuts?: string;
  location?: string;
}

// ── Helpers ─────────────────────────────────────────────────
function formatDate(d?: string) {
  if (!d) return '';
  try {
    return new Date(d + 'T00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  } catch { return d; }
}

// ── Component ───────────────────────────────────────────────


export default function DispatchTicketPDF({ job, branding }: { job: DispatchTicketData; branding?: PDFBranding }) {
  const today = new Date().toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
  const conditions = job.jobsite_conditions || {};
  const compliance = job.site_compliance || {};

  // Condition checklist items
  const conditionItems: { label: string; key: string; detailKey?: string; detailSuffix?: string }[] = [
    { label: 'Water Available', key: 'water_available', detailKey: 'water_available_ft', detailSuffix: 'ft' },
    { label: 'Power Available', key: 'electricity_available', detailKey: 'electricity_available_ft', detailSuffix: 'ft' },
    { label: '480 Cord Req\'d', key: 'cord_480', detailKey: 'cord_480_ft', detailSuffix: 'ft' },
    { label: 'Hyd Hose', key: 'hyd_hose', detailKey: 'hyd_hose_ft', detailSuffix: 'ft' },
    { label: 'Vac Water', key: 'water_control' },
    { label: 'Hang Poly', key: 'plastic_needed' },
    { label: 'Cleanup', key: 'clean_up_required' },
    { label: 'Overcutting OK', key: 'overcutting_allowed' },
    { label: 'High Work', key: 'high_work', detailKey: 'high_work_ft', detailSuffix: 'ft' },
    { label: 'Scaffold/Lift Avail', key: 'scaffolding_provided' },
    { label: 'Manpower Prov\'d', key: 'manpower_provided' },
    { label: 'Inside/Outside', key: 'inside_outside' },
    { label: 'Ventilation', key: 'proper_ventilation' },
  ];

  // Equipment checklist items
  // The office's ACTUAL selections, grouped by service. This replaced a
  // hardcoded 13-row checklist plus a fuzzy name matcher that compared the
  // free-text strings in `equipment_needed` against those labels — which is how
  // a job where nobody selected "Wall Saw" printed a TICKED Wall Saw box (the
  // office had typed "Wall Saw" as a custom item), while sixteen genuine picks
  // sitting in `equipment_selections` never appeared on the sheet at all.
  const equipmentGroups = groupJobEquipment({
    equipment_selections: job.equipment_selections,
    equipment_needed: job.equipment_needed,
    equipment_rentals: job.equipment_rentals,
    equipment_rental_flags: job.equipment_rental_flags,
  });
  // Two balanced columns, one item per line — see the render block below for
  // the measurements that ruled out a single column.
  const equipmentColumns = layoutEquipmentColumns(equipmentGroups, 2);

  // Four photos to a page, 2 × 2. Empty when the job has none — and then the
  // Document is exactly the one-page ticket it has always been.
  const photoPages = chunkPhotoPages(job.photos ?? []);

  // Scope details as table rows — parse nested JSON strings for cuts/holes
  const scopeRows: { type: string; qty: string; footage: string; depth: string; wallFloor: string; notes: string }[] = [];

  if (job.scope_details) {
    for (const [serviceCode, val] of Object.entries(job.scope_details)) {
      if (!val || typeof val !== 'object') continue;
      const entry = val as Record<string, string>;
      const label = serviceCode.replace(/_/g, ' ');

      // Floor/wall sawing — parse cuts array
      if (entry.cuts) {
        try {
          const cuts = JSON.parse(entry.cuts) as ScopeRowInput[];
          cuts.forEach((cut, idx) => {
            scopeRows.push({
              type: cuts.length > 1 ? `${label} (cut ${idx + 1})` : label,
              qty: cut.num_cuts || '—',
              footage: cut.linear_feet ? `${cut.linear_feet} LF` : '—',
              depth: cut.depth ? `${cut.depth}"` : '—',
              wallFloor: rowLocationLabel(cut, entry) || '—',
              notes: entry.notes || '—',
            });
          });
        } catch { /* skip malformed */ }
        continue;
      }

      // Core drilling — parse holes array
      if (entry.holes) {
        try {
          const holes = JSON.parse(entry.holes) as ScopeRowInput[];
          holes.forEach((hole, idx) => {
            scopeRows.push({
              type: holes.length > 1 ? `${label} (set ${idx + 1})` : label,
              qty: hole.qty || '—',
              footage: hole.bit_size ? `${hole.bit_size}" dia` : '—',
              depth: hole.depth ? `${hole.depth}"` : '—',
              // WHERE THE HOLES GO — the founder asked three times why this said
              // "—" for core drilling. It read `entry.material` /
              // `entry.wall_floor_type`, two SERVICE-level keys that no
              // production row has ever carried, and never looked at the hole's
              // own `location` ('on_wall' / 'elevated_slab' / 'slab_on_grade'),
              // which the schedule form has been writing per hole group all
              // along. Older rows keep it one level up as `work_location`; both
              // are resolved in lib/job-ticket-format.
              wallFloor: rowLocationLabel(hole, entry) || '—',
              notes: entry.notes || '—',
            });
          });
        } catch { /* skip malformed */ }
        continue;
      }

      // Demo, Removal, GPR, or other text-based entries
      const noteParts: string[] = [];
      if (entry.description) noteParts.push(entry.description);
      if (entry.method) noteParts.push(`Method: ${entry.method.replace(/_/g, ' ')}`);
      if (entry.equipment) noteParts.push(`Equip: ${entry.equipment}`);

      scopeRows.push({
        type: label,
        qty: entry.quantity || entry.area || '—',
        footage: entry.size || entry.footage || '—',
        depth: entry.depth || '—',
        wallFloor: rowLocationLabel(null, entry) || '—',
        notes: noteParts.join(' | ') || entry.notes || '—',
      });
    }
  }

  return (
    <Document>
      <Page size="LETTER" orientation="landscape" style={s.page}>

        {/* ═══ HEADER ═══ */}
        {/* The company block and the title sit together on the left, with the
            JOB NUMBER beside the title — "put the job number right next to JOB
            TICKET, just so it's easy to see when we're sifting through it for
            the admin" (founder, Aug 15). Sifting a stack of paper is the actual
            use, so the number has to be findable at the top edge.

            EMPLOYEES REMOVED. Third time asked: a sheet printed Monday must not
            assert who is on the job Thursday. Who actually worked it is on the
            WORK ticket, taken from the clock cards. */}
        {/* Company on the left, the ticket's identity stacked on the right:
            JOB TICKET, the printed date under it, then the job number
            (founder, Aug 15). One place to look for what this sheet is and
            which job it belongs to. */}
        <View style={s.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={s.companyName}>{(branding?.company_name || 'PATRIOT CONCRETE CUTTING').toUpperCase()}</Text>
            <Text style={s.companyAddress}>{branding?.company_address || 'P.O Box 504, Piedmont, SC 29673'}</Text>
            <Text style={s.companyPhone}>{branding?.company_phone || 'Phone: 864-299-0330  |  Fax: 864-299-1532'}</Text>
          </View>
          <View style={s.headerRight}>
            <Text style={s.jobTicketTitle}>JOB TICKET</Text>
            <Text style={{ fontSize: 7.5, color: '#64748B', marginTop: 1, marginBottom: 3 }}>
              Printed: {today}
            </Text>
            <View style={s.jobNumberBox}>
              <Text style={s.jobNumberText}>{job.job_number}</Text>
            </View>
            {/* MULTI-DAY · DAY N REMOVED from the printed sheet (founder,
                Aug 16): "operators don't need to know that, that can stay
                internal." A day counter on a crew's paper invites "day 3 of 5"
                pacing and is the office's scheduling business, not the crew's.
                The flag itself is untouched — the job view, the schedule board
                and the daily-log chain all still run off it. */}
          </View>
        </View>

        {/* ═══ PERMIT BANNER ═══ */}
        {job.permit_required && job.permits && job.permits.length > 0 && (
          <View style={s.permitBanner}>
            <Text style={s.permitLabel}>PERMITS REQUIRED:</Text>
            <Text style={s.permitText}>
              {asArray<any>(job.permits).map(p => {
                const label = p.type === 'work_permit' ? 'Work Permit' :
                  p.type === 'hot_work' ? 'Hot Work Permit' :
                  p.type === 'excavation' ? 'Excavation Permit' :
                  p.type === 'confined_space' ? 'Confined Space Permit' :
                  p.details || 'Other';
                return p.details && p.type !== 'other' ? `${label} (${p.details})` : label;
              }).join(' | ')}
            </Text>
          </View>
        )}

        {/* ═══ THREE-COLUMN LAYOUT ═══ */}
        <View style={s.threeColumns}>

          {/* ── COLUMN 1: Job Info ── */}
          <View style={s.col}>
            <View style={s.section}>
              <View style={s.sectionHeader}>
                <Text style={s.sectionTitle}>Job Information</Text>
              </View>
              <View style={s.sectionBody}>
                <View style={s.fieldRow}>
                  <Text style={s.fieldLabel}>Date</Text>
                  <Text style={s.fieldValueBold}>{formatDate(job.scheduled_date)}</Text>
                </View>
                <View style={s.fieldRow}>
                  <Text style={s.fieldLabel}>Time</Text>
                  <Text style={s.fieldValueBold}>{job.arrival_time || '—'}</Text>
                </View>
                <View style={s.fieldRow}>
                  <Text style={s.fieldLabel}>Cust Name</Text>
                  <Text style={s.fieldValueBold}>{job.customer_name}</Text>
                </View>
                <View style={s.fieldRow}>
                  <Text style={s.fieldLabel}>Job #</Text>
                  <Text style={s.fieldValueBold}>{job.job_number}</Text>
                </View>
                <View style={s.fieldRow}>
                  <Text style={s.fieldLabel}>P.O. #</Text>
                  <Text style={s.fieldValue}>{job.po_number || '—'}</Text>
                </View>
                <View style={s.fieldRow}>
                  <Text style={s.fieldLabel}>Job Loc</Text>
                  <Text style={s.fieldValueBold}>{job.location || '—'}</Text>
                </View>
                <View style={s.fieldRow}>
                  <Text style={s.fieldLabel}>Address</Text>
                  <Text style={s.fieldValue}>{job.address || '—'}</Text>
                </View>
                <View style={s.fieldRow}>
                  <Text style={s.fieldLabel}>Contact</Text>
                  <Text style={s.fieldValue}>{job.customer_contact || '—'}</Text>
                </View>
                <View style={s.fieldRow}>
                  <Text style={s.fieldLabel}>Job Phone</Text>
                  <Text style={s.fieldValue}>{job.site_contact_phone || job.foreman_phone || '—'}</Text>
                </View>
                <View style={s.fieldRow}>
                  <Text style={s.fieldLabel}>Quoted By</Text>
                  <Text style={s.fieldValue}>{job.salesman_name || '—'}</Text>
                </View>
                {/* Estimated hours intentionally NOT printed on the crew ticket (admin-only). */}
                <View style={s.fieldRow}>
                  <Text style={s.fieldLabel}>Job Type</Text>
                  <Text style={s.fieldValue}>{job.job_type || '—'}</Text>
                </View>
                {/* DIFFICULTY REMOVED (founder, asked repeatedly — Aug 12 and
                    again Aug 15). It is an INTERNAL scheduling signal: it drives
                    operator skill-matching and capacity planning. It is not
                    something to hand a crew, and it is certainly not something
                    to hand a customer who happens to see the sheet. It still
                    shows on the schedule board and the approval modal, where
                    the office actually uses it. */}
              </View>
            </View>

            {/* Compliance section in column 1 */}
            {(compliance.orientation_required || compliance.badging_required) && (
              <View style={s.section}>
                <View style={{ ...s.sectionHeader, backgroundColor: '#DBEAFE' }}>
                  <Text style={s.sectionTitle}>Site Compliance</Text>
                </View>
                <View style={s.sectionBody}>
                  {compliance.orientation_required && (
                    <View style={s.fieldRow}>
                      <Text style={{ ...s.fieldLabel, color: '#1E40AF' }}>Orientation</Text>
                      <Text style={{ ...s.fieldValue, fontWeight: 'bold', color: '#1E40AF' }}>REQUIRED</Text>
                    </View>
                  )}
                  {compliance.badging_required && (
                    <View style={s.fieldRow}>
                      <Text style={{ ...s.fieldLabel, color: '#1E40AF' }}>Badging</Text>
                      <Text style={{ ...s.fieldValue, fontWeight: 'bold', color: '#1E40AF' }}>
                        REQUIRED {compliance.badging_type ? `(${compliance.badging_type})` : ''}
                      </Text>
                    </View>
                  )}
                  {compliance.special_instructions && (
                    <View style={{ marginTop: 2 }}>
                      <Text style={{ fontSize: 6.5, fontWeight: 'bold', color: '#1E40AF', marginBottom: 1 }}>SPECIAL INSTRUCTIONS:</Text>
                      <Text style={{ fontSize: 7.5, color: '#1E293B', lineHeight: 1.3 }}>{compliance.special_instructions}</Text>
                    </View>
                  )}
                </View>
              </View>
            )}

          </View>

          {/* ── COLUMN 2: Work Conditions ── */}
          <View style={s.col}>
            <View style={s.section}>
              <View style={s.sectionHeader}>
                <Text style={s.sectionTitle}>Work Conditions</Text>
              </View>
              <View style={s.sectionBody}>
                {conditionItems.map((item) => {
                  const isActive = item.key === 'inside_outside'
                    ? !!conditions[item.key]
                    : !!conditions[item.key];
                  const detail = item.detailKey && conditions[item.detailKey]
                    ? `${conditions[item.detailKey]}${item.detailSuffix || ''}`
                    : item.key === 'inside_outside' && conditions[item.key]
                      ? String(conditions[item.key])
                      : undefined;

                  return (
                    <View key={item.key} style={s.checkRow}>
                      <View style={isActive ? s.checkBoxFilled : s.checkBox}>
                        {isActive && <Text style={s.checkMark}>X</Text>}
                      </View>
                      <Text style={s.checkLabel}>{item.label}</Text>
                      {detail && <Text style={s.checkDetail}>({detail})</Text>}
                    </View>
                  );
                })}
              </View>
            </View>
          </View>

          {/* ── COLUMN 3: Equipment Req'd ── */}
          <View style={s.col}>
            <View style={s.section}>
              <View style={s.sectionHeader}>
                <Text style={s.sectionTitle}>{"Equipment Req'd"}</Text>
              </View>
              <View style={s.sectionBody}>
                {/* EVERYTHING THE OFFICE SELECTED, GROUPED BY SERVICE
                    (founder, Aug 16: "I clicked more than the equipment it
                    shows — I didn't even click wall saw or slab saw").

                    THIS is the file that printed his ticket. It read only
                    `equipment_needed` — the three items typed by hand — and
                    never touched `equipment_selections`, where the ~16 real
                    picks live (pump can, slurry ring, four core bits, push saw,
                    both handsaws, hydraulic hose, gas power pack…). So the
                    sheet showed the three typed strings and silently dropped
                    everything actually chosen, and the "Wall Saw" tick was a
                    NAME MATCH against a typed string, not a selection.

                    Shares lib/job-ticket-format with the HTML print page and
                    the crew's digital ticket, so paper and phone cannot drift.

                    ── WHY TWO NARROW COLUMNS AND NOT ONE ITEM PER LINE ──
                    Founder, Aug 16: "all equipment required is just bundled
                    together, let's make it more legible." It was one wrapped
                    paragraph — `pump can · ECD machine · slurry ring · 3" core
                    bit · 4" core bit · …` — which nobody can pick a single tool
                    out of at 7am.

                    One item per line in ONE column does not fit. MEASURED on
                    LETTER landscape against real production rows: each of the
                    three columns is 246.7pt wide, the row is as tall as its
                    tallest column, and WORK CONDITIONS is a fixed 188pt — so
                    equipment is FREE up to 188pt and costs page height beyond
                    it, against 14pt of page-1 slack on the tightest real jobs
                    (TEST-2026-000103, JOB-2026-160762).

                    Three layouts, measured on the worst real job (23 picks
                    across 4 services, TEST-2026-000103):
                      one column, one per line ........ ~250pt → page two
                      two columns split PER SERVICE ... 210pt  → +22pt, 3pt left
                      two BALANCED columns ............ 167pt  → free, 25pt left
                    Per-service splitting loses to the ragged half-row every
                    group wastes on its last line; balancing the rows
                    continuously across both columns (layoutEquipmentColumns)
                    recovers it. All five sampled production jobs now measure
                    95–167pt, i.e. under the free 188pt, so page 1 does not
                    reflow at all.

                    THE TRADE: item text is 7.5pt rather than 8pt, and a service
                    with many picks can straddle the two columns — which is why
                    a column never ends on a heading and a column that opens
                    mid-service repeats it as "(cont.)". A very long custom item
                    wraps to a second line rather than being truncated; nothing
                    is ever dropped. */}
                {equipmentGroups.length === 0 ? (
                  <Text style={{ fontSize: 8, color: '#94A3B8', fontStyle: 'italic' }}>
                    No equipment specified
                  </Text>
                ) : (
                  <View style={s.eqCols}>
                    {equipmentColumns.map((col, ci) => (
                      <View key={ci} style={ci < equipmentColumns.length - 1 ? s.eqColFirst : s.eqColLast}>
                        {col.map((row, ri) =>
                          row.kind === 'heading' ? (
                            <Text
                              key={ri}
                              style={ri === 0 ? s.eqGroupTitleFirst : s.eqGroupTitle}
                            >
                              {row.text}
                            </Text>
                          ) : (
                            <Text key={ri} style={s.eqItem}>{`• ${row.text}`}</Text>
                          )
                        )}
                      </View>
                    ))}
                  </View>
                )}
              </View>
            </View>
          </View>
        </View>

        {/* ═══ PPE REQUIRED ═══ */}
        {job.ppe_required && job.ppe_required.length > 0 && (
          <View style={{ border: '1 solid #F59E0B', borderRadius: 3, marginBottom: 5, overflow: 'hidden' }}>
            <View style={{ backgroundColor: '#FEF3C7', paddingHorizontal: 6, paddingVertical: 3, borderBottom: '0.75 solid #F59E0B', flexDirection: 'row', alignItems: 'center' }}>
              <Text style={{ fontSize: 7.5, fontWeight: 'bold', color: '#92400E', textTransform: 'uppercase', letterSpacing: 0.5 }}>PPE REQUIRED</Text>
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', padding: 5 }}>
              {asArray<string>(job.ppe_required).map((item, i) => {
                const gloveMatch = item.match(/^gloves_cut_(\d)$/);
                const label = gloveMatch
                  ? `Gloves Cut Level ${gloveMatch[1]}`
                  : item.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase());
                return (
                  <View key={i} style={{ backgroundColor: '#FFF3CD', borderRadius: 3, paddingHorizontal: 6, paddingVertical: 2, marginRight: 4, marginBottom: 3, borderWidth: 0.75, borderColor: '#F59E0B' }}>
                    <Text style={{ fontSize: 7.5, fontWeight: 'bold', color: '#92400E' }}>{label}</Text>
                  </View>
                );
              })}
            </View>
          </View>
        )}

        {/* ═══ SCOPE TABLE ═══ */}
        {scopeRows.length > 0 && (
          <View style={s.scopeTable}>
            <View style={s.scopeHeaderRow}>
              <Text style={{ ...s.scopeHeaderCell, width: 100 }}>Type</Text>
              <Text style={{ ...s.scopeHeaderCell, width: 60 }}>Quantity</Text>
              <Text style={{ ...s.scopeHeaderCell, width: 100 }}>Footage/Diameter</Text>
              <Text style={{ ...s.scopeHeaderCell, width: 80 }}>Depth (Inches)</Text>
              <Text style={{ ...s.scopeHeaderCell, width: 120 }}>Wall/Floor & Type</Text>
              <Text style={{ ...s.scopeHeaderCell, flex: 1 }}>Notes</Text>
            </View>
            {scopeRows.map((row, i) => (
              <View key={i} style={i % 2 === 0 ? s.scopeDataRow : s.scopeDataRowAlt}>
                <Text style={{ ...s.scopeCell, width: 100, fontWeight: 'bold' }}>{row.type}</Text>
                <Text style={{ ...s.scopeCell, width: 60 }}>{row.qty}</Text>
                <Text style={{ ...s.scopeCell, width: 100 }}>{row.footage}</Text>
                <Text style={{ ...s.scopeCell, width: 80 }}>{row.depth}</Text>
                <Text style={{ ...s.scopeCell, width: 120 }}>{row.wallFloor}</Text>
                <Text style={{ ...s.scopeCell, flex: 1 }}>{row.notes}</Text>
              </View>
            ))}
          </View>
        )}

        {/* ═══ JOB DESCRIPTION ═══ */}
        {job.description && (
          <View style={s.textBlock}>
            <Text style={s.textBlockLabel}>Job Description</Text>
            <Text style={s.textBlockValue}>{job.description}</Text>
          </View>
        )}

        {/* ═══ DIRECTIONS ═══ */}
        {job.directions && (
          <View style={s.textBlock}>
            <Text style={s.textBlockLabel}>Directions</Text>
            <Text style={s.textBlockValue}>{job.directions}</Text>
          </View>
        )}

        {/* ═══ ADDITIONAL INFO ═══ */}
        {job.additional_info && (
          <View style={s.textBlock}>
            <Text style={s.textBlockLabel}>Additional Notes</Text>
            <Text style={s.textBlockValue}>{job.additional_info}</Text>
          </View>
        )}

        {/* ═══ BLANK NOTES LINES ═══ */}
        <View style={s.notesSection}>
          <Text style={s.notesTitle}>Field Notes</Text>
          {Array.from({ length: 6 }).map((_, i) => (
            <View key={i} style={s.notesLine} />
          ))}
        </View>


      </Page>

      {/* ═══ PHOTO PAGES (page 2 onward) ═══
          Founder, Aug 16: "if I add photos allow me to print those off as well
          along with the ticket — I know it will be more than 1 page and that's
          fine."

          These are ADDITIONAL Pages, deliberately not part of page 1's flow:
          the ticket is what the customer signs, and it must look identical
          whether or not anybody attached a photo. Page 1 above is untouched by
          this block.

          Bytes are inlined by the route before render (lib/job-ticket-photos):
          react-pdf's <Image> will take a URL, but a slow host stalls
          renderToBuffer and an expired signed URL throws — either of which
          would cost the crew the whole ticket over a decorative photo. */}
      {photoPages.map((photos, pageIndex) => (
        <Page key={pageIndex} size="LETTER" orientation="landscape" style={s.photoPage}>
          <View style={s.photoHeader}>
            <Text style={s.photoHeaderTitle}>
              {`${job.job_number} — PHOTOS`}
            </Text>
            <Text style={s.photoHeaderMeta}>
              {`${job.customer_name}  |  Page ${pageIndex + 1} of ${photoPages.length}`}
            </Text>
          </View>
          {/* Four to a page in a 2 × 2 grid — except a page with only one or
              two (always the last one), which uses the full height. */}
          {(photos.length <= 2 ? [photos] : [photos.slice(0, 2), photos.slice(2, 4)]).map(
            (row, rowIndex) => {
              const tall = photos.length <= 2;
              const solo = tall && row.length === 1;
              return row.length === 0 ? null : (
                <View key={rowIndex} style={tall ? s.photoRowTall : s.photoRow}>
                  {row.map((photo, i) => {
                    const cell = solo
                      ? s.photoCellTallSolo
                      : tall
                        ? (i === 0 && row.length > 1 ? s.photoCellTallFirst : s.photoCellTall)
                        : (i === 0 && row.length > 1 ? s.photoCellFirst : s.photoCell);
                    return (
                      <View key={i} style={cell}>
                        <View style={tall ? s.photoFrameTall : s.photoFrame}>
                          <Image style={s.photoImage} src={photo.dataUri} />
                        </View>
                        <Text style={s.photoCaption}>{photo.caption}</Text>
                      </View>
                    );
                  })}
                </View>
              );
            }
          )}
        </Page>
      ))}
    </Document>
  );
}
