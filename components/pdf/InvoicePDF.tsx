import React from 'react';
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import { PDFBranding } from './DispatchTicketPDF';

// ── Interfaces ──────────────────────────────────────────────
export interface InvoiceLineItem {
  description: string;
  quantity: number;
  rate: number;
  amount: number;
}

export interface InvoicePDFData {
  invoice_number: string;
  invoice_date: string;
  due_date: string;
  po_number?: string;
  job_number?: string;
  job_name?: string;
  job_location?: string;
  work_completed_date?: string;
  sales_person?: string;
  customer_name: string;
  customer_address?: string;
  customer_contact?: string;
  customer_phone?: string;
  customer_email?: string;
  line_items: InvoiceLineItem[];
  subtotal: number;
  tax_rate: number;
  tax_amount: number;
  total: number;
  notes?: string;
  payment_terms?: string;
}

// ── Styles ──────────────────────────────────────────────────
const createStyles = (primaryColor: string) =>
  StyleSheet.create({
    page: {
      padding: 40,
      fontSize: 9,
      fontFamily: 'Helvetica',
      backgroundColor: '#FFFFFF',
    },

    // Header
    headerBar: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      marginBottom: 24,
      paddingBottom: 16,
      borderBottom: `2 solid ${primaryColor}`,
    },
    companyBlock: {
      flex: 1,
    },
    companyName: {
      fontSize: 16,
      fontWeight: 'bold',
      color: primaryColor,
      marginBottom: 3,
    },
    companyDetail: {
      fontSize: 8,
      color: '#64748B',
      marginBottom: 1,
    },
    invoiceTitle: {
      fontSize: 28,
      fontWeight: 'bold',
      color: primaryColor,
      textAlign: 'right',
    },
    invoiceMeta: {
      fontSize: 9,
      color: '#475569',
      textAlign: 'right',
      marginTop: 2,
    },

    // Bill To / Invoice Info two-column
    infoRow: {
      flexDirection: 'row',
      gap: 30,
      marginBottom: 20,
    },
    infoCol: {
      flex: 1,
    },
    infoLabel: {
      fontSize: 8,
      fontWeight: 'bold',
      color: primaryColor,
      textTransform: 'uppercase',
      letterSpacing: 1,
      marginBottom: 6,
    },
    infoText: {
      fontSize: 9,
      color: '#1E293B',
      marginBottom: 2,
      lineHeight: 1.4,
    },
    infoTextBold: {
      fontSize: 10,
      fontWeight: 'bold',
      color: '#1E293B',
      marginBottom: 2,
    },
    infoDetailRow: {
      flexDirection: 'row',
      marginBottom: 3,
    },
    infoDetailLabel: {
      fontSize: 8,
      fontWeight: 'bold',
      color: '#64748B',
      width: 80,
    },
    infoDetailValue: {
      fontSize: 9,
      color: '#1E293B',
      flex: 1,
    },

    // Job Details bar
    jobBar: {
      backgroundColor: '#F1F5F9',
      borderRadius: 4,
      padding: 10,
      marginBottom: 20,
      flexDirection: 'row',
      gap: 20,
    },
    jobField: {
      flex: 1,
    },
    jobFieldLabel: {
      fontSize: 7,
      fontWeight: 'bold',
      color: '#64748B',
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginBottom: 2,
    },
    jobFieldValue: {
      fontSize: 9,
      color: '#1E293B',
      fontWeight: 'bold',
    },

    // Line Items Table
    table: {
      marginBottom: 20,
    },
    tableHeader: {
      flexDirection: 'row',
      backgroundColor: primaryColor,
      borderTopLeftRadius: 4,
      borderTopRightRadius: 4,
      paddingVertical: 8,
      paddingHorizontal: 10,
    },
    tableHeaderCell: {
      fontSize: 8,
      fontWeight: 'bold',
      color: '#FFFFFF',
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    tableRow: {
      flexDirection: 'row',
      paddingVertical: 8,
      paddingHorizontal: 10,
      borderBottom: '0.5 solid #E2E8F0',
    },
    tableRowAlt: {
      flexDirection: 'row',
      paddingVertical: 8,
      paddingHorizontal: 10,
      borderBottom: '0.5 solid #E2E8F0',
      backgroundColor: '#F8FAFC',
    },
    tableCell: {
      fontSize: 9,
      color: '#334155',
    },
    tableCellBold: {
      fontSize: 9,
      color: '#1E293B',
      fontWeight: 'bold',
    },
    colDescription: { flex: 3 },
    colQty: { width: 60, textAlign: 'right' },
    colRate: { width: 80, textAlign: 'right' },
    colAmount: { width: 80, textAlign: 'right' },

    // Totals
    totalsContainer: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      marginBottom: 24,
    },
    totalsBox: {
      width: 240,
    },
    totalsRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingVertical: 4,
      paddingHorizontal: 10,
    },
    totalsLabel: {
      fontSize: 9,
      color: '#64748B',
    },
    totalsValue: {
      fontSize: 9,
      color: '#1E293B',
      fontWeight: 'bold',
    },
    totalsFinalRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingVertical: 8,
      paddingHorizontal: 10,
      borderTop: `2 solid ${primaryColor}`,
      marginTop: 4,
    },
    totalsFinalLabel: {
      fontSize: 12,
      fontWeight: 'bold',
      color: primaryColor,
    },
    totalsFinalValue: {
      fontSize: 12,
      fontWeight: 'bold',
      color: primaryColor,
    },

    // Notes
    notesSection: {
      marginBottom: 24,
      padding: 12,
      backgroundColor: '#F8FAFC',
      borderRadius: 4,
      borderLeft: `3 solid ${primaryColor}`,
    },
    notesLabel: {
      fontSize: 8,
      fontWeight: 'bold',
      color: '#64748B',
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginBottom: 4,
    },
    notesText: {
      fontSize: 9,
      color: '#334155',
      lineHeight: 1.4,
    },

    // Footer
    footer: {
      marginTop: 'auto',
      borderTop: '1 solid #E2E8F0',
      paddingTop: 12,
      alignItems: 'center',
    },
    footerTerms: {
      fontSize: 9,
      fontWeight: 'bold',
      color: primaryColor,
      marginBottom: 4,
    },
    footerContact: {
      fontSize: 8,
      color: '#94A3B8',
      marginBottom: 2,
    },
    footerThank: {
      fontSize: 10,
      color: '#64748B',
      fontWeight: 'bold',
      marginTop: 8,
    },
  });

