import React from 'react';
import { Document, Page, Text, View, Image, StyleSheet } from '@react-pdf/renderer';
import type { PDFBranding } from './DispatchTicketPDF';
import type { WeekSummary, TimecardDayEntry } from '@/lib/timecard-utils';
import {
  formatJobContextLabel,
  formatJobConflictNote,
  jobSourceNote,
  NO_JOB_RECORDED,
  JOB_LOOKUP_FAILED,
} from '@/lib/timecard-job-rules';

// ── Interfaces ──────────────────────────────────────────────
// Day rows are built by buildWeekDayEntries (lib/timecard-utils) — the alias
// keeps existing route imports working.
export type TimecardPDFEntry = TimecardDayEntry;

export interface TimecardPageProps {
  operatorName: string;
  operatorEmail: string;
  operatorRole: string;
  employeeId: string;
  weekStart: string;
  weekEnd: string;
  entries: TimecardPDFEntry[];
  summary: WeekSummary;
  branding?: PDFBranding;
  /**
   * The tenant's IANA timezone, used to print clock-in/out times.
   *
   * REQUIRED for correctness in production: this PDF renders on Vercel, which
   * runs UTC. Without it, a 7:07 AM clock-in printed as 11:07 AM and the crew's
   * timecard showed hours nobody worked.
   */
  timeZone?: string;
}

export type TimecardPDFProps = TimecardPageProps;

