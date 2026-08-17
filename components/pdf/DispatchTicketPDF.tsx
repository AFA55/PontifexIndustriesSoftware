import React from 'react';
import { Document, Page, Text, View, Image, StyleSheet } from '@react-pdf/renderer';
import { asArray } from '@/lib/job-arrays';
// SHARED with the HTML print page and the crew's digital ticket. Two surfaces
// formatting the same job differently is a recurring bug class here, and this
// sheet is the one the customer signs.
import {
  groupJobEquipment,
  layoutEquipmentColumns,
  formatScopeDetails,
  formatJobsiteConditions,
  formatScopeItems,
  scopeItemsHaveDetail,
  formatPpeAndSafety,
  formatPermits,
} from '@/lib/job-ticket-format';
import { chunkPhotoPages, type TicketPhoto } from '@/lib/job-ticket-photos';

/**
 * ONE TICKET, TWO RENDERERS (founder, Aug 17 2026, holding both printouts):
 * "I clicked on Print Work Ticket and Print Ticket on schedule board — same
 * data, different design. I like the one from the Completed Jobs better and
 * would like it to be uniform throughout the application. We shouldn't have 2
 * different ways our ticket prints."
 *
 * The reference design is the HTML sheet at
 * app/dashboard/admin/jobs/[id]/print/page.tsx: a header rule with the company
 * name and a boxed JOB ID, then two columns —
 *
 *   LEFT   SCHEDULE · CUSTOMER · SITE · COMPLIANCE & PERMITS · NOTES
 *   RIGHT  SCOPE OF WORK · SERVICE ITEMS · EQUIPMENT REQUIRED ·
 *          WORK CONDITIONS · PPE & SAFETY
 *
 * — then two signature rules across the foot. This file now renders exactly
 * that, in the same order, with the same section titles and field labels.
 *
 * WHY NOT JUST POINT THE SCHEDULE BOARD AT THE HTML PAGE: BatchPrintModal
 * fetches PDF *blobs* and merges a whole day's jobs into one document. A
 * browser-print page cannot be merged. So there are two renderers and one
 * design, and everything either of them formats comes out of
 * lib/job-ticket-format.
 *
 * ── THE SCALE, AND THE ONE THING THAT IS DELIBERATELY NOT A COPY ──
 * The HTML sheet lays out at 979 × 739 CSS px (letter landscape minus its 0.4in
 * print margins) = 734 × 554pt. This page is letter landscape at 18pt padding:
 * 756 × 576pt. So the PDF has 22pt more height and 22pt more width to play with.
 *
 * Geometry — margins, rules, column widths, section spacing — is the HTML value
 * × 0.75 (96dpi px → 72dpi pt): gap-x-10 40px → 30pt, mb-4 16px → 12pt, h-20
 * 80px → 60pt.
 *
 * TYPE IS NOT. A straight × 0.75 type port (text-sm 14px → 10.5pt) was built and
 * MEASURED against all 48 production job orders: 6 of them ran onto a second
 * page, and the median sheet had only ~57pt of slack left. The founder's
 * objection on Aug 17 was about DESIGN — stacked sections under rules instead of
 * the old bordered three-column cards — not about type size, and this ticket has
 * a hard one-page budget that the HTML sheet (which can simply spill) does not.
 * So the type stays at the sizes this renderer already proved fit: 8.5pt fields,
 * 8pt body, 7.5pt equipment items and chips. Same document, same order, same
 * words, set a little tighter. Measured result: 48/48 on one page.
 *
 * ── WHAT COULD NOT BE MATCHED EXACTLY ──
 *  - Type is ~80% of the HTML sheet's size, for the reason above.
 *  - No CSS grid. The two body columns are explicit widths (363pt each) with a
 *    30pt gutter rather than `grid-cols-2 gap-x-10`. Same result, but a column
 *    cannot rebalance itself, which is why the widths are stated and measured.
 *  - No `break-words`. A single unbroken token longer than its column overflows
 *    instead of hyphenating. Real equipment labels and addresses do not do this.
 *  - Chips wrap by margin, not `gap`, so the last chip in a row leaves a little
 *    more trailing space than the HTML does.
 *  - System sans vs Helvetica: the same shapes, ~2% different widths.
 */

// ── Palette: the HTML sheet's Tailwind grays, so the two sheets print the same
//    weight of ink. Black text on white, gray rules — NOT the old card design's
//    slate-blue headers, which is most of what made the two look unrelated.
const C = {
  black: '#000000',
  gray700: '#374151',
  gray600: '#4B5563',
  gray400: '#9CA3AF',
  gray300: '#D1D5DB',
};

