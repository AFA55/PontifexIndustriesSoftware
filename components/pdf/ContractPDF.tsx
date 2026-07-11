/**
 * ContractPDF — @react-pdf/renderer document for signed contracts and change
 * orders (lib/generate-contract-pdf.ts renders + uploads it). Mirrors the
 * CompletionSignOffPDF pattern: tenant-branded header, body sections, embedded
 * signature image, audit footer.
 */
import React from 'react';
import { Document, Page, Text, View, Image, StyleSheet } from '@react-pdf/renderer';

export interface ContractPDFData {
  doc_type: 'contract' | 'change_order';
  title: string;
  work_description?: string | null;
  terms?: string | null;
  amount?: number | null;
  customer_name: string;
  customer_email: string;
  job_number?: string | null;
  parent_title?: string | null;
  signer_name?: string | null;
  signature_data_url?: string | null;
  signed_at: string;
  company_name: string;
  company_address?: string;
  company_phone?: string;
  brand_color?: string;
}

const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 10, fontFamily: 'Helvetica', color: '#1f2937' },
  headerBar: { height: 6, marginBottom: 16, borderRadius: 3 },
  company: { fontSize: 16, fontFamily: 'Helvetica-Bold', marginBottom: 2 },
  companyMeta: { fontSize: 9, color: '#6b7280' },
  docType: { fontSize: 11, fontFamily: 'Helvetica-Bold', textTransform: 'uppercase', letterSpacing: 1.5, marginTop: 18 },
  title: { fontSize: 14, fontFamily: 'Helvetica-Bold', marginTop: 4, marginBottom: 12 },
  metaRow: { flexDirection: 'row', marginBottom: 3 },
  metaLabel: { width: 110, color: '#6b7280' },
  sectionTitle: { fontSize: 11, fontFamily: 'Helvetica-Bold', marginTop: 14, marginBottom: 5 },
  body: { lineHeight: 1.5 },
  amountBox: { marginTop: 14, padding: 10, backgroundColor: '#f9fafb', borderRadius: 4 },
  amount: { fontSize: 13, fontFamily: 'Helvetica-Bold' },
  sigBlock: { marginTop: 28, paddingTop: 14, borderTopWidth: 1, borderTopColor: '#e5e7eb' },
  sigImage: { width: 200, height: 70, objectFit: 'contain' },
  sigLine: { width: 220, borderBottomWidth: 1, borderBottomColor: '#9ca3af', marginBottom: 4 },
  footer: { position: 'absolute', bottom: 28, left: 40, right: 40, fontSize: 8, color: '#9ca3af', textAlign: 'center' },
});

export default function ContractPDF({ data }: { data: ContractPDFData }) {
  const accent = data.brand_color || '#1E3A5F';
  const signedDate = new Date(data.signed_at).toLocaleString('en-US', {
    dateStyle: 'long',
    timeStyle: 'short',
  });
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={[styles.headerBar, { backgroundColor: accent }]} />
        <Text style={styles.company}>{data.company_name}</Text>
        {!!data.company_address && <Text style={styles.companyMeta}>{data.company_address}</Text>}
        {!!data.company_phone && <Text style={styles.companyMeta}>{data.company_phone}</Text>}

        <Text style={[styles.docType, { color: accent }]}>
          {data.doc_type === 'change_order' ? 'Change Order' : 'Work Contract'}
        </Text>
        <Text style={styles.title}>{data.title}</Text>

        <View style={styles.metaRow}>
          <Text style={styles.metaLabel}>Customer</Text>
          <Text>{data.customer_name} ({data.customer_email})</Text>
        </View>
        {!!data.job_number && (
          <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>Job</Text>
            <Text>{data.job_number}</Text>
          </View>
        )}
        {!!data.parent_title && (
          <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>Amends contract</Text>
            <Text>{data.parent_title}</Text>
          </View>
        )}

        {!!data.work_description && (
          <>
            <Text style={styles.sectionTitle}>Description of Work</Text>
            <Text style={styles.body}>{data.work_description}</Text>
          </>
        )}

        {!!data.terms && (
          <>
            <Text style={styles.sectionTitle}>Terms & Conditions</Text>
            <Text style={styles.body}>{data.terms}</Text>
          </>
        )}

        {data.amount != null && (
          <View style={styles.amountBox}>
            <Text style={styles.companyMeta}>
              {data.doc_type === 'change_order' ? 'Change order amount' : 'Contract amount'}
            </Text>
            <Text style={styles.amount}>
              ${Number(data.amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </Text>
          </View>
        )}

        <View style={styles.sigBlock}>
          <Text style={styles.sectionTitle}>Accepted & Signed</Text>
          {!!data.signature_data_url && (
            /* eslint-disable-next-line jsx-a11y/alt-text */
            <Image src={data.signature_data_url} style={styles.sigImage} />
          )}
          <View style={styles.sigLine} />
          <Text>{data.signer_name || data.customer_name}</Text>
          <Text style={styles.companyMeta}>Signed electronically on {signedDate}</Text>
        </View>

        <Text style={styles.footer}>
          Electronically signed and stored by {data.company_name}. This document is a true record of the agreement.
        </Text>
      </Page>
    </Document>
  );
}
