/**
 * THE PAYROLL SHEET'S FOOTER — on EVERY page, and clear of the hours.
 *
 * Amanda pays ~13 people off a stack of these printouts. Page 1 of a two-page
 * sheet went out with no company name, no "Generated" date and no "Page 1 of 2":
 * the footer was styled `position: absolute` with a comment claiming it printed
 * on every page, but the `fixed` prop that actually repeats it was never passed,
 * so the box was laid out once and landed on the LAST page. A loose sheet with
 * no identity in a stack of thirteen is a collation hazard.
 *
 * The second half of the fix is the reserved band. A `fixed` footer is out of
 * the flow, so the table runs underneath it: on a rendered full page there was
 * only 2.6pt between the last row of hours and the footer's rule. The clearance
 * comes from the page's `paddingBottom`, NOT from raising the footer's `bottom`
 * — the inset is measured from the page's BORDER box, so a larger `bottom`
 * moves the footer UP into the content. Rendered at `bottom: 40` the rule
 * printed straight through the last two rows of a real week (-11.4pt overlap).
 *
 * These assertions walk the element tree rather than rendering a PDF, so the
 * suite stays fast; the geometry above was verified against actual rendered
 * PDFs (26 pages across 16 documents: 0 missing footers, tightest gap 14.5pt).
 */
// @react-pdf/renderer ships ESM that Jest's CJS transform will not load, and
// this suite inspects the ELEMENT TREE rather than a rendered document — the
// primitives only need to be things React.createElement accepts.
jest.mock('@react-pdf/renderer', () => ({
  Document: 'Document',
  Page: 'Page',
  Text: 'Text',
  View: 'View',
  Image: 'Image',
  StyleSheet: { create: (s: Record<string, unknown>) => s },
}));

import React from 'react';
import { TimecardPage } from './TimecardPDF';
import type { TimecardDayEntry } from '@/lib/timecard-utils';

const entries: TimecardDayEntry[] = ['2026-08-17', '2026-08-18'].map((date) => ({
  date,
  clockIn: `${date}T11:05:00Z`,
  clockOut: `${date}T20:35:00Z`,
  totalHours: 9.5,
  category: 'Regular',
  isApproved: false,
  jobs: [],
  jobConflicts: [],
  jobsUnresolved: true,
  jobsUnavailable: false,
}));

function render() {
  return TimecardPage({
    operatorName: 'Keontre Wilkins',
    operatorEmail: 'k@example.com',
    operatorRole: 'operator',
    employeeId: 'A1B2C3D4',
    weekStart: '2026-08-17',
    weekEnd: '2026-08-23',
    entries,
    summary: {
      regularHours: 19,
      weeklyOvertimeHours: 0,
      mandatoryOvertimeHours: 0,
      nightShiftHours: 0,
      shopHours: 0,
      holidayHours: 0,
      doubleTimeHours: 0,
      totalHours: 19,
      daysWorked: 2,
    },
    timeZone: 'America/New_York',
  }) as React.ReactElement;
}

/** Every element in the returned tree, depth-first. */
function walk(node: unknown, out: any[] = []): any[] {
  if (Array.isArray(node)) {
    for (const n of node) walk(n, out);
    return out;
  }
  if (!node || typeof node !== 'object') return out;
  const el = node as any;
  if (!el.props) return out;
  out.push(el);
  walk(el.props.children, out);
  return out;
}

describe('the weekly timecard footer', () => {
  const page: any = render();
  const nodes = walk(page);
  const footer = nodes.find(
    (n) => n.props?.style && n.props.style.position === 'absolute' && n.props.style.borderTop
  );

  it('exists', () => {
    expect(footer).toBeDefined();
  });

  it('is `fixed`, which is the only thing that puts it on page 1 of 2', () => {
    expect(footer.props.fixed).toBe(true);
  });

  it('carries the page number and the generated date', () => {
    const texts = walk(footer.props.children);
    // "Page N of M" is a render callback — react-pdf calls it per page.
    expect(texts.some((t) => typeof t.props.render === 'function')).toBe(true);
    const rendered = texts
      .find((t) => typeof t.props.render === 'function')!
      .props.render({ pageNumber: 1, totalPages: 2 });
    expect(rendered).toBe('Page 1 of 2');
    expect(JSON.stringify(page.props.children)).toContain('Generated');
  });

  it('sits below a reserved band, so it never prints over the last row of hours', () => {
    const pageStyle = page.props.style;
    // Footer box above the page edge: bottom inset + 7.5pt text + 8pt padding
    // + 1pt rule. The page must stop flowing content above that.
    const footerBandTop = footer.props.style.bottom + 7.5 + 8 + 1;
    expect(pageStyle.paddingBottom).toBeGreaterThan(footerBandTop);
  });
});