// ── Styles ──────────────────────────────────────────────
const s = StyleSheet.create({
  page: {
    padding: 18,
    fontSize: 8.5,
    fontFamily: 'Helvetica',
    color: C.black,
    backgroundColor: '#FFFFFF',
    flexDirection: 'column',
  },

  // Header — `border-b-2 border-black pb-3 mb-4` with the JOB ID box at right.
  header: { borderBottomWidth: 1.5, borderBottomColor: C.black, paddingBottom: 9, marginBottom: 12 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  companyName: { fontSize: 15, fontFamily: 'Helvetica-Bold', letterSpacing: 0.5, textTransform: 'uppercase' },
  companyMeta: { fontSize: 7.5, color: C.gray600, marginTop: 2 },
  // `border-[2.5px] border-black rounded px-3 py-1 text-right`
  jobIdBox: { borderWidth: 1.9, borderColor: C.black, borderRadius: 3, paddingHorizontal: 9, paddingVertical: 3, alignItems: 'flex-end' },
  jobIdLabel: { fontSize: 6.5, fontFamily: 'Helvetica-Bold', letterSpacing: 1.2, color: C.gray700 },
  jobIdValue: { fontSize: 14, fontFamily: 'Courier-Bold', marginTop: 1 },
  ticketKicker: { fontSize: 8.5, textTransform: 'uppercase', letterSpacing: 0.6, color: C.gray700, marginTop: 2 },

  // Two-column body — `grid grid-cols-2 gap-x-10 items-start`.
  body: { flexDirection: 'row', alignItems: 'flex-start' },
  colLeft: { width: 363, marginRight: 30 },
  colRight: { width: 363 },

  // Section — `mb-4` + a titled rule, NOT a bordered card.
  section: { marginBottom: 10 },
  sectionTitle: {
    fontSize: 8.5,
    fontFamily: 'Helvetica-Bold',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    color: C.gray700,
    borderBottomWidth: 0.75,
    borderBottomColor: C.gray300,
    paddingBottom: 3,
    marginBottom: 6,
  },

  // Field row — `flex text-sm`, label `w-36 text-gray-600`, value `font-medium`.
  fieldRow: { flexDirection: 'row', marginBottom: 2.5, alignItems: 'flex-start' },
  fieldLabel: { fontSize: 8.5, color: C.gray600, width: 88 },
  fieldValue: { fontSize: 8.5, fontFamily: 'Helvetica-Bold', flex: 1 },

  paragraph: { fontSize: 8, lineHeight: 1.4 },
  muted: { fontSize: 8, color: C.gray600, fontStyle: 'italic' },

  // SCOPE OF WORK measurement rows — `w-28` code column beside its lines.
  scopeRow: { flexDirection: 'row', marginBottom: 3 },
  scopeCode: { width: 66, fontSize: 6.5, fontFamily: 'Helvetica-Bold', textTransform: 'uppercase', letterSpacing: 0.4, color: C.gray700, paddingTop: 1 },
  scopeLines: { flex: 1 },
  scopeLine: { fontSize: 8, lineHeight: 1.3 },
  scopeDivider: { borderTopWidth: 0.75, borderTopColor: C.gray300, marginTop: 6, paddingTop: 6 },

  // SERVICE ITEMS table — `border-b border-black` head, `border-b border-gray-300` rows.
  tableHeadRow: { flexDirection: 'row', borderBottomWidth: 0.75, borderBottomColor: C.black },
  tableHeadCell: { fontSize: 7.5, fontFamily: 'Helvetica-Bold', paddingBottom: 2.5 },
  tableRow: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: C.gray300 },
  tableCell: { fontSize: 8, paddingVertical: 2.5, paddingRight: 5 },

  // EQUIPMENT REQUIRED — two balanced columns, one item per line.
  eqCols: { flexDirection: 'row' },
  eqColFirst: { flex: 1, paddingRight: 18 },
  eqColLast: { flex: 1 },
  eqHeading: {
    fontSize: 7.5,
    fontFamily: 'Helvetica-Bold',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    color: C.gray700,
    borderBottomWidth: 0.5,
    borderBottomColor: C.gray300,
    paddingBottom: 1.5,
    marginBottom: 3,
  },
  eqHeadingNext: { marginTop: 6 },
  eqItem: { fontSize: 7.5, lineHeight: 1.25 },
  // The write-on rules a quick-add job gets instead of a list.
  blankRule: { borderBottomWidth: 0.75, borderBottomColor: C.black, height: 12, marginBottom: 9 },

  // Chips — `text-xs border border-gray-400 rounded px-2 py-0.5`.
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap' },
  chip: { borderWidth: 0.75, borderColor: C.gray400, borderRadius: 3, paddingHorizontal: 5, paddingVertical: 1.25, marginRight: 4, marginBottom: 3.5 },
  chipText: { fontSize: 7.5 },

  // NOTES write-on box — `border border-gray-400 h-20 rounded`.
  notesBox: { borderWidth: 0.75, borderColor: C.gray400, borderRadius: 3, height: 48 },

  // Signatures — `mt-4 grid grid-cols-2 gap-8`.
  signatures: { flexDirection: 'row', marginTop: 12 },
  sigCellFirst: { flex: 1, marginRight: 24 },
  sigCell: { flex: 1 },
  sigRule: { borderBottomWidth: 0.75, borderBottomColor: C.black, height: 24 },
  sigLabel: { fontSize: 7.5, color: C.gray700, marginTop: 3 },

  // ── Photo pages (page 2+) ──
  // UNCHANGED. Every size below is EXPLICIT rather than flexed, because a photo
  // page that reflows silently drops to one photo per page. LETTER landscape is
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
  is_will_call?: boolean;
  estimated_cost?: number;
  estimated_hours?: number;
  po_number?: string;
  /** The RAW `job_orders.salesman_name` column. Fallback only — prefer `quoted_by`. */
  salesman_name?: string;
  /** Who quoted it: the column, else the profile behind `created_by`. */
  quoted_by?: string;
  operator_name?: string;
  helper_name?: string;
  project_name?: string;
  project_manager_name?: string;
  equipment_needed?: string[];
  /** The per-service picks (core bits, saws, hoses). This ticket never read
   *  them, which is why ~16 selections were missing from the printed sheet. */
  equipment_selections?: Record<string, Record<string, unknown>> | null;
  equipment_rentals?: string[];
  equipment_rental_flags?: Record<string, boolean>;
  ppe_required?: string[];
  additional_safety_requirements?: string[];
  scope_details?: Record<string, any>;
  /** job_scope_items — the measured targets. Printed as SERVICE ITEMS. */
  scope_items?: {
    id?: string | null;
    work_type?: string | null;
    description?: string | null;
    unit?: string | null;
    target_quantity?: number | string | null;
  }[];
  site_compliance?: Record<string, any>;
  jobsite_conditions?: Record<string, any>;
  additional_info?: string;
  job_difficulty_rating?: number;
  difficulty_rating?: number;
  permit_required?: boolean;
  permit_number?: string;
  permits?: { type: string; details?: string; number?: string }[];
  is_multi_day?: boolean;
  total_days_worked?: number;
  scheduling_flexibility?: Record<string, any>;
  directions?: string;
  /** Resolved by the route (lib/job-ticket-photos) — bytes already inlined. */
  photos?: TicketPhoto[];
}

// ── Helpers ─────────────────────────────────────────────────

/**
 * The HTML sheet's date wording, to the letter: `Monday, August 17, 2026`.
 *
 * `+ 'T00:00:00'` is not decoration — see CLAUDE.md. A bare 'YYYY-MM-DD' parsed
 * by `new Date()` is UTC midnight and renders as the PREVIOUS DAY in every US
 * timezone, which on a dispatch ticket sends a crew out on the wrong morning.
 */
function formatDate(d?: string) {
  if (!d) return '—';
  try {
    return new Date(d + 'T00:00:00').toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return d;
  }
}

/** `13:30` → `1:30 PM`. Same helper the HTML sheet uses. */
function formatTime(time?: string): string | null {
  if (!time) return null;
  const [hours, minutes] = time.split(':');
  const hour = parseInt(hours, 10);
  if (!Number.isFinite(hour)) return time;
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${minutes} ${ampm}`;
}

// PERMIT_TYPE_LABELS moved to lib/job-ticket-format (`formatPermits`) — the HTML
// sheet has to name the same permits, and by definition a second copy of the
// table is how the two sheets start disagreeing about what a `hot_work` job is.

// ── Presentational helpers (mirrors of the HTML page's Section / Field) ─────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={s.section}>
      <Text style={s.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.fieldRow}>
      <Text style={s.fieldLabel}>{label}</Text>
      <Text style={s.fieldValue}>{value}</Text>
    </View>
  );
}

function Chips({ items }: { items: string[] }) {
  return (
    <View style={s.chipWrap}>
      {items.map((text, i) => (
        <View key={i} style={s.chip}>
          <Text style={s.chipText}>{text}</Text>
        </View>
      ))}
    </View>
  );
}

// ── Component ───────────────────────────────────────────────

export default function DispatchTicketPDF({
  job,
  branding,
  measureFillerPt,
}: {
  job: DispatchTicketData;
  branding?: PDFBranding;
  /**
   * PAGE-FIT HARNESS HOOK. Adds exactly this many points of empty space at the
   * foot of page 1 — NEGATIVE values pull the content up instead. A script can
   * then binary-search the largest value that still produces a one-page ticket:
   * a positive answer is the slack left on the sheet, a negative one is how far
   * over it went. Points, measured, rather than eyeballing a rendered image.
   * Never set in production; undefined renders nothing at all.
   */
  measureFillerPt?: number;
}) {
  const conditions = job.jobsite_conditions || {};
  const compliance = job.site_compliance || {};

  // ── Everything the office selected, grouped by service, then laid out as two
  //    balanced newspaper columns, one item per line.
  //
  //    Founder, Aug 16: "I clicked more than the equipment it shows — I didn't
  //    even click wall saw or slab saw." This file read only `equipment_needed`
  //    (three items typed by hand) and never touched `equipment_selections`,
  //    where the ~16 real picks live. Then Aug 17: the same list must not be one
  //    wrapped `·`-separated paragraph, on EITHER sheet.
  //
  //    MEASURED on letter landscape: one column, one item per line, does not
  //    fit; two columns split PER SERVICE wastes up to half a row per group on
  //    its ragged last line; two CONTINUOUSLY BALANCED columns fit with room.
  //    layoutEquipmentColumns never ends a column on a service heading and
  //    repeats a straddled heading as "(cont.)". The HTML sheet calls the same
  //    helper with the same column count.
  const equipmentGroups = groupJobEquipment({
    equipment_selections: job.equipment_selections,
    equipment_needed: job.equipment_needed,
    equipment_rentals: job.equipment_rentals,
    equipment_rental_flags: job.equipment_rental_flags,
  });
  const equipmentColumns = layoutEquipmentColumns(equipmentGroups, 2);

  // SCOPE OF WORK — the measured areas / cuts / holes as sentences with their
  // units spelled out, replacing this file's old six-column table. The table
  // printed raw `scope_details` cells and could not show an `areas` row at all.
  const scopeSections = formatScopeDetails(job.scope_details);

  // SERVICE ITEMS — `48 LF`, not "48 linear_ft" beside a description that
  // repeats the service name.
  const scopeLines = formatScopeItems(job.scope_items);
  const showScopeDetail = scopeItemsHaveDetail(scopeLines);

  // WORK CONDITIONS — the ticked ones only, through the shared formatter. The
  // old hardcoded 13-row checkbox list had already drifted from the HTML sheet:
  // it was missing `high_work_access`, and it read only the `*_ft` spelling of a
  // distance while the shared formatter also accepts `*_distance_ft`.
  const conditionLines = formatJobsiteConditions(conditions);

  const ppeAndSafety = formatPpeAndSafety(job.ppe_required, job.additional_safety_requirements);

  // Four photos to a page, 2 × 2. Empty when the job has none — and then the
  // Document is exactly the one-page ticket it has always been.
  const photoPages = chunkPhotoPages(job.photos ?? []);

  const arrival = formatTime(job.arrival_time);
  const siteAddress = job.address || job.location || '—';
  // `location` differs from `address` on 13 of the 48 production jobs (it holds
  // the building / area name), so it gets its own line rather than being lost to
  // the `||` above.
  const siteName =
    job.location && job.location.trim() && job.location.trim() !== (job.address || '').trim()
      ? job.location.trim()
      : '';

  const permitList = formatPermits(asArray<{ type: string; details?: string }>(job.permits));

  // QUOTED BY — `quoted_by` is the DERIVED value (the salesman_name column, else
  // the profile behind created_by). `salesman_name` is the raw column and is
  // read only as a fallback for callers that have not been updated: emitting a
  // guess under the column's own name is how an editor pre-filled from it would
  // persist the guess as fact. See lib/job-ticket-quoted-by.ts.
  const quotedBy = job.quoted_by || job.salesman_name || '';

  return (
    <Document>
      <Page size="LETTER" orientation="landscape" style={s.page}>
        {/* ═══ HEADER ═══
            WHITE-LABEL: the company name comes from tenant branding. The JOB ID
            is boxed and set large because sifting a stack of paper for one job
            is the actual use (founder, Aug 15) — and it is BLACK, not the brand
            colour, because a coloured number goes grey on a mono printer.

            NO CREW NAMES. A sheet printed Monday must not assert who is on the
            job Thursday; who actually worked it is on the WORK ticket, from the
            clock cards. */}
        <View style={s.header}>
          <View style={s.headerRow}>
            <View style={{ flex: 1, paddingRight: 12 }}>
              <Text style={s.companyName}>
                {(branding?.company_name || 'Job Ticket').toUpperCase()}
              </Text>
              {!!branding?.company_address && (
                <Text style={s.companyMeta}>{branding.company_address}</Text>
              )}
              {!!branding?.company_phone && <Text style={s.companyMeta}>{branding.company_phone}</Text>}
            </View>
            <View style={s.jobIdBox}>
              <Text style={s.jobIdLabel}>JOB ID</Text>
              <Text style={s.jobIdValue}>{job.job_number}</Text>
            </View>
          </View>
          <Text style={s.ticketKicker}>Job Ticket</Text>
        </View>

        {/* ═══ TWO-COLUMN BODY ═══ */}
        <View style={s.body}>
          {/* ── LEFT ── */}
          <View style={s.colLeft}>
            <Section title="Schedule">
              <Field label="Date" value={formatDate(job.scheduled_date)} />
              {!!job.end_date && job.end_date !== job.scheduled_date && (
                <Field label="End Date" value={formatDate(job.end_date)} />
              )}
              <Field label="Arrival Time" value={job.is_will_call ? 'Will Call' : arrival || '—'} />
              {!!job.project_manager_name && (
                <Field label="Project Manager" value={job.project_manager_name} />
              )}
            </Section>

            <Section title="Customer">
              <Field label="Customer" value={job.customer_name || '—'} />
              {!!job.project_name && <Field label="Project" value={job.project_name} />}
              {!!job.customer_contact && <Field label="Site Contact" value={job.customer_contact} />}
              {!!(job.site_contact_phone || job.foreman_phone) && (
                <Field label="Phone" value={job.site_contact_phone || job.foreman_phone || '—'} />
              )}
              {!!quotedBy && <Field label="Quoted By" value={quotedBy} />}
            </Section>

            <Section title="Site">
              <Field label="Address" value={siteAddress} />
              {!!siteName && <Field label="Job Site" value={siteName} />}
              {!!job.job_type && <Field label="Job Type" value={job.job_type} />}
              {!!job.po_number && <Field label="PO Number" value={job.po_number} />}
              {!!job.directions && <Field label="Directions" value={job.directions} />}
            </Section>

            {/* The permit list used to be a yellow banner across the top of this
                sheet and a plain field list on the other. It is one section on
                both now; the permits themselves are named here so nothing the
                banner carried is lost. */}
            <Section title="Compliance & Permits">
              <Field label="Permit Required" value={job.permit_required ? 'Yes' : 'No'} />
              {!!job.permit_number && <Field label="Permit #" value={job.permit_number} />}
              {permitList.length > 0 && <Field label="Permits" value={permitList.join(' | ')} />}
              {!!compliance.orientation_required && <Field label="Orientation" value="Required" />}
              {!!compliance.badging_required && (
                <Field label="Badging" value={(compliance.badging_type as string) || 'Required'} />
              )}
              {!!compliance.special_instructions && (
                <Field label="Instructions" value={String(compliance.special_instructions)} />
              )}
            </Section>

            {/* NOTES sits under Compliance & Permits rather than running full
                width below both columns (founder, Aug 13: "have notes under
                compliance and permits so it can all fit in one ticket"). */}
            <Section title="Notes">
              {!!job.additional_info && (
                <Text style={{ ...s.paragraph, marginBottom: 6 }}>{job.additional_info}</Text>
              )}
              <View style={s.notesBox} />
            </Section>
          </View>

          {/* ── RIGHT ── */}
          <View style={s.colRight}>
            <Section title="Scope of Work">
              {job.description ? (
                <Text style={s.paragraph}>{job.description}</Text>
              ) : scopeSections.length === 0 ? (
                <Text style={s.muted}>No scope description provided.</Text>
              ) : null}

              {scopeSections.length > 0 && (
                <View style={job.description ? s.scopeDivider : {}}>
                  {scopeSections.map((section) => (
                    <View key={section.code} style={s.scopeRow}>
                      <Text style={s.scopeCode}>
                        {section.code === '_removal' ? 'Removal' : section.code}
                      </Text>
                      <View style={s.scopeLines}>
                        {section.lines.map((line, i) => (
                          <Text key={i} style={s.scopeLine}>
                            {line}
                          </Text>
                        ))}
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </Section>

            {/* SERVICE ITEMS — see lib/job-ticket-format for why this is one
                resolved measure per row and why the DETAIL column only appears
                when a human actually typed one. */}
            {scopeLines.length > 0 && (
              <Section title="Service Items">
                {/* The Service cell FLEXES when there is no Detail column.
                    It was a fixed 230pt, which with the 62pt Quantity cell
                    filled 292pt of a 363pt column — so the right-aligned
                    Quantity stopped 71pt short of the header rule that spans
                    the full width, and the number floated in the middle of the
                    row. 36 of the 39 production scope rows take exactly this
                    no-detail branch. The HTML reference is `w-full` +
                    `text-right`, i.e. flush; `flex: 1` is that. */}
                <View style={s.tableHeadRow}>
                  <Text style={showScopeDetail ? { ...s.tableHeadCell, width: 110 } : { ...s.tableHeadCell, flex: 1 }}>
                    Service
                  </Text>
                  {showScopeDetail && <Text style={{ ...s.tableHeadCell, flex: 1 }}>Detail</Text>}
                  <Text style={{ ...s.tableHeadCell, width: 62, textAlign: 'right' }}>Quantity</Text>
                </View>
                {scopeLines.map((item) => (
                  <View key={item.key} style={s.tableRow}>
                    <Text
                      style={{
                        ...s.tableCell,
                        ...(showScopeDetail ? { width: 110 } : { flex: 1 }),
                        fontFamily: 'Helvetica-Bold',
                      }}
                    >
                      {item.service || '—'}
                    </Text>
                    {showScopeDetail && (
                      <Text style={{ ...s.tableCell, flex: 1 }}>{item.detail || '—'}</Text>
                    )}
                    <Text
                      style={{
                        ...s.tableCell,
                        width: 62,
                        paddingRight: 0,
                        textAlign: 'right',
                        fontFamily: 'Helvetica-Bold',
                      }}
                    >
                      {item.quantity || '—'}
                    </Text>
                  </View>
                ))}
              </Section>
            )}

            {/* EQUIPMENT REQUIRED — always printed, filled or blank. A quick-add
                job carries no selections, so the crew gets ruled lines to write
                on rather than the section disappearing; the sheet keeps one
                shape (founder, Aug 13). */}
            <Section title="Equipment Required">
              {equipmentColumns.length > 0 ? (
                <View style={s.eqCols}>
                  {equipmentColumns.map((col, ci) => (
                    <View
                      key={ci}
                      style={ci < equipmentColumns.length - 1 ? s.eqColFirst : s.eqColLast}
                    >
                      {col.map((row, ri) =>
                        row.kind === 'heading' ? (
                          <Text
                            key={ri}
                            style={ri === 0 ? s.eqHeading : { ...s.eqHeading, ...s.eqHeadingNext }}
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
              ) : (
                <View>
                  <View style={s.blankRule} />
                  <View style={s.blankRule} />
                </View>
              )}
            </Section>


            {conditionLines.length > 0 && (
              <Section title="Work Conditions">
                <Chips items={conditionLines} />
              </Section>
            )}

            {ppeAndSafety.length > 0 && (
              <Section title="PPE & Safety">
                <Chips items={ppeAndSafety} />
              </Section>
            )}
          </View>
        </View>

        {/* ═══ SIGNATURES — the only full-width block, so the sheet ends here ═══ */}
        <View style={s.signatures}>
          <View style={s.sigCellFirst}>
            <View style={s.sigRule} />
            <Text style={s.sigLabel}>Customer Signature / Date</Text>
          </View>
          <View style={s.sigCell}>
            <View style={s.sigRule} />
            <Text style={s.sigLabel}>Operator Signature / Date</Text>
          </View>
        </View>

        {/* Page-fit harness only — see the `measureFillerPt` prop. */}
        {typeof measureFillerPt === 'number' && measureFillerPt !== 0 && (
          <View style={{ marginTop: measureFillerPt }} />
        )}
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
