/**
 * Pins the contract that failed on TEST-2026-000103: the edit form must be able
 * to READ BACK everything it WRITES. The load was partial (one key out of
 * nineteen), so the PATCH stopped sending the object entirely, so every tick
 * the founder made on Step 8 was discarded and the row stayed `{}`.
 *
 * The load-total test below is the one that would have caught it: it asserts
 * that a serialized payload survives a round trip with no key losing its value.
 */
import {
  loadJobsiteConditions,
  serializeJobsiteConditions,
  loadSiteCompliance,
  serializeSiteCompliance,
  loadPermits,
  permitOtherText,
  toTimeInputValue,
  toBool,
  toFtString,
  toFtNumber,
  CONDITION_BOOLEAN_KEYS,
  CONDITION_DISTANCE_KEYS,
  type JobsiteConditionsForm,
} from './jobsite-conditions';

const EMPTY_FORM: JobsiteConditionsForm = loadJobsiteConditions({});

describe('toBool', () => {
  it('accepts the shapes the two editors actually write', () => {
    expect(toBool(true)).toBe(true);
    expect(toBool('true')).toBe(true);
    expect(toBool('YES')).toBe(true);
    expect(toBool(1)).toBe(true);
    expect(toBool(false)).toBe(false);
    expect(toBool('false')).toBe(false);
    expect(toBool('')).toBe(false);
    expect(toBool(null)).toBe(false);
    expect(toBool(undefined)).toBe(false);
    expect(toBool(0)).toBe(false);
  });
});

describe('footage coercion', () => {
  it('renders a stored number or numeric string, and blanks anything else', () => {
    expect(toFtString(75)).toBe('75');
    expect(toFtString('75')).toBe('75'); // schedule-board editor stores strings
    expect(toFtString(' 75 ')).toBe('75');
    expect(toFtString(null)).toBe('');
    expect(toFtString(undefined)).toBe('');
    expect(toFtString('')).toBe('');
    expect(toFtString('abc')).toBe('');
  });

  it('writes back a real number, or null when the field was left blank', () => {
    expect(toFtNumber('75')).toBe(75);
    expect(toFtNumber('0')).toBe(0);
    expect(toFtNumber('')).toBeNull();
    expect(toFtNumber(null)).toBeNull();
    expect(toFtNumber('abc')).toBeNull();
  });

  it('does not treat 0 ft as "not entered"', () => {
    // 0 ft is a real answer ("the panel is right here"). Truthiness checks lose it.
    const round = loadJobsiteConditions(
      serializeJobsiteConditions({ ...EMPTY_FORM, electricity_available: true, electricity_available_ft: '0' })
    );
    expect(round.electricity_available_ft).toBe('0');
  });
});

describe('loadJobsiteConditions', () => {
  it('is total — every boolean the form owns is read, not just overcutting_allowed', () => {
    // The pre-fix load mapped ONE key. Anything unmapped came back as the form
    // default and, once the PATCH resumed sending, would have wiped the row.
    const stored: Record<string, unknown> = {};
    for (const k of CONDITION_BOOLEAN_KEYS) stored[k] = true;
    const form = loadJobsiteConditions(stored);
    for (const k of CONDITION_BOOLEAN_KEYS) {
      expect({ key: k, value: form[k] }).toEqual({ key: k, value: true });
    }
  });

  it('is total for every distance key', () => {
    const stored: Record<string, unknown> = {};
    for (const k of CONDITION_DISTANCE_KEYS) stored[k] = 42;
    const form = loadJobsiteConditions(stored) as unknown as Record<string, string>;
    for (const k of CONDITION_DISTANCE_KEYS) {
      expect({ key: k, value: form[k] }).toEqual({ key: k, value: '42' });
    }
  });

  it('treats a null/empty jsonb as all-unchecked rather than throwing', () => {
    expect(loadJobsiteConditions(null)).toEqual(loadJobsiteConditions({}));
    expect(loadJobsiteConditions(undefined).water_available).toBe(false);
  });

  it('lower-cases the schedule board’s capitalised inside/outside', () => {
    expect(loadJobsiteConditions({ inside_outside: 'Inside' }).inside_outside).toBe('inside');
    expect(loadJobsiteConditions({ inside_outside: 'Outside' }).inside_outside).toBe('outside');
  });

  it('preserves a value the Step 8 buttons cannot express instead of flattening it', () => {
    // The board offers 'Both'. Dropping it to '' would delete the board's answer
    // the next time anyone opened the job in the schedule form.
    const form = loadJobsiteConditions({ inside_outside: 'Both' });
    expect(form.inside_outside).toBe('both');
    expect(serializeJobsiteConditions(form).inside_outside).toBe('both');
  });
});

