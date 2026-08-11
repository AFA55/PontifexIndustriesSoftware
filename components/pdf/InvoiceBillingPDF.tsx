import React from 'react';
import { Document, Page, Text, View, StyleSheet, Image } from '@react-pdf/renderer';

/**
 * INVOICE / BILLING — a drafted version of Patriot's paper billing sheet.
 *
 * WHY (founder, M2f): today the office pulls up the completion ticket and the
 * work ticket and RETYPES both into a separate invoicing sheet by hand. Every
 * field on that sheet already exists in the platform except the money, so this
 * fills in what we know and leaves the rest as ruled lines to write on — the
 * office keeps the exact document and filing habit they have now.
 *
 * Built from a photo of the real form (Aug 10), field for field, top to bottom.
 *
 * ── Deliberately blank ──────────────────────────────────────────────────────
 * INVOICE TOTAL is left as an empty ruled line. The founder deferred pricing:
 * "eventually we have to add quoted total… and change order totals and other
 * totals. That is later on." Printing a wrong or guessed number on a customer's
 * bill is far worse than printing a line for Amanda to write on, which is what
 * she does today anyway.
 *
 * SUBCONTRACT is a contract number that "most [jobs] don't" have (founder,
 * Aug 11) — rendered as a blank line rather than dropped, so the sheet still
 * matches the paper one when a job does have one.
 */

const s = StyleSheet.create({
  page: { padding: 40, fontSize: 11, fontFamily: 'Times-Roman', color: '#000' },

  logo: { width: 46, height: 46, objectFit: 'contain', marginBottom: 4 },
  companyFallback: { fontSize: 9, fontWeight: 'bold', letterSpacing: 1 },

  title: {
    fontSize: 18,
    fontFamily: 'Times-Bold',
    textAlign: 'center',
    textDecoration: 'underline',
    marginTop: 6,
    marginBottom: 18,
    letterSpacing: 0.5,
  },

  // A label sitting on a ruled line, mirroring the paper form.
  row: { flexDirection: 'row', alignItems: 'flex-end', marginBottom: 7 },
  label: { fontFamily: 'Times-Bold', fontSize: 11 },
  labelSmall: { fontFamily: 'Times-Roman', fontSize: 7.5 },
  line: { flex: 1, borderBottom: '0.75 solid #000', marginLeft: 4, minHeight: 13, justifyContent: 'flex-end' },
  lineText: { fontSize: 10.5, paddingBottom: 1.5 },
  /** A ruled line with nothing on it — the office writes here. */
  blankLine: { flex: 1, borderBottom: '0.75 solid #000', marginLeft: 4, height: 13 },

  half: { flexDirection: 'row', gap: 14 },
  halfItem: { flex: 1, flexDirection: 'row', alignItems: 'flex-end' },

  banner: {
    backgroundColor: '#000',
    paddingVertical: 3,
    paddingHorizontal: 6,
    marginTop: 12,
    marginBottom: 10,
  },
  bannerText: { color: '#FFF', fontFamily: 'Times-Bold', fontSize: 10.5, letterSpacing: 0.5 },

  descLine: { borderBottom: '0.75 solid #000', minHeight: 17, justifyContent: 'flex-end', paddingBottom: 2, paddingHorizontal: 2 },
  descText: { fontSize: 10 },

  totalRow: { flexDirection: 'row', alignItems: 'flex-end', marginTop: 22 },
  totalLabel: { fontFamily: 'Times-Bold', fontSize: 12 },
  totalLine: { width: 150, borderBottom: '0.75 solid #000', marginLeft: 6, height: 18 },

  draftNote: { marginTop: 16, fontSize: 7.5, color: '#555', fontStyle: 'italic' },
});

export interface InvoiceBillingData {
  companyLogoUrl?: string | null;
  companyName?: string | null;

  /** Customer name + billing address lines. */
  customerLines: string[];
  subcontract?: string | null;
  changeOrderNumbers?: string[];
  poNumber?: string | null;
  jobNumber?: string | null;
  salesRep?: string | null;
  /** Project name when the job has one, otherwise the address (founder's rule). */
  jobName?: string | null;
  jobLocationLines: string[];
  /** Every distinct day worked — a multi-day job has several. */
  datesWorked: string[];
  /** This job's ticket number PLUS every linked/duplicate crew ticket. */
  jobTicketNumbers: string[];
  /** Work performed, already summarised across all days and all crews. */
  descriptionLines: string[];
}

