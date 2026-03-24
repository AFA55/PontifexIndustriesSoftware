import React from 'react';
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import type { PDFBranding } from './DispatchTicketPDF';
import type { WeekSummary } from '@/lib/timecard-utils';

// ── Interfaces ──────────────────────────────────────────────
export interface TimecardPDFEntry {
  date: string;
  clockIn: string | null;
  clockOut: string | null;
  totalHours: number;
  category: string;
  isApproved: boolean;
}

export interface TimecardPDFProps {
  operatorName: string;
  operatorEmail: string;
  operatorRole: string;
  employeeId: string;
  weekStart: string;
  weekEnd: string;
  entries: TimecardPDFEntry[];
  summary: WeekSummary;
  branding?: PDFBranding;
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
      marginBottom: 20,
      paddingBottom: 14,
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
    titleBlock: {
      alignItems: 'flex-end' as const,
    },
    timecardTitle: {
      fontSize: 22,
      fontWeight: 'bold',
      color: primaryColor,
      textAlign: 'right',
    },
    weekRange: {
      fontSize: 10,
      color: '#475569',
      textAlign: 'right',
      marginTop: 3,
    },

    // Operator Info
    operatorSection: {
      flexDirection: 'row',
      gap: 30,
      marginBottom: 18,
    },
    operatorCol: {
      flex: 1,
    },
    sectionLabel: {
      fontSize: 8,
      fontWeight: 'bold',
      color: primaryColor,
      textTransform: 'uppercase',
      letterSpacing: 1,
      marginBottom: 6,
    },
    infoRow: {
      flexDirection: 'row',
      marginBottom: 3,
    },
    infoLabel: {
      fontSize: 8,
      fontWeight: 'bold',
      color: '#64748B',
      width: 80,
    },
    infoValue: {
      fontSize: 9,
      color: '#1E293B',
      flex: 1,
    },