// ── Styles ──────────────────────────────────────────────────
const createStyles = (primaryColor: string, secondaryColor: string) =>
  StyleSheet.create({
    page: {
      padding: 40,
      // RESERVES the fixed footer's band. The footer is absolutely positioned,
      // so it is OUT of the flow and the table would otherwise run underneath
      // it: measured, a full page left only 2.6pt between the last row of hours
      // and the footer's rule. Flowing content now stops ~16pt above the band.
      // (Do NOT "fix" that clearance by raising the footer's `bottom` instead —
      // the inset is measured from the page's BORDER box, so a larger `bottom`
      // moves the footer UP into the content. At bottom:40 the rendered sheet
      // printed the rule straight through the last two rows.)
      paddingBottom: 56,
      fontSize: 9,
      fontFamily: 'Helvetica',
      backgroundColor: '#FFFFFF',
    },

    // Header — logo + company block left, document title right,
    // accent rule underneath (mirrors the completed-print ticket).
    headerBar: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      marginBottom: 10,
    },
    companyRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      flex: 1,
      paddingRight: 16,
    },
    logo: {
      height: 38,
      maxWidth: 110,
      objectFit: 'contain',
    },
    companyBlock: {
      flexShrink: 1,
    },
    companyName: {
      fontSize: 14,
      fontWeight: 'bold',
      color: '#0F172A',
      marginBottom: 2,
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
      fontSize: 18,
      fontWeight: 'bold',
      color: primaryColor,
      textAlign: 'right',
      letterSpacing: 0.5,
    },
    weekRange: {
      fontSize: 9.5,
      color: '#475569',
      textAlign: 'right',
      marginTop: 3,
    },
    headerEmployee: {
      fontSize: 9.5,
      fontWeight: 'bold',
      color: '#0F172A',
      textAlign: 'right',
      marginTop: 2,
    },
    accentRule: {
      height: 3,
      backgroundColor: primaryColor,
    },
    accentRuleSecondary: {
      height: 1.5,
      backgroundColor: secondaryColor,
      marginTop: 1,
      marginBottom: 14,
    },

    // Employee Info
    operatorSection: {
      flexDirection: 'row',
      gap: 30,
      marginBottom: 14,
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
      marginBottom: 4,
      paddingBottom: 2,
      borderBottom: `1.5 solid ${primaryColor}`,
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
      marginBottom: 14,
    },
    tableHeader: {
      flexDirection: 'row',
      backgroundColor: primaryColor,
      paddingVertical: 6,
      paddingHorizontal: 8,
    },
    tableHeaderCell: {
      fontSize: 7.5,
      fontWeight: 'bold',
      color: '#FFFFFF',
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    // A day is a BLOCK, not a row: the cells on one line, and the jobs the
    // person was on underneath. `wrap={false}` on the block keeps a day's job
    // names with the hours they belong to when the table crosses a page.
    dayBlock: {
      paddingVertical: 5,
      paddingHorizontal: 8,
      borderBottom: '0.5 solid #E2E8F0',
    },
    dayBlockAlt: {
      paddingVertical: 5,
      paddingHorizontal: 8,
      borderBottom: '0.5 solid #E2E8F0',
      backgroundColor: '#F8FAFC',
    },
    cellRow: {
      flexDirection: 'row',
    },
    jobLine: {
      fontSize: 7,
      color: '#475569',
      marginTop: 2,
    },
    jobLineQualifier: {
      fontSize: 6.5,
      color: '#94A3B8',
    },
    jobLineMuted: {
      fontSize: 7,
      color: '#94A3B8',
      fontStyle: 'italic',
      marginTop: 2,
    },
    jobLineWarn: {
      fontSize: 6.5,
      color: '#B45309',
      marginTop: 2,
    },
    tableRowTotal: {
      flexDirection: 'row',
      paddingVertical: 7,
      paddingHorizontal: 8,
      backgroundColor: '#F1F5F9',
      borderTop: `1.5 solid ${primaryColor}`,
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
    colCategory: { width: 110, paddingLeft: 14 },
    colApproved: { flex: 1, textAlign: 'center' },

    // Hour Breakdown
    breakdownSection: {
      marginBottom: 18,
    },
    breakdownGrid: {
      flexDirection: 'row',
      gap: 8,
      marginTop: 8,
    },
    breakdownBox: {
      flex: 1,
      backgroundColor: '#F8FAFC',
      borderRadius: 3,
      padding: 8,
      borderLeft: `3 solid ${primaryColor}`,
    },
    breakdownLabel: {
      fontSize: 6.5,
      fontWeight: 'bold',
      color: '#64748B',
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginBottom: 3,
    },
    breakdownValue: {
      fontSize: 13,
      fontWeight: 'bold',
      color: '#1E293B',
    },
    breakdownNote: {
      fontSize: 6.5,
      color: '#94A3B8',
      marginTop: 5,
    },
    breakdownUnit: {
      fontSize: 7.5,
      color: '#64748B',
      marginLeft: 2,
    },

    // Signatures
    signatureSection: {
      flexDirection: 'row',
      gap: 40,
      marginBottom: 16,
      marginTop: 8,
    },
    signatureBlock: {
      flex: 1,
    },
    signatureLine: {
      borderBottom: '1 solid #CBD5E1',
      marginBottom: 4,
      height: 28,
    },
    signatureLabel: {
      fontSize: 8,
      color: '#64748B',
      fontWeight: 'bold',
    },
    dateLine: {
      borderBottom: '1 solid #CBD5E1',
      marginBottom: 4,
      height: 18,
      marginTop: 8,
    },

    // Footer — pinned rather than pushed. `marginTop: 'auto'` only works while
    // the page holds exactly one page's worth of content; a week where several
    // days carry two or three job names overflows, and the footer then wandered
    // into the middle of page 1. Absolute + `fixed` (on the View, below — the
    // style alone does nothing) prints it at the bottom of EVERY page, so
    // overflow degrades gracefully instead of garbling the sheet.
    //
    // `bottom` is measured from the page's BORDER box, not from inside the 40pt
    // padding — 26 puts the rule just below the reserved band. Raising it does
    // not add clearance, it eats content; the clearance lives in the page's
    // `paddingBottom` above.
    footer: {
      position: 'absolute',
      left: 40,
      right: 40,
      bottom: 26,
      borderTop: '1 solid #E2E8F0',
      paddingTop: 8,
      flexDirection: 'row',
      justifyContent: 'space-between',
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

/**
 * A stored clock time, printed as the crew's wall clock.
 *
 * `timeZone` is not optional in spirit — the server renders this in UTC, so
 * omitting it shifts every time on the timecard. It defaults to Eastern (the
 * platform's first tenant) rather than to the server's zone, so a missing
 * prop degrades to "probably right" instead of "certainly wrong".
 */
function formatTimeDisplay(isoString: string | null, timeZone?: string): string {
  if (!isoString) return '—';
  try {
    const d = new Date(isoString);
    return d.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZone: timeZone || 'America/New_York',
    });
  } catch {
    return '—';
  }
}

/**
 * The job lines printed under one day.
 *
 * Amanda prints this sheet and runs payroll from it, so the three states are
 * kept distinct on the page — "here is where he was", "nobody recorded where he
 * was", and "we could not look it up" are three different claims and only the
 * first is safe to act on. A blank would read as the last two being the first.
 *
 * At most MAX_JOB_LINES are named, then a count: three jobs in a day happened
 * twice in 123 person-days, and a page that silently reflows is worse than a
 * page that says "+2 more".
 */
const MAX_JOB_LINES = 3;

interface JobLine {
  text: string;
  qualifier?: string | null;
  tone: 'normal' | 'muted' | 'warn';
}

function buildJobLines(entry: TimecardPDFEntry, hasData: boolean): JobLine[] {
  // The caller did not ask for job names at all — print nothing rather than a
  // claim we were never given the data to make.
  if (entry.jobs === undefined && !entry.jobsUnavailable) return [];
  // A day nobody clocked has no job question to answer.
  if (!hasData) return [];

  if (entry.jobsUnavailable) {
    return [{ text: JOB_LOOKUP_FAILED, tone: 'warn' }];
  }

  const jobs = entry.jobs ?? [];
  if (jobs.length === 0) {
    return [{ text: NO_JOB_RECORDED, tone: 'muted' }];
  }

  const lines: JobLine[] = [];
  for (const job of jobs.slice(0, MAX_JOB_LINES)) {
    const label = formatJobContextLabel(job);
    if (!label) continue;
    lines.push({ text: `• ${label}`, qualifier: jobSourceNote(job.source), tone: 'normal' });
  }
  if (jobs.length > MAX_JOB_LINES) {
    lines.push({
      text: `• +${jobs.length - MAX_JOB_LINES} more job${jobs.length - MAX_JOB_LINES === 1 ? '' : 's'} this day`,
      tone: 'muted',
    });
  }

  const conflict = formatJobConflictNote({
    userId: '',
    date: entry.date,
    jobs,
    conflicts: entry.jobConflicts ?? [],
    unresolved: false,
  });
  if (conflict) lines.push({ text: conflict, tone: 'warn' });

  return lines;
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
    return `${s} – ${e}`;
  } catch {
    return `${weekStart} - ${weekEnd}`;
  }
}

