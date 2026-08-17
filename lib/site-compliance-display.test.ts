/**
 * Pins the founder's actual complaint: "Orientation Datetime 2026-08-16T08:00"
 * must never reach a phone again, and the two operator surfaces must agree
 * because they now share one builder.
 *
 * The production shapes exercised here were read off `job_orders.site_compliance`
 * in the live project (Aug 2026): an all-null object, a time with the
 * `orientation_required` checkbox OFF, GE badging, and multi-sentence
 * `special_instructions`.
 */
import { buildComplianceItems, formatComplianceDateTime } from './site-compliance-display';

describe('formatComplianceDateTime', () => {
  it('renders the bare local datetime the schedule form stores', () => {
    // 2026-08-16 is a Sunday. If this ever reads "Sat, Aug 15" the UTC-parsing
    // bug is back.
    expect(formatComplianceDateTime('2026-08-16T08:00')).toBe('Sun, Aug 16 · 8:00 AM');
  });

  it('does not shift the time — 08:00 stored is 8:00 AM shown', () => {
    expect(formatComplianceDateTime('2026-08-11T08:00')).toBe('Tue, Aug 11 · 8:00 AM');
    expect(formatComplianceDateTime('2026-08-18T08:00')).toBe('Tue, Aug 18 · 8:00 AM');
  });

  it('handles noon, midnight and afternoon without 24h leakage', () => {
    expect(formatComplianceDateTime('2026-08-16T00:30')).toBe('Sun, Aug 16 · 12:30 AM');
    expect(formatComplianceDateTime('2026-08-16T12:00')).toBe('Sun, Aug 16 · 12:00 PM');
    expect(formatComplianceDateTime('2026-08-16T17:45')).toBe('Sun, Aug 16 · 5:45 PM');
  });

  it('accepts seconds and a space separator', () => {
    expect(formatComplianceDateTime('2026-08-16T08:00:00')).toBe('Sun, Aug 16 · 8:00 AM');
    expect(formatComplianceDateTime('2026-08-16 08:00')).toBe('Sun, Aug 16 · 8:00 AM');
  });

  it('falls back to the day when there is no time', () => {
    expect(formatComplianceDateTime('2026-08-16')).toBe('Sun, Aug 16');
  });

  describe('a value that declares a timezone', () => {
    // Nothing in production writes one — serializeSiteCompliance only ever
    // stores the bare local form. But the prefix match used to swallow the
    // suffix and print the raw digits as local wall time, which for a crew that
    // has to BE somewhere at 8:00 is hours wrong in silence. These are written
    // TZ-agnostically so they pass wherever CI runs.
    const pad = (n: number) => String(n).padStart(2, '0');
    const asBareLocal = (iso: string) => {
      const d = new Date(iso);
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
        d.getHours()
      )}:${pad(d.getMinutes())}`;
    };

    it('converts a Z instant to the reader’s local wall clock', () => {
      expect(formatComplianceDateTime('2026-08-16T08:00:00Z')).toBe(
        formatComplianceDateTime(asBareLocal('2026-08-16T08:00:00Z'))
      );
    });

    it('does NOT read the digits as local when there is an offset to apply', () => {
      // Skipped only where the runner genuinely is UTC, in which case the two
      // readings coincide and there is nothing to distinguish.
      if (new Date('2026-08-16T08:00:00Z').getTimezoneOffset() !== 0) {
        expect(formatComplianceDateTime('2026-08-16T08:00:00Z')).not.toBe('Sun, Aug 16 · 8:00 AM');
      }
    });

    it('treats +00:00 and Z as the same instant', () => {
      expect(formatComplianceDateTime('2026-08-16T08:00:00+00:00')).toBe(
        formatComplianceDateTime('2026-08-16T08:00:00Z')
      );
    });

    it('handles an offset without a colon, and fractional seconds', () => {
      expect(formatComplianceDateTime('2026-08-16T08:00:00.500Z')).toBe(
        formatComplianceDateTime('2026-08-16T08:00:00Z')
      );
      expect(formatComplianceDateTime('2026-08-16T12:00:00-0400')).toBe(
        formatComplianceDateTime('2026-08-16T16:00:00Z')
      );
    });

    it('crosses the date line rather than printing the wrong day', () => {
      // 23:30 UTC is the previous evening in the Americas and the next morning
      // in Asia. Either way the DAY has to move with the time.
      expect(formatComplianceDateTime('2026-08-16T23:30:00Z')).toBe(
        formatComplianceDateTime(asBareLocal('2026-08-16T23:30:00Z'))
      );
    });

    it('fails visibly rather than guessing when the zoned value is nonsense', () => {
      expect(formatComplianceDateTime('2026-08-16T29:00:00Z')).toBeNull();
    });

    it('leaves the bare local form untouched — no zone, no conversion', () => {
      expect(formatComplianceDateTime('2026-08-16T08:00')).toBe('Sun, Aug 16 · 8:00 AM');
      expect(formatComplianceDateTime('2026-08-16T08:00:00')).toBe('Sun, Aug 16 · 8:00 AM');
    });
  });

  it('returns null for junk instead of "Invalid Date"', () => {
    expect(formatComplianceDateTime('')).toBeNull();
    expect(formatComplianceDateTime('95')).toBeNull();
    expect(formatComplianceDateTime('soon')).toBeNull();
    expect(formatComplianceDateTime(null)).toBeNull();
    expect(formatComplianceDateTime(undefined)).toBeNull();
    expect(formatComplianceDateTime(1234)).toBeNull();
  });
});

describe('buildComplianceItems', () => {
  it('returns nothing for an empty or missing object', () => {
    expect(buildComplianceItems(null)).toEqual([]);
    expect(buildComplianceItems(undefined)).toEqual([]);
    expect(buildComplianceItems({})).toEqual([]);
  });

  it('drops an all-null compliance object (the common production shape)', () => {
    expect(
      buildComplianceItems({
        facility_id: null,
        badging_type: null,
        facility_name: null,
        badging_required: false,
        photos_prohibited: false,
        orientation_datetime: null,
        orientation_required: false,
        special_instructions: null,
        facility_requirements: null,
      })
    ).toEqual([]);
  });

  it('turns the founder’s raw ISO row into an instruction', () => {
    // TEST-2026-000103 verbatim: a time set, the checkbox left off.
    const items = buildComplianceItems({
      facility_id: null,
      badging_type: null,
      facility_name: null,
      badging_required: false,
      photos_prohibited: false,
      orientation_datetime: '2026-08-16T08:00',
      orientation_required: false,
      special_instructions: null,
      facility_requirements: null,
    });
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      key: 'orientation',
      label: 'Attend site orientation',
      value: 'Sun, Aug 16 · 8:00 AM',
      tone: 'critical',
      layout: 'row',
    });
    expect(items[0].detail).toBeTruthy();
  });

  it('never renders a raw key or a raw ISO string', () => {
    const items = buildComplianceItems({
      orientation_datetime: '2026-08-16T08:00',
      badging_required: true,
      badging_type: 'GE',
      photos_prohibited: true,
      special_instructions: 'Call when on the way to job',
    });
    for (const item of items) {
      expect(item.label).not.toMatch(/_/);
      expect(item.value).not.toMatch(/\d{4}-\d{2}-\d{2}T/);
      expect(item.value).not.toBe('true');
      expect(item.value).not.toBe('false');
    }
  });

  it('collapses orientation_required + orientation_datetime into one line', () => {
    const items = buildComplianceItems({
      orientation_required: true,
      orientation_datetime: '2026-08-11T08:00',
    });
    expect(items.filter((i) => i.key === 'orientation')).toHaveLength(1);
    expect(items[0].value).toBe('Tue, Aug 11 · 8:00 AM');
  });

  it('says the time is missing when orientation is required without one', () => {
    const items = buildComplianceItems({ orientation_required: true, orientation_datetime: null });
    expect(items).toHaveLength(1);
    expect(items[0].label).toBe('Attend site orientation');
    expect(items[0].value).toBe('Time not set');
    expect(items[0].tone).toBe('critical');
  });

  it('merges badging_required + badging_type and never prints "Yes"', () => {
    const withType = buildComplianceItems({ badging_required: true, badging_type: 'GE' });
    expect(withType).toHaveLength(1);
    expect(withType[0]).toMatchObject({
      key: 'badging',
      label: 'Badge required to get on site',
      value: 'GE',
      tone: 'critical',
    });

    // A bare flag has no detail to show — the LABEL carries the requirement, so
    // the value stays empty rather than becoming a meaningless "Yes"/"true".
    const bareFlag = buildComplianceItems({ badging_required: true });
    expect(bareFlag[0].value).toBe('');
    expect(bareFlag[0].detail).toBeTruthy();
  });

  it('surfaces a badge type even when the checkbox was left off', () => {
    const items = buildComplianceItems({ badging_required: false, badging_type: 'GE' });
    expect(items).toHaveLength(1);
    expect(items[0].key).toBe('badging');
  });

  it('explains the photo ban rather than printing photos_prohibited: true', () => {
    const items = buildComplianceItems({ photos_prohibited: true });
    expect(items[0]).toMatchObject({
      key: 'photos_prohibited',
      label: 'No photos on this site',
      value: '',
      tone: 'critical',
    });
    expect(items[0].detail).toContain('waived');
  });

  it('renders long free text as a block, not a right-aligned value', () => {
    const long =
      'Parking lot will be tight most likely. Be very careful of surroundings especially when leaving.';
    const items = buildComplianceItems({ special_instructions: long });
    expect(items[0]).toMatchObject({
      key: 'special_instructions',
      label: 'From the office',
      value: long,
      layout: 'block',
    });
  });

  it('keeps facility name, id and requirements', () => {
    const items = buildComplianceItems({
      facility_name: 'GE Aviation Plant 4',
      facility_id: 'PL-4',
      facility_requirements: 'Steel toe + FR clothing at all times.',
    });
    expect(items.map((i) => i.key)).toEqual([
      'facility_name',
      'facility_id',
      'facility_requirements',
    ]);
    expect(items[2].layout).toBe('block');
  });

  it('excludes attachment_urls — the pages render it as a PhotoViewer', () => {
    const items = buildComplianceItems({
      attachment_urls: ['https://example.com/a.jpg'],
      badging_required: true,
    });
    expect(items.map((i) => i.key)).toEqual(['badging']);
  });

  it('orders by consequence: orientation, badging, photos, then context', () => {
    const items = buildComplianceItems({
      special_instructions: 'Call when on the way to job',
      facility_name: 'Plant 4',
      photos_prohibited: true,
      badging_required: true,
      badging_type: 'GE',
      orientation_datetime: '2026-08-16T08:00',
    });
    expect(items.map((i) => i.key)).toEqual([
      'orientation',
      'badging',
      'photos_prohibited',
      'facility_name',
      'special_instructions',
    ]);
  });

  it('humanises an unknown key and keeps units on a distance', () => {
    const items = buildComplianceItems({ muster_point_ft: 250, escort_required: true });
    const muster = items.find((i) => i.key === 'muster_point_ft');
    expect(muster).toMatchObject({ label: 'Muster Point', value: '250 ft' });
    const escort = items.find((i) => i.key === 'escort_required');
    expect(escort).toMatchObject({ label: 'Escort Required', value: 'Required' });
  });
});