describe('jobsite conditions round trip', () => {
  it('survives serialize → load → serialize unchanged', () => {
    const form: JobsiteConditionsForm = {
      water_available: true,
      water_available_ft: '25',
      water_control: true,
      manpower_provided: false,
      scaffolding_provided: true,
      electricity_available: true,
      electricity_available_ft: '75',
      inside_outside: 'inside',
      proper_ventilation: true,
      overcutting_allowed: true,
      cord_480: true,
      cord_480_ft: '150',
      clean_up_required: true,
      high_work: true,
      high_work_ft: '18',
      high_work_access: 'we_provide',
      hyd_hose: true,
      hyd_hose_ft: '60',
      plastic_needed: true,
    };
    const once = serializeJobsiteConditions(form);
    const reloaded = loadJobsiteConditions(once);
    expect(reloaded).toEqual(form);
    expect(serializeJobsiteConditions(reloaded)).toEqual(once);
  });

  it('reproduces the founder’s five ticks end to end', () => {
    // Water Control, Electricity Available, Overcutting Allowed, Cleanup
    // Required, Plastic Needed — the exact set that saved as `{}`.
    const ticked: JobsiteConditionsForm = {
      ...EMPTY_FORM,
      water_control: true,
      electricity_available: true,
      electricity_available_ft: '75',
      overcutting_allowed: true,
      clean_up_required: true,
      plastic_needed: true,
    };
    const jsonb = serializeJobsiteConditions(ticked);
    expect(jsonb).toMatchObject({
      water_control: true,
      electricity_available: true,
      electricity_available_ft: 75,
      overcutting_allowed: true,
      clean_up_required: true,
      plastic_needed: true,
    });
    expect(loadJobsiteConditions(jsonb)).toEqual(ticked);
  });

  it('does not alter a REAL production row (JOB-2026-793440, read Aug 2026)', () => {
    // Copied verbatim from prod. This is the shape an edit actually loads, and
    // the property that matters is that opening a job and saving it WITHOUT
    // touching Step 8 leaves the column byte-identical.
    const prodRow = {
      cord_480: false,
      hyd_hose: true,
      high_work: false,
      cord_480_ft: null,
      hyd_hose_ft: 75,
      high_work_ft: null,
      water_control: true,
      inside_outside: 'inside',
      plastic_needed: false,
      water_available: false,
      high_work_access: null,
      clean_up_required: true,
      manpower_provided: false,
      proper_ventilation: true,
      water_available_ft: null,
      overcutting_allowed: true,
      scaffolding_provided: false,
      electricity_available: false,
      electricity_available_ft: null,
    };
    const resaved = serializeJobsiteConditions(loadJobsiteConditions(prodRow));
    expect(resaved).toEqual(prodRow);
  });

  it('round-trips a row the schedule board wrote (string footages)', () => {
    const boardRow = {
      water_available: true,
      water_available_ft: '30',
      cord_480: true,
      cord_480_ft: '200',
      inside_outside: 'Outside',
    };
    const form = loadJobsiteConditions(boardRow);
    expect(form.water_available_ft).toBe('30');
    expect(form.cord_480_ft).toBe('200');
    const out = serializeJobsiteConditions(form);
    expect(out.water_available_ft).toBe(30);
    expect(out.cord_480_ft).toBe(200);
    expect(out.inside_outside).toBe('outside');
  });
});

describe('site compliance round trip', () => {
  it('survives serialize → load → serialize unchanged', () => {
    const form = {
      orientation_required: true,
      orientation_datetime: '2026-08-20T07:00',
      badging_required: true,
      badging_type: 'GE',
      photos_prohibited: true,
      special_instructions: 'Check in at gate 4',
      compliance_attachment_urls: ['https://example.test/a.pdf'],
      facility_id: '11111111-2222-3333-4444-555555555555',
      facility_name: 'Plant 3',
      facility_requirements: 'Steel toe + FR',
    };
    const once = serializeSiteCompliance(form);
    expect(loadSiteCompliance(once)).toEqual(form);
    expect(serializeSiteCompliance(loadSiteCompliance(once))).toEqual(once);
  });

  it('maps attachment_urls ↔ compliance_attachment_urls (the names differ)', () => {
    expect(loadSiteCompliance({ attachment_urls: ['x'] }).compliance_attachment_urls).toEqual(['x']);
    expect(loadSiteCompliance({ attachment_urls: 'not-an-array' }).compliance_attachment_urls).toEqual([]);
  });

  it('treats an empty jsonb as all-off rather than throwing', () => {
    expect(loadSiteCompliance(null).orientation_required).toBe(false);
    expect(loadSiteCompliance({}).compliance_attachment_urls).toEqual([]);
  });
});

describe('toTimeInputValue', () => {
  it('trims the seconds Postgres returns so <input type="time"> shows the value', () => {
    // TEST-2026-000103 stores '08:00:00'. A blank input here meant a re-save
    // overwrote a real 8am start with the 07:00 form default.
    expect(toTimeInputValue('08:00:00')).toBe('08:00');
    expect(toTimeInputValue('08:00')).toBe('08:00');
    expect(toTimeInputValue('7:30')).toBe('07:30');
    expect(toTimeInputValue('')).toBe('');
    expect(toTimeInputValue(null)).toBe('');
    expect(toTimeInputValue('nonsense')).toBe('');
  });
});

describe('permits', () => {
  it('loads well-formed entries and drops junk', () => {
    expect(
      loadPermits([
        { type: 'hot_work', details: '#4412' },
        { type: 'excavation' },
        null,
        'nope',
        { details: 'no type' },
      ])
    ).toEqual([
      { type: 'hot_work', details: '#4412' },
      { type: 'excavation', details: '' },
    ]);
  });

  it('returns [] for a missing or non-array column', () => {
    expect(loadPermits(null)).toEqual([]);
    expect(loadPermits({})).toEqual([]);
  });

  it('recovers the free-text "other" box', () => {
    expect(permitOtherText([{ type: 'other', details: 'Noise permit' }])).toBe('Noise permit');
    expect(permitOtherText([{ type: 'hot_work', details: 'x' }])).toBe('');
  });
});
