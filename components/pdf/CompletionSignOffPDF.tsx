import React from 'react';
import { Document, Page, Text, View, StyleSheet, Image } from '@react-pdf/renderer';

// ── Styles ──────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  page: {
    padding: 28,
    fontSize: 8.5,
    fontFamily: 'Helvetica',
    flexDirection: 'column',
    backgroundColor: '#FFFFFF',
  },

  // ── Header ─────────────────────────────────────────────────────────────────
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
    paddingBottom: 8,
    borderBottom: '2 solid #1E293B',
  },
  headerLeft: { flex: 1 },
  companyName: { fontSize: 14, fontWeight: 'bold', color: '#1E293B' },
  companyTagline: { fontSize: 7.5, color: '#64748B', marginTop: 2 },
  headerRight: { alignItems: 'flex-end' },
  docTitle: { fontSize: 16, fontWeight: 'bold', color: '#1E293B' },
  docSubtitle: { fontSize: 8, color: '#64748B', marginTop: 2 },

  // ── Meta row ───────────────────────────────────────────────────────────────
  metaRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  metaBox: {
    flex: 1,
    border: '0.75 solid #CBD5E1',
    borderRadius: 3,
    padding: 6,
  },
  metaLabel: {
    fontSize: 6.5,
    fontWeight: 'bold',
    color: '#94A3B8',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 2,
  },
  metaValue: { fontSize: 8.5, color: '#1E293B', fontWeight: 'bold' },
  metaValueSm: { fontSize: 8, color: '#334155' },

  // ── Section card ───────────────────────────────────────────────────────────
  section: {
    border: '0.75 solid #CBD5E1',
    borderRadius: 3,
    marginBottom: 8,
    overflow: 'hidden',
  },
  sectionHeader: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderBottom: '0.75 solid #CBD5E1',
  },
  sectionTitle: {
    fontSize: 7.5,
    fontWeight: 'bold',
    color: '#334155',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  sectionBody: { padding: 8 },
  sectionText: { fontSize: 8.5, color: '#1E293B', lineHeight: 1.5 },

  // ── Work items table ────────────────────────────────────────────────────────
  tableHeaderRow: {
    flexDirection: 'row',
    backgroundColor: '#F8FAFC',
    borderBottom: '0.75 solid #CBD5E1',
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  tableRow: {
    flexDirection: 'row',
    borderBottom: '0.5 solid #E2E8F0',
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  tableRowAlt: {
    flexDirection: 'row',
    borderBottom: '0.5 solid #E2E8F0',
    paddingHorizontal: 8,
    paddingVertical: 5,
    backgroundColor: '#FAFAFA',
  },
  tableColQty: { width: 55, fontSize: 7.5, color: '#334155' },
  tableColItem: { flex: 1, fontSize: 7.5, color: '#334155' },
  tableColDesc: { flex: 2, fontSize: 7.5, color: '#334155' },
  tableHeaderText: { fontSize: 7, fontWeight: 'bold', color: '#64748B', textTransform: 'uppercase' },

  // ── Disclaimer ─────────────────────────────────────────────────────────────
  disclaimerSection: {
    border: '0.75 solid #CBD5E1',
    borderRadius: 3,
    marginBottom: 8,
    overflow: 'hidden',
    backgroundColor: '#FFFBEB',
  },
  disclaimerHeader: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderBottom: '0.75 solid #FDE68A',
  },
  disclaimerTitle: {
    fontSize: 7.5,
    fontWeight: 'bold',
    color: '#92400E',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  disclaimerBody: { padding: 8 },
  disclaimerText: { fontSize: 7.5, color: '#78350F', lineHeight: 1.6 },
  disclaimerPara: { marginBottom: 5 },

  // ── Signature block ─────────────────────────────────────────────────────────
  signatureSection: {
    border: '0.75 solid #CBD5E1',
    borderRadius: 3,
    marginBottom: 8,
    overflow: 'hidden',
  },
  signatureRow: {
    flexDirection: 'row',
    gap: 12,
    padding: 8,
    alignItems: 'flex-start',
  },
  sigBox: { flex: 1 },
  sigLabel: { fontSize: 6.5, fontWeight: 'bold', color: '#94A3B8', textTransform: 'uppercase', marginBottom: 3 },
  sigImage: { width: '100%', height: 60, border: '0.5 solid #E2E8F0', borderRadius: 2 },
  sigImageEmpty: {
    width: '100%',
    height: 60,
    border: '0.5 solid #E2E8F0',
    borderRadius: 2,
    backgroundColor: '#F8FAFC',
  },
  sigName: { fontSize: 9, color: '#1E293B', fontWeight: 'bold', marginTop: 3 },
  sigDate: { fontSize: 7.5, color: '#64748B', marginTop: 1 },

  // ── Footer ─────────────────────────────────────────────────────────────────
  footer: {
    marginTop: 'auto',
    borderTop: '0.75 solid #CBD5E1',
    paddingTop: 5,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  footerText: { fontSize: 7, color: '#94A3B8' },
});

// ── Types ────────────────────────────────────────────────────────────────────
export interface WorkItem {
  type?: string;
  description?: string;
  quantity?: string | number;
  unit?: string;
  depth?: string | number;
  notes?: string;
}

export interface CompletionPDFData {
  job_number: string;
  customer_name: string;
  address?: string;
  location?: string;
  scheduled_date?: string;
  description?: string;
  scope_of_work?: string;
  operator_name?: string;
  helper_name?: string;
  work_performed: WorkItem[];
  signer_name?: string;
  signature_data_url?: string;
  signed_at?: string;
  company_name?: string;
  company_address?: string;
  company_phone?: string;
}

const DISCLAIMER_PARAGRAPHS = [
  'Patriot Concrete Cutting assumes no responsibility for layout, water damage, embedments, or buried utilities. I agree that the work described above has been completed satisfactorily.',
  'Patriot Concrete Cutting will not be liable for any reinforcement, utilities, or other obstructions that are damaged and are outside the capabilities of our equipment to detect. This includes but is not limited to: obstructions below the concrete on a slab on grade; low voltage or low current power lines not currently under load; any obstruction in newly poured concrete.',
  'By signing below, the customer acknowledges that they have reviewed the scope of work and work performed above, and that the work has been completed to their satisfaction. Any claims or disputes must be reported within 48 hours of job completion. This signature authorizes Patriot Concrete Cutting to invoice for services rendered.',
];

function formatWorkItemRow(item: WorkItem): { qty: string; itemType: string; desc: string } {
  const qty = item.quantity != null ? String(item.quantity) : '';
  const unit = item.unit || '';
  const depth = item.depth != null ? `${item.depth}" depth` : '';
  const qtyStr = [qty, unit].filter(Boolean).join(' ');
  const itemType = item.type || 'Work Item';
  const descParts = [item.description, depth, item.notes].filter(Boolean);
  return {
    qty: qtyStr || '—',
    itemType,
    desc: descParts.join(' • ') || '—',
  };
}

function formatDate(dateStr?: string): string {
  if (!dateStr) return new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  try {
    return new Date(dateStr).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  } catch {
    return dateStr;
  }
}

// ── PDF Document Component ───────────────────────────────────────────────────
export default function CompletionSignOffPDF({ data }: { data: CompletionPDFData }) {
  const companyName = data.company_name || 'Patriot Concrete Cutting';
  const companyAddr = data.company_address || '';
  const companyPhone = data.company_phone || '';
  const jobLocation = data.address || data.location || '';
  const technicianLine = [data.operator_name, data.helper_name].filter(Boolean).join(', ');
  const dateOfWork = formatDate(data.scheduled_date);
  const signedAtFormatted = data.signed_at
    ? new Date(data.signed_at).toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
    : formatDate();

  return (
    <Document>
      <Page size="LETTER" style={s.page}>
        {/* ── Header ─────────────────────────────────────────────────────────── */}
        <View style={s.headerRow}>
          <View style={s.headerLeft}>
            <Text style={s.companyName}>{companyName}</Text>
            {companyAddr ? <Text style={s.companyTagline}>{companyAddr}</Text> : null}
            {companyPhone ? <Text style={s.companyTagline}>{companyPhone}</Text> : null}
          </View>
          <View style={s.headerRight}>
            <Text style={s.docTitle}>JOB COMPLETION</Text>
            <Text style={s.docSubtitle}>Sign-Off Document</Text>
          </View>
        </View>

        {/* ── Meta row ───────────────────────────────────────────────────────── */}
        <View style={s.metaRow}>
          <View style={s.metaBox}>
            <Text style={s.metaLabel}>Job Number</Text>
            <Text style={s.metaValue}>{data.job_number}</Text>
          </View>
          <View style={s.metaBox}>
            <Text style={s.metaLabel}>Customer</Text>
            <Text style={s.metaValueSm}>{data.customer_name}</Text>
          </View>
          <View style={s.metaBox}>
            <Text style={s.metaLabel}>Date of Work</Text>
            <Text style={s.metaValueSm}>{dateOfWork}</Text>
          </View>
          <View style={s.metaBox}>
            <Text style={s.metaLabel}>Technicians</Text>
            <Text style={s.metaValueSm}>{technicianLine || '—'}</Text>
          </View>
        </View>

        {/* Location */}
        {jobLocation ? (
          <View style={[s.section, { marginBottom: 8 }]}>
            <View style={s.sectionHeader}>
              <Text style={s.sectionTitle}>Job Location</Text>
            </View>
            <View style={s.sectionBody}>
              <Text style={s.sectionText}>{jobLocation}</Text>
            </View>
          </View>
        ) : null}

        {/* ── Work Ordered (scope) ────────────────────────────────────────────── */}
        {(data.scope_of_work || data.description) ? (
          <View style={s.section}>
            <View style={s.sectionHeader}>
              <Text style={s.sectionTitle}>Work Ordered</Text>
            </View>
            <View style={s.sectionBody}>
              <Text style={s.sectionText}>{data.scope_of_work || data.description}</Text>
            </View>
          </View>
        ) : null}

        {/* ── Work Performed (table) ──────────────────────────────────────────── */}
        <View style={s.section}>
          <View style={s.sectionHeader}>
            <Text style={s.sectionTitle}>Work Performed</Text>
          </View>
          {/* Table header */}
          <View style={s.tableHeaderRow}>
            <Text style={[s.tableColQty, s.tableHeaderText]}>Quantity</Text>
            <Text style={[s.tableColItem, s.tableHeaderText]}>Item</Text>
            <Text style={[s.tableColDesc, s.tableHeaderText]}>Description</Text>
          </View>
          {/* Table rows */}
          {data.work_performed.length > 0 ? (
            data.work_performed.map((item, idx) => {
              const row = formatWorkItemRow(item);
              const rowStyle = idx % 2 === 0 ? s.tableRow : s.tableRowAlt;
              return (
                <View key={idx} style={rowStyle}>
                  <Text style={s.tableColQty}>{row.qty}</Text>
                  <Text style={s.tableColItem}>{row.itemType}</Text>
                  <Text style={s.tableColDesc}>{row.desc}</Text>
                </View>
              );
            })
          ) : (
            <View style={s.sectionBody}>
              <Text style={[s.sectionText, { color: '#94A3B8' }]}>No individual work items recorded.</Text>
            </View>
          )}
        </View>

        {/* ── Disclaimer ─────────────────────────────────────────────────────── */}
        <View style={s.disclaimerSection}>
          <View style={s.disclaimerHeader}>
            <Text style={s.disclaimerTitle}>Acknowledgement &amp; Disclaimer</Text>
          </View>
          <View style={s.disclaimerBody}>
            {DISCLAIMER_PARAGRAPHS.map((para, i) => (
              <Text key={i} style={[s.disclaimerText, s.disclaimerPara]}>{para}</Text>
            ))}
          </View>
        </View>

        {/* ── Signature block ────────────────────────────────────────────────── */}
        <View style={s.signatureSection}>
          <View style={s.sectionHeader}>
            <Text style={s.sectionTitle}>Customer Signature</Text>
          </View>
          <View style={s.signatureRow}>
            {/* Signature image */}
            <View style={s.sigBox}>
              <Text style={s.sigLabel}>Signature</Text>
              {data.signature_data_url ? (
                <Image style={s.sigImage} src={data.signature_data_url} />
              ) : (
                <View style={s.sigImageEmpty} />
              )}
            </View>
            {/* Name / date */}
            <View style={s.sigBox}>
              <Text style={s.sigLabel}>Accepted By</Text>
              <Text style={s.sigName}>{data.signer_name || '(Signature on file)'}</Text>
              <Text style={s.sigDate}>Signed: {signedAtFormatted}</Text>
              <Text style={[s.sigDate, { marginTop: 6, color: '#475569' }]}>
                By signing this document electronically, the signer agrees that this electronic signature is the legal equivalent of their manual signature.
              </Text>
            </View>
          </View>
        </View>

        {/* ── Footer ─────────────────────────────────────────────────────────── */}
        <View style={s.footer}>
          <Text style={s.footerText}>{companyName} — Job Completion Sign-Off</Text>
          <Text style={s.footerText}>Generated: {new Date().toLocaleString()}</Text>
        </View>
      </Page>
    </Document>
  );
}
