import React from 'react';
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';

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
  companyName: { fontSize: 14, fontWeight: 'bold', color: '#1E293B' },
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
  sectionTitle: { fontSize: 7.5, fontWeight: 'bold', color: '#334155', textTransform: 'uppercase', letterSpacing: 0.5 },
  sectionBody: { padding: 5 },

  // Field rows
  fieldRow: { flexDirection: 'row', marginBottom: 2.5, alignItems: 'flex-start' },
  fieldLabel: { fontSize: 7, fontWeight: 'bold', color: '#64748B', width: 72, textTransform: 'uppercase' },
  fieldValue: { fontSize: 8, color: '#1E293B', flex: 1 },
  fieldValueBold: { fontSize: 8, fontWeight: 'bold', color: '#1E293B', flex: 1 },

  // Checkbox row for conditions
  checkRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 2 },
  checkBox: { width: 8, height: 8, border: '0.75 solid #94A3B8', borderRadius: 1, marginRight: 4, justifyContent: 'center', alignItems: 'center' },
  checkBoxFilled: { width: 8, height: 8, border: '0.75 solid #1E293B', borderRadius: 1, marginRight: 4, backgroundColor: '#1E293B', justifyContent: 'center', alignItems: 'center' },
  checkMark: { fontSize: 6, color: '#FFFFFF', fontWeight: 'bold' },
  checkLabel: { fontSize: 7, color: '#334155', flex: 1 },
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
  pdf_header_text?: string | null;
  pdf_footer_text?: string | null;
  pdf_show_logo?: boolean;
  primary_color?: string;
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
  equipment_rentals?: string[];
  scope_details?: Record<string, any>;
  site_compliance?: Record<string, any>;
  jobsite_conditions?: Record<string, any>;
  additional_info?: string;
  job_difficulty_rating?: number;
  permit_required?: boolean;
  permits?: { type: string; details?: string }[];
  is_multi_day?: boolean;
  total_days_worked?: number;
  scheduling_flexibility?: Record<string, any>;
  directions?: string;
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
  const difficulty = job.job_difficulty_rating || 0;

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
  const equipmentItems: { label: string }[] = [
    { label: 'Wall Saw' },
    { label: 'Core Rig(s)/Type' },
    { label: 'Floor Saws/Type' },
    { label: 'Hand Saws/Type' },
    { label: 'Chain Saw/Type' },
    { label: 'Scaffold/Lift' },
    { label: 'Heavy Equip' },
    { label: 'Power Pack/Type' },
    { label: 'Special Vac' },
    { label: 'Grinders' },
    { label: 'Chippers/Breakers' },
    { label: 'Fall Prot Equip' },
    { label: 'Rigging Equip' },
  ];

  // Try to match equipment_needed items to checklist
  const equipNeeded = (job.equipment_needed || []).map(e => e.toLowerCase());
  const isEquipmentChecked = (label: string) => {
    const lower = label.toLowerCase();
    return equipNeeded.some(e =>
      e.includes('wall') && lower.includes('wall') ||
      e.includes('core') && lower.includes('core') ||
      e.includes('floor') && lower.includes('floor') ||
      e.includes('hand') && lower.includes('hand') ||
      e.includes('chain') && lower.includes('chain') ||
      e.includes('scaffold') && lower.includes('scaffold') ||
      e.includes('vac') && lower.includes('vac') ||
      e.includes('grind') && lower.includes('grind') ||
      e.includes('chip') && lower.includes('chip') ||
      e.includes('break') && lower.includes('break') ||
      e.includes('rigg') && lower.includes('rigg') ||
      e.includes('fall') && lower.includes('fall') ||
      e.includes('power') && lower.includes('power') && !lower.includes('available') ||
      e === lower
    );
  };

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
          const cuts = JSON.parse(entry.cuts) as { linear_feet?: string; depth?: string; num_cuts?: string }[];
          cuts.forEach((cut, idx) => {
            scopeRows.push({
              type: cuts.length > 1 ? `${label} (cut ${idx + 1})` : label,
              qty: cut.num_cuts || '—',
              footage: cut.linear_feet ? `${cut.linear_feet} LF` : '—',
              depth: cut.depth ? `${cut.depth}"` : '—',
              wallFloor: entry.wall_floor_type || entry.material || '—',
              notes: entry.notes || '—',
            });
          });
        } catch { /* skip malformed */ }
        continue;
      }

      // Core drilling — parse holes array
      if (entry.holes) {
        try {
          const holes = JSON.parse(entry.holes) as { qty?: string; bit_size?: string; depth?: string }[];
          holes.forEach((hole, idx) => {
            scopeRows.push({
              type: holes.length > 1 ? `${label} (set ${idx + 1})` : label,
              qty: hole.qty || '—',
              footage: hole.bit_size ? `${hole.bit_size}" dia` : '—',
              depth: hole.depth ? `${hole.depth}"` : '—',
              wallFloor: entry.material || entry.wall_floor_type || '—',
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
        wallFloor: entry.material || entry.wall_floor_type || '—',
        notes: noteParts.join(' | ') || entry.notes || '—',
      });
    }
  }

  return (
    <Document>
      <Page size="LETTER" orientation="landscape" style={s.page}>

        {/* ═══ HEADER ═══ */}
        <View style={s.headerRow}>
          <View>
            <Text style={s.companyName}>{(branding?.company_name || 'PATRIOT CONCRETE CUTTING').toUpperCase()}</Text>
            <Text style={s.companyAddress}>{branding?.company_address || 'P.O Box 504, Piedmont, SC 29673'}</Text>
            <Text style={s.companyPhone}>{branding?.company_phone || 'Phone: 864-299-0330  |  Fax: 864-299-1532'}</Text>
          </View>
          <View style={s.headerCenter}>
            <Text style={s.jobTicketTitle}>JOB TICKET</Text>
            <Text style={{ fontSize: 7, color: '#64748B', marginTop: 1 }}>Printed: {today}</Text>
          </View>
          <View style={s.headerRight}>
            <Text style={s.employeesLabel}>Employees:</Text>
            <Text style={s.employeeLine}>{job.operator_name || '________________________'}</Text>
            <Text style={s.employeeLine}>{job.helper_name || '________________________'}</Text>
            {job.is_multi_day && (
              <Text style={{ fontSize: 7, color: '#7C3AED', fontWeight: 'bold', marginTop: 2 }}>
                MULTI-DAY - Day {(job.total_days_worked || 0) + 1}
              </Text>
            )}
          </View>
        </View>

        {/* ═══ PERMIT BANNER ═══ */}
        {job.permit_required && job.permits && job.permits.length > 0 && (
          <View style={s.permitBanner}>
            <Text style={s.permitLabel}>PERMITS REQUIRED:</Text>
            <Text style={s.permitText}>
              {job.permits.map(p => {
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
                {job.estimated_hours && (
                  <View style={s.fieldRow}>
                    <Text style={s.fieldLabel}>Est. Hours</Text>
                    <Text style={s.fieldValue}>{job.estimated_hours}h</Text>
                  </View>
                )}
                <View style={s.fieldRow}>
                  <Text style={s.fieldLabel}>Job Type</Text>
                  <Text style={s.fieldValue}>{job.job_type || '—'}</Text>
                </View>
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
                {equipmentItems.map((item) => {
                  const checked = isEquipmentChecked(item.label);
                  return (
                    <View key={item.label} style={s.checkRow}>
                      <View style={checked ? s.checkBoxFilled : s.checkBox}>
                        {checked && <Text style={s.checkMark}>X</Text>}
                      </View>
                      <Text style={s.checkLabel}>{item.label}</Text>
                    </View>
                  );
                })}

                {/* List any equipment that doesn't match the standard checklist */}
                {job.equipment_needed && job.equipment_needed.length > 0 && (
                  <View style={{ marginTop: 4, borderTop: '0.5 solid #E2E8F0', paddingTop: 3 }}>
                    <Text style={{ fontSize: 6.5, fontWeight: 'bold', color: '#64748B', marginBottom: 2 }}>SPECIFIED:</Text>
                    <Text style={{ fontSize: 7.5, color: '#1E293B' }}>
                      {job.equipment_needed.join(', ')}
                    </Text>
                  </View>
                )}

                {/* Rentals */}
                {job.equipment_rentals && job.equipment_rentals.length > 0 && (
                  <View style={{ marginTop: 4, borderTop: '0.5 solid #E2E8F0', paddingTop: 3 }}>
                    <Text style={{ fontSize: 6.5, fontWeight: 'bold', color: '#DC2626', marginBottom: 2 }}>RENTALS:</Text>
                    <Text style={{ fontSize: 7.5, color: '#DC2626' }}>
                      {job.equipment_rentals.join(', ')}
                    </Text>
                  </View>
                )}

                {/* Special equipment */}
                <View style={{ marginTop: 4, borderTop: '0.5 solid #E2E8F0', paddingTop: 3 }}>
                  <Text style={{ fontSize: 6.5, fontWeight: 'bold', color: '#64748B', marginBottom: 2 }}>SPECIAL EQUIP:</Text>
                  <View style={{ borderBottom: '0.5 solid #CBD5E1', height: 12 }} />
                </View>
              </View>
            </View>
          </View>
        </View>

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
    </Document>
  );
}