// ── Page component (reusable — batch export composes many) ──
export function TimecardPage({
  operatorName,
  operatorEmail,
  operatorRole,
  employeeId,
  weekStart,
  weekEnd,
  entries,
  summary,
  branding,
  timeZone,
}: TimecardPageProps) {
  const primaryColor = branding?.primary_color || '#1E40AF';
  const secondaryColor = branding?.secondary_color || primaryColor;
  const s = createStyles(primaryColor, secondaryColor);
  // White-label: no hardcoded tenant fallback — an unbranded tenant gets a
  // neutral document, never another company's name.
  const companyName = branding?.company_name || '';
  const headerText = branding?.pdf_header_text || companyName;
  const companyAddress = branding?.company_address || '';
  const companyPhone = branding?.company_phone || '';
  const showLogo = branding?.pdf_show_logo !== false && !!branding?.logoDataUri;

  const today = new Date().toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
  const footerLeft =
    branding?.pdf_footer_text ||
    [companyName, `Generated ${today}`].filter(Boolean).join(' · ');

  return (
    <Page size="LETTER" style={s.page}>
      {/* ═══ HEADER ═══ */}
      <View style={s.headerBar}>
        <View style={s.companyRow}>
          {showLogo ? (
            // eslint-disable-next-line jsx-a11y/alt-text
            <Image style={s.logo} src={branding!.logoDataUri!} />
          ) : null}
          <View style={s.companyBlock}>
            {headerText ? <Text style={s.companyName}>{headerText}</Text> : null}
            {companyAddress ? (
              <Text style={s.companyDetail}>{companyAddress}</Text>
            ) : null}
            {companyPhone ? (
              <Text style={s.companyDetail}>{companyPhone}</Text>
            ) : null}
          </View>
        </View>
        <View style={s.titleBlock}>
          <Text style={s.timecardTitle}>WEEKLY TIMECARD</Text>
          <Text style={s.weekRange}>
            {formatWeekRangeDisplay(weekStart, weekEnd)}
          </Text>
          <Text style={s.headerEmployee}>{operatorName}</Text>
        </View>
      </View>
      <View style={s.accentRule} />
      <View style={s.accentRuleSecondary} />

      {/* ═══ EMPLOYEE INFO ═══ */}
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
          const hasData = entry.totalHours > 0 || entry.clockIn !== null;
          const rowStyle = idx % 2 === 0 ? s.dayBlock : s.dayBlockAlt;
          const jobLines = buildJobLines(entry, hasData);

          return (
            <View key={idx} style={rowStyle} wrap={false}>
            <View style={s.cellRow}>
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
                {formatTimeDisplay(entry.clockIn, timeZone)}
              </Text>
              <Text
                style={{
                  ...(hasData ? s.tableCell : s.tableCellMuted),
                  ...s.colClockOut,
                }}
              >
                {formatTimeDisplay(entry.clockOut, timeZone)}
              </Text>
              <Text
                style={{
                  ...(hasData ? s.tableCellBold : s.tableCellMuted),
                  ...s.colHours,
                }}
              >
                {hasData ? entry.totalHours.toFixed(2) : '—'}
              </Text>
              <Text
                style={{
                  ...(hasData ? s.tableCell : s.tableCellMuted),
                  ...s.colCategory,
                }}
              >
                {hasData ? entry.category : '—'}
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
                  : '—'}
              </Text>
            </View>
            {/* WHERE THIS PERSON WAS — reference only. The Total Hrs above is
                the whole clocked day and is NOT divided between these. */}
            {jobLines.map((line, li) => (
              <Text
                key={li}
                style={
                  line.tone === 'warn'
                    ? s.jobLineWarn
                    : line.tone === 'muted'
                      ? s.jobLineMuted
                      : s.jobLine
                }
              >
                {line.text}
                {line.qualifier ? (
                  <Text style={s.jobLineQualifier}>{`  (${line.qualifier})`}</Text>
                ) : null}
              </Text>
            ))}
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
            { label: 'Double Time', value: summary.doubleTimeHours },
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
        {/* Night/Shop are attributes of hours already counted in the pay
            buckets — a signer must not read the six boxes as additive. */}
        <Text style={s.breakdownNote}>
          Night Shift and Shop Hours are subsets of the hours above, not additional pay categories.
        </Text>
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
      {/* `fixed` is what actually repeats it. Without it the absolute box is
          laid out ONCE, lands on the last page, and page 1 of a two-page sheet
          goes out with no company name, no date and no "Page 1 of 2" — a loose
          sheet with no identity in a stack of thirteen. */}
      <View style={s.footer} fixed>
        <Text style={s.footerText}>{footerLeft}</Text>
        <Text
          style={s.footerText}
          render={({ pageNumber, totalPages }) =>
            `Page ${pageNumber} of ${totalPages}`
          }
        />
      </View>
    </Page>
  );
}

// ── Single-operator document wrapper ────────────────────────
export default function TimecardPDF(props: TimecardPDFProps) {
  return (
    <Document>
      <TimecardPage {...props} />
    </Document>
  );
}