    // Table
    table: {
      marginBottom: 18,
    },
    tableHeader: {
      flexDirection: 'row',
      backgroundColor: primaryColor,
      borderTopLeftRadius: 4,
      borderTopRightRadius: 4,
      paddingVertical: 7,
      paddingHorizontal: 8,
    },
    tableHeaderCell: {
      fontSize: 7.5,
      fontWeight: 'bold',
      color: '#FFFFFF',
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    tableRow: {
      flexDirection: 'row',
      paddingVertical: 7,
      paddingHorizontal: 8,
      borderBottom: '0.5 solid #E2E8F0',
    },
    tableRowAlt: {
      flexDirection: 'row',
      paddingVertical: 7,
      paddingHorizontal: 8,
      borderBottom: '0.5 solid #E2E8F0',
      backgroundColor: '#F8FAFC',
    },
    tableRowTotal: {
      flexDirection: 'row',
      paddingVertical: 8,
      paddingHorizontal: 8,
      backgroundColor: '#F1F5F9',
      borderBottomLeftRadius: 4,
      borderBottomRightRadius: 4,
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
    tableCellMuted: {
      fontSize: 9,
      color: '#94A3B8',
    },

    // Column widths
    colDate: { width: 90 },
    colDay: { width: 60 },
    colClockIn: { width: 70 },
    colClockOut: { width: 70 },
    colHours: { width: 55, textAlign: 'right' },
    colCategory: { width: 80 },
    colApproved: { flex: 1, textAlign: 'center' },

    // Hour Breakdown
    breakdownSection: {
      marginBottom: 24,
    },
    breakdownGrid: {
      flexDirection: 'row',
      gap: 12,
      marginTop: 8,
    },
    breakdownBox: {
      flex: 1,
      backgroundColor: '#F8FAFC',
      borderRadius: 4,
      padding: 10,
      borderLeft: `3 solid ${primaryColor}`,
    },
    breakdownLabel: {
      fontSize: 7,
      fontWeight: 'bold',
      color: '#64748B',
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginBottom: 3,
    },
    breakdownValue: {
      fontSize: 14,
      fontWeight: 'bold',
      color: '#1E293B',
    },
    breakdownUnit: {
      fontSize: 8,
      color: '#64748B',
      marginLeft: 2,
    },

    // Signatures
    signatureSection: {
      flexDirection: 'row',
      gap: 40,
      marginBottom: 20,
      marginTop: 10,
    },
    signatureBlock: {
      flex: 1,
    },
    signatureLine: {
      borderBottom: '1 solid #CBD5E1',
      marginBottom: 4,
      height: 30,
    },
    signatureLabel: {
      fontSize: 8,
      color: '#64748B',
      fontWeight: 'bold',
    },
    dateLine: {
      borderBottom: '1 solid #CBD5E1',
      marginBottom: 4,
      height: 20,
      marginTop: 10,
    },

    // Footer
    footer: {
      marginTop: 'auto',
      borderTop: '1 solid #E2E8F0',
      paddingTop: 10,
      alignItems: 'center',
    },
    footerText: {
      fontSize: 7.5,
      color: '#94A3B8',
    },
  });

// ── Helpers ─────────────────────────────────────────────────
function formatDateDisplay(dateStr: string): string {
  try {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

function getDayOfWeek(dateStr: string): string {
  try {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-US', { weekday: 'short' });
  } catch {
    return '';
  }
}

function formatTimeDisplay(isoString: string | null): string {
  if (!isoString) return '\u2014';
  try {
    const d = new Date(isoString);
    return d.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  } catch {
    return '\u2014';
  }
}

function formatWeekRangeDisplay(weekStart: string, weekEnd: string): string {
  try {
    const s = new Date(weekStart + 'T00:00:00').toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
    });
    const e = new Date(weekEnd + 'T00:00:00').toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
    return `${s} \u2013 ${e}`;
  } catch {
    return `${weekStart} - ${weekEnd}`;
  }
}

// ── Component ───────────────────────────────────────────────
export default function TimecardPDF({
  operatorName,
  operatorEmail,
  operatorRole,
  employeeId,
  weekStart,
  weekEnd,
  entries,
  summary,
  branding,
}: TimecardPDFProps) {
  const primaryColor = branding?.primary_color || '#1E40AF';
  const s = createStyles(primaryColor);
  const companyName = branding?.company_name || 'Patriot Concrete Cutting';
  const companyAddress = branding?.company_address || '';
  const companyPhone = branding?.company_phone || '';

  const today = new Date().toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  return (
    <Document>
      <Page size="LETTER" style={s.page}>
        {/* ═══ HEADER ═══ */}
        <View style={s.headerBar}>
          <View style={s.companyBlock}>
            <Text style={s.companyName}>{companyName.toUpperCase()}</Text>
            {companyAddress ? (
              <Text style={s.companyDetail}>{companyAddress}</Text>
            ) : null}
            {companyPhone ? (
              <Text style={s.companyDetail}>{companyPhone}</Text>
            ) : null}
          </View>
          <View style={s.titleBlock}>
            <Text style={s.timecardTitle}>WEEKLY TIMECARD</Text>
            <Text style={s.weekRange}>
              {formatWeekRangeDisplay(weekStart, weekEnd)}
            </Text>
          </View>
        </View>

        {/* ═══ OPERATOR INFO ═══ */}
        <View style={s.operatorSection}>
          <View style={s.operatorCol}>
            <Text style={s.sectionLabel}>Employee Information</Text>
            <View style={s.infoRow}>
              <Text style={s.infoLabel}>Name</Text>
              <Text style={s.infoValue}>{operatorName}</Text>
            </View>
            <View style={s.infoRow}>
              <Text style={s.infoLabel}>Email</Text>
              <Text style={s.infoValue}>{operatorEmail}</Text>
            </View>
          </View>
          <View style={s.operatorCol}>
            <Text style={s.sectionLabel}>Details</Text>
            <View style={s.infoRow}>
              <Text style={s.infoLabel}>Role</Text>
              <Text style={s.infoValue}>
                {operatorRole
                  .replace(/_/g, ' ')
                  .replace(/\b\w/g, (c) => c.toUpperCase())}
              </Text>
            </View>
            <View style={s.infoRow}>
              <Text style={s.infoLabel}>Employee ID</Text>
              <Text style={s.infoValue}>{employeeId}</Text>
            </View>
          </View>
        </View>

        {/* ═══ TIMECARD TABLE ═══ */}
        <View style={s.table}>
          {/* Table Header */}
          <View style={s.tableHeader}>
            <Text style={{ ...s.tableHeaderCell, ...s.colDate }}>Date</Text>
            <Text style={{ ...s.tableHeaderCell, ...s.colDay }}>Day</Text>
            <Text style={{ ...s.tableHeaderCell, ...s.colClockIn }}>
              Clock In
            </Text>
            <Text style={{ ...s.tableHeaderCell, ...s.colClockOut }}>
              Clock Out
            </Text>
            <Text style={{ ...s.tableHeaderCell, ...s.colHours }}>
              Total Hrs
            </Text>
            <Text style={{ ...s.tableHeaderCell, ...s.colCategory }}>
              Category
            </Text>
            <Text style={{ ...s.tableHeaderCell, ...s.colApproved }}>
              Approved
            </Text>
          </View>

          {/* Table Rows — 7 days */}
          {entries.map((entry, idx) => {
            const hasData =
              entry.totalHours > 0 || entry.clockIn !== null;
            const rowStyle = idx % 2 === 0 ? s.tableRow : s.tableRowAlt;

            return (
              <View key={idx} style={rowStyle}>
                <Text
                  style={{
                    ...(hasData ? s.tableCell : s.tableCellMuted),
                    ...s.colDate,
                  }}
                >
                  {formatDateDisplay(entry.date)}
                </Text>
                <Text
                  style={{
                    ...(hasData ? s.tableCell : s.tableCellMuted),
                    ...s.colDay,
                  }}
                >
                  {getDayOfWeek(entry.date)}
                </Text>
                <Text
                  style={{
                    ...(hasData ? s.tableCell : s.tableCellMuted),
                    ...s.colClockIn,
                  }}
                >
                  {formatTimeDisplay(entry.clockIn)}
                </Text>
                <Text
                  style={{
                    ...(hasData ? s.tableCell : s.tableCellMuted),
                    ...s.colClockOut,
                  }}
                >
                  {formatTimeDisplay(entry.clockOut)}
                </Text>
                <Text
                  style={{
                    ...(hasData ? s.tableCellBold : s.tableCellMuted),
                    ...s.colHours,
                  }}
                >
                  {hasData ? entry.totalHours.toFixed(2) : '\u2014'}
                </Text>
                <Text
                  style={{
                    ...(hasData ? s.tableCell : s.tableCellMuted),
                    ...s.colCategory,
                  }}
                >
                  {hasData ? entry.category : '\u2014'}
                </Text>
                <Text
                  style={{
                    ...(hasData ? s.tableCell : s.tableCellMuted),
                    ...s.colApproved,
                  }}
                >
                  {hasData
                    ? entry.isApproved
                      ? 'Yes'
                      : 'Pending'
                    : '\u2014'}
                </Text>
              </View>
            );
          })}

          {/* Totals Row */}
          <View style={s.tableRowTotal}>
            <Text style={{ ...s.tableCellBold, ...s.colDate }}>
              WEEKLY TOTALS
            </Text>
            <Text style={{ ...s.tableCell, ...s.colDay }} />
            <Text style={{ ...s.tableCell, ...s.colClockIn }} />
            <Text style={{ ...s.tableCell, ...s.colClockOut }} />
            <Text style={{ ...s.tableCellBold, ...s.colHours }}>
              {summary.totalHours.toFixed(2)}
            </Text>
            <Text style={{ ...s.tableCell, ...s.colCategory }}>
              {summary.daysWorked} days
            </Text>
            <Text style={{ ...s.tableCell, ...s.colApproved }} />
          </View>
        </View>

        {/* ═══ HOUR BREAKDOWN ═══ */}
        <View style={s.breakdownSection}>
          <Text style={s.sectionLabel}>Hour Breakdown</Text>
          <View style={s.breakdownGrid}>
            {[
              { label: 'Regular', value: summary.regularHours },
              { label: 'Weekly OT', value: summary.weeklyOvertimeHours },
              { label: 'Mandatory OT', value: summary.mandatoryOvertimeHours },
              { label: 'Night Shift', value: summary.nightShiftHours },
              { label: 'Shop Hours', value: summary.shopHours },
            ].map((item, idx) => (
              <View key={idx} style={s.breakdownBox}>
                <Text style={s.breakdownLabel}>{item.label}</Text>
                <Text style={s.breakdownValue}>
                  {item.value.toFixed(2)}
                  <Text style={s.breakdownUnit}> hrs</Text>
                </Text>
              </View>
            ))}
          </View>
        </View>

        {/* ═══ SIGNATURES ═══ */}
        <View style={s.signatureSection}>
          <View style={s.signatureBlock}>
            <Text style={s.sectionLabel}>Employee</Text>
            <View style={s.signatureLine} />
            <Text style={s.signatureLabel}>Signature</Text>
            <View style={s.dateLine} />
            <Text style={s.signatureLabel}>Date</Text>
          </View>
          <View style={s.signatureBlock}>
            <Text style={s.sectionLabel}>Supervisor</Text>
            <View style={s.signatureLine} />
            <Text style={s.signatureLabel}>Signature</Text>
            <View style={s.dateLine} />
            <Text style={s.signatureLabel}>Date</Text>
          </View>
        </View>

        {/* ═══ FOOTER ═══ */}
        <View style={s.footer}>
          <Text style={s.footerText}>
            Generated on {today} by {companyName}
          </Text>
        </View>
      </Page>
    </Document>
  );
}