// ── Helpers ─────────────────────────────────────────────────
function formatCurrency(amount: number): string {
  return `$${Number(amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(d?: string): string {
  if (!d) return '';
  try {
    return new Date(d + 'T00:00').toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return d;
  }
}

// ── Component ───────────────────────────────────────────────
export default function InvoicePDF({
  invoice,
  branding,
}: {
  invoice: InvoicePDFData;
  branding?: PDFBranding;
}) {
  const primaryColor = branding?.primary_color || '#7C3AED';
  const s = createStyles(primaryColor);
  const companyName = branding?.company_name || 'Patriot Concrete Cutting';
  const companyAddress = branding?.company_address || '';
  const companyPhone = branding?.company_phone || '';

  return (
    <Document>
      <Page size="LETTER" style={s.page}>
        {/* ═══ HEADER ═══ */}
        <View style={s.headerBar}>
          <View style={s.companyBlock}>
            <Text style={s.companyName}>{companyName.toUpperCase()}</Text>
            {companyAddress ? <Text style={s.companyDetail}>{companyAddress}</Text> : null}
            {companyPhone ? <Text style={s.companyDetail}>{companyPhone}</Text> : null}
          </View>
          <View>
            <Text style={s.invoiceTitle}>INVOICE</Text>
            <Text style={s.invoiceMeta}>{invoice.invoice_number}</Text>
            <Text style={s.invoiceMeta}>{formatDate(invoice.invoice_date)}</Text>
          </View>
        </View>

        {/* ═══ BILL TO / INVOICE INFO ═══ */}
        <View style={s.infoRow}>
          <View style={s.infoCol}>
            <Text style={s.infoLabel}>Bill To</Text>
            <Text style={s.infoTextBold}>{invoice.customer_name}</Text>
            {invoice.customer_address ? <Text style={s.infoText}>{invoice.customer_address}</Text> : null}
            {invoice.customer_contact ? <Text style={s.infoText}>{invoice.customer_contact}</Text> : null}
            {invoice.customer_phone ? <Text style={s.infoText}>{invoice.customer_phone}</Text> : null}
            {invoice.customer_email ? <Text style={s.infoText}>{invoice.customer_email}</Text> : null}
          </View>
          <View style={s.infoCol}>
            <Text style={s.infoLabel}>Invoice Details</Text>
            <View style={s.infoDetailRow}>
              <Text style={s.infoDetailLabel}>Invoice #</Text>
              <Text style={s.infoDetailValue}>{invoice.invoice_number}</Text>
            </View>
            <View style={s.infoDetailRow}>
              <Text style={s.infoDetailLabel}>Invoice Date</Text>
              <Text style={s.infoDetailValue}>{formatDate(invoice.invoice_date)}</Text>
            </View>
            <View style={s.infoDetailRow}>
              <Text style={s.infoDetailLabel}>Due Date</Text>
              <Text style={s.infoDetailValue}>{formatDate(invoice.due_date)}</Text>
            </View>
            {invoice.po_number ? (
              <View style={s.infoDetailRow}>
                <Text style={s.infoDetailLabel}>PO #</Text>
                <Text style={s.infoDetailValue}>{invoice.po_number}</Text>
              </View>
            ) : null}
            {invoice.job_number ? (
              <View style={s.infoDetailRow}>
                <Text style={s.infoDetailLabel}>Job #</Text>
                <Text style={s.infoDetailValue}>{invoice.job_number}</Text>
              </View>
            ) : null}
            {invoice.sales_person ? (
              <View style={s.infoDetailRow}>
                <Text style={s.infoDetailLabel}>Sales Person</Text>
                <Text style={s.infoDetailValue}>{invoice.sales_person}</Text>
              </View>
            ) : null}
          </View>
        </View>

        {/* ═══ JOB DETAILS BAR ═══ */}
        {(invoice.job_name || invoice.job_location || invoice.work_completed_date) ? (
          <View style={s.jobBar}>
            {invoice.job_name ? (
              <View style={s.jobField}>
                <Text style={s.jobFieldLabel}>Job Name</Text>
                <Text style={s.jobFieldValue}>{invoice.job_name}</Text>
              </View>
            ) : null}
            {invoice.job_location ? (
              <View style={s.jobField}>
                <Text style={s.jobFieldLabel}>Job Location</Text>
                <Text style={s.jobFieldValue}>{invoice.job_location}</Text>
              </View>
            ) : null}
            {invoice.work_completed_date ? (
              <View style={s.jobField}>
                <Text style={s.jobFieldLabel}>Work Completed</Text>
                <Text style={s.jobFieldValue}>{formatDate(invoice.work_completed_date)}</Text>
              </View>
            ) : null}
          </View>
        ) : null}

        {/* ═══ LINE ITEMS TABLE ═══ */}
        <View style={s.table}>
          {/* Table Header */}
          <View style={s.tableHeader}>
            <Text style={{ ...s.tableHeaderCell, ...s.colDescription }}>Description</Text>
            <Text style={{ ...s.tableHeaderCell, ...s.colQty }}>Qty</Text>
            <Text style={{ ...s.tableHeaderCell, ...s.colRate }}>Unit Price</Text>
            <Text style={{ ...s.tableHeaderCell, ...s.colAmount }}>Amount</Text>
          </View>

          {/* Table Rows */}
          {invoice.line_items.map((item, idx) => (
            <View key={idx} style={idx % 2 === 0 ? s.tableRow : s.tableRowAlt}>
              <Text style={{ ...s.tableCell, ...s.colDescription }}>{item.description}</Text>
              <Text style={{ ...s.tableCell, ...s.colQty }}>{item.quantity}</Text>
              <Text style={{ ...s.tableCell, ...s.colRate }}>{formatCurrency(item.rate)}</Text>
              <Text style={{ ...s.tableCellBold, ...s.colAmount }}>{formatCurrency(item.amount)}</Text>
            </View>
          ))}

          {invoice.line_items.length === 0 && (
            <View style={s.tableRow}>
              <Text style={{ ...s.tableCell, flex: 1, textAlign: 'center', color: '#94A3B8' }}>
                No line items
              </Text>
            </View>
          )}
        </View>

        {/* ═══ TOTALS ═══ */}
        <View style={s.totalsContainer}>
          <View style={s.totalsBox}>
            <View style={s.totalsRow}>
              <Text style={s.totalsLabel}>Subtotal</Text>
              <Text style={s.totalsValue}>{formatCurrency(invoice.subtotal)}</Text>
            </View>
            {invoice.tax_rate > 0 ? (
              <View style={s.totalsRow}>
                <Text style={s.totalsLabel}>Tax ({invoice.tax_rate}%)</Text>
                <Text style={s.totalsValue}>{formatCurrency(invoice.tax_amount)}</Text>
              </View>
            ) : null}
            <View style={s.totalsFinalRow}>
              <Text style={s.totalsFinalLabel}>TOTAL DUE</Text>
              <Text style={s.totalsFinalValue}>{formatCurrency(invoice.total)}</Text>
            </View>
          </View>
        </View>

        {/* ═══ NOTES ═══ */}
        {invoice.notes ? (
          <View style={s.notesSection}>
            <Text style={s.notesLabel}>Notes / Terms</Text>
            <Text style={s.notesText}>{invoice.notes}</Text>
          </View>
        ) : null}

        {/* ═══ FOOTER ═══ */}
        <View style={s.footer}>
          <Text style={s.footerTerms}>
            {invoice.payment_terms || 'Net 30'} — Payment due within {invoice.payment_terms === 'Net 15' ? '15' : invoice.payment_terms === 'Net 45' ? '45' : invoice.payment_terms === 'Net 60' ? '60' : '30'} days
          </Text>
          {companyPhone ? <Text style={s.footerContact}>{companyPhone}</Text> : null}
          {companyAddress ? <Text style={s.footerContact}>{companyAddress}</Text> : null}
          <Text style={s.footerThank}>Thank you for your business</Text>
        </View>
      </Page>
    </Document>
  );
}