/** Render a value onto a ruled line, or leave the line blank. */
function Filled({ value }: { value?: string | null }) {
  return (
    <View style={s.line}>
      {value ? <Text style={s.lineText}>{value}</Text> : null}
    </View>
  );
}

export default function InvoiceBillingPDF({ data }: { data: InvoiceBillingData }) {
  // The paper form has room for 4 customer lines and 3 location lines. Keep the
  // shape even when we know fewer, so it prints as the same document.
  const customer = [...data.customerLines].slice(0, 4);
  while (customer.length < 4) customer.push('');

  const location = [...data.jobLocationLines].slice(0, 3);
  while (location.length < 3) location.push('');

  // 8 ruled lines for the description, like the paper form.
  const desc = [...data.descriptionLines].slice(0, 8);
  while (desc.length < 8) desc.push('');

  return (
    <Document>
      <Page size="LETTER" style={s.page}>
        {data.companyLogoUrl ? (
          // eslint-disable-next-line jsx-a11y/alt-text
          <Image style={s.logo} src={data.companyLogoUrl} />
        ) : (
          <Text style={s.companyFallback}>{data.companyName || ''}</Text>
        )}

        <Text style={s.title}>INVOICE/BILLING</Text>

        {/* CUSTOMER — name then address block */}
        <View style={s.row}>
          <Text style={s.label}>CUSTOMER:</Text>
          <Filled value={customer[0]} />
        </View>
        {customer.slice(1).map((l, i) => (
          <View key={`cust-${i}`} style={[s.row, { marginLeft: 70 }]}>
            <Filled value={l} />
          </View>
        ))}

        <View style={{ height: 8 }} />

        <View style={s.row}>
          <Text style={s.label}>SUBCONTRACT:</Text>
          <Filled value={data.subcontract} />
        </View>

        <View style={s.row}>
          <Text style={s.label}>CHANGE ORDER#:</Text>
          <Filled value={(data.changeOrderNumbers || []).join(', ')} />
        </View>

        <View style={s.half}>
          <View style={s.halfItem}>
            <Text style={s.label}>PO#:</Text>
            <Filled value={data.poNumber} />
          </View>
          <View style={s.halfItem}>
            <Text style={s.label}>JOB#:</Text>
            <Filled value={data.jobNumber} />
          </View>
        </View>

        {/* Its own full-width row. As a right-floated fixed-width box the label
            itself wrapped — the first draft printed "Adam In-galls" broken over
            three lines and shoved off the right edge. */}
        <View style={s.row}>
          <Text style={s.label}>SALES REP:</Text>
          <Filled value={data.salesRep} />
        </View>

        <View style={{ height: 6 }} />

        <View style={s.row}>
          <Text style={s.label}>JOB NAME:</Text>
          <Filled value={data.jobName} />
        </View>

        <View style={s.row}>
          <Text style={s.label}>JOB LOCATION:</Text>
          <Filled value={location[0]} />
        </View>
        <Text style={s.labelSmall}>(Please include city / state)</Text>
        {location.slice(1).map((l, i) => (
          <View key={`loc-${i}`} style={[s.row, { marginLeft: 70 }]}>
            <Filled value={l} />
          </View>
        ))}

        <View style={{ height: 8 }} />

        {/* PLURAL BY DESIGN — a multi-day job spans dates, and a job worked by
            more than one crew has more than one ticket. */}
        <View style={s.row}>
          <Text style={s.label}>DATE(S) WORK PERFORMED:</Text>
          <Filled value={data.datesWorked.join('   ·   ')} />
        </View>

        <View style={s.row}>
          <Text style={s.label}>Job Ticket #(S):</Text>
          <Filled value={data.jobTicketNumbers.join('   ·   ')} />
        </View>

        <View style={s.banner}>
          <Text style={s.bannerText}>INVOICE DESCRIPTION OF WORK:</Text>
        </View>

        {desc.map((line, i) => (
          <View key={`desc-${i}`} style={s.descLine}>
            {line ? <Text style={s.descText}>{line}</Text> : null}
          </View>
        ))}

        {/* Deliberately blank — see the file header. */}
        <View style={[s.totalRow, { justifyContent: 'flex-end' }]}>
          <Text style={s.totalLabel}>INVOICE TOTAL:</Text>
          <View style={s.totalLine} />
        </View>

        <Text style={s.draftNote}>
          Draft generated from the job record. Check the figures before sending.
        </Text>
      </Page>
    </Document>
  );
}
