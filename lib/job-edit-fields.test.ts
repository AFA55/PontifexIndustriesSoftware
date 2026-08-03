import {
  JOB_EDIT_ALLOWED_FIELDS,
  filterJobEditFields,
  describeJobEditError,
} from './job-edit-fields';

describe('filterJobEditFields', () => {
  it('keeps every field the schedule-board edit form actually sends', () => {
    // The exact payload JobDetailView builds in handleSaveEdit.
    const body = {
      customer_name: 'Acme',
      customer_contact: 'Jane',
      site_contact_phone: '555-0100',
      location: 'Bay 4',
      address: '1 Main St',
      estimated_cost: '1200',
      salesman_name: 'Bob',
      po_number: 'PO-9',
      scheduled_date: '2026-08-04',
      end_date: '2026-08-05',
      arrival_time: '07:00',
      description: 'Wall sawing',
      additional_info: 'Gate code 1234',
      directions: 'Enter from the alley',
      jobsite_conditions: { inside_outside: 'inside' },
      site_compliance: { badging_required: true },
      scope_details: { wall_saw: { cuts: '[]' } },
      equipment_needed: ['WS'],
      equipment_rentals: [{ item: 'lift' }],
    };

    const { updates, dropped } = filterJobEditFields(body);

    expect(dropped).toEqual([]);
    expect(updates).toEqual(body);
    expect(Object.keys(updates)).toHaveLength(19);
  });

  it('drops unknown keys instead of forwarding them to PostgREST', () => {
    const { updates, dropped } = filterJobEditFields({
      customer_name: 'Acme',
      directionz: 'typo field',
      id: 'should-never-be-updatable',
      tenant_id: 'other-tenant',
      status: 'completed',
      assigned_to: 'someone-else',
    });

    expect(updates).toEqual({ customer_name: 'Acme' });
    expect(dropped).toEqual(['directionz', 'id', 'tenant_id', 'status', 'assigned_to']);
  });

  it('never lets an unknown key poison the rest of the update', () => {
    // The live bug: one phantom column made EVERY field fail to save.
    const { updates, dropped } = filterJobEditFields({
      customer_name: 'Acme',
      phantom_column: 'boom',
      description: 'still saves',
    });

    expect(updates).toEqual({ customer_name: 'Acme', description: 'still saves' });
    expect(dropped).toEqual(['phantom_column']);
  });

  it('preserves falsy values (empty string, 0, false, null)', () => {
    const { updates } = filterJobEditFields({
      end_date: '',
      scheduled_date: '',
      estimated_cost: 0,
      is_will_call: false,
      additional_info: null,
    });

    expect(updates).toEqual({
      end_date: '',
      scheduled_date: '',
      estimated_cost: 0,
      is_will_call: false,
      additional_info: null,
    });
  });

  it('treats explicit undefined as "not sent"', () => {
    const { updates, dropped } = filterJobEditFields({
      customer_name: undefined,
      nonsense: undefined,
      description: 'x',
    });

    expect(updates).toEqual({ description: 'x' });
    expect(dropped).toEqual([]);
  });

  it('returns empty for non-object payloads', () => {
    for (const bad of [null, undefined, 'string', 42, ['a'], true]) {
      const { updates, dropped } = filterJobEditFields(bad);
      expect(updates).toEqual({});
      expect(dropped).toEqual([]);
    }
  });

  it('does not mutate the caller payload', () => {
    const body = { customer_name: 'Acme', bogus: 1 };
    const snapshot = { ...body };
    filterJobEditFields(body);
    expect(body).toEqual(snapshot);
  });

  it('exposes a stable, duplicate-free allowlist', () => {
    expect(new Set(JOB_EDIT_ALLOWED_FIELDS).size).toBe(JOB_EDIT_ALLOWED_FIELDS.length);
    // Identity/ownership/status columns must never be client-editable here.
    for (const forbidden of ['id', 'tenant_id', 'status', 'assigned_to', 'job_number', 'created_at']) {
      expect(JOB_EDIT_ALLOWED_FIELDS as readonly string[]).not.toContain(forbidden);
    }
  });
});

describe('describeJobEditError', () => {
  it('names the column from a PostgREST schema-cache error', () => {
    const msg = describeJobEditError({
      code: 'PGRST204',
      message: "Could not find the 'directions' column of 'job_orders' in the schema cache",
    });
    expect(msg).toContain('"directions"');
    expect(msg).toContain('nothing was saved');
  });

  it('names the column from a Postgres 42703 error', () => {
    const msg = describeJobEditError({
      code: '42703',
      message: 'column "directions" of relation "job_orders" does not exist',
    });
    expect(msg).toContain('"directions"');
  });

  it('falls back gracefully when the column cannot be parsed', () => {
    const msg = describeJobEditError({ code: '42703', message: 'unparseable' });
    expect(msg).toContain('one of the submitted fields');
  });

  it('passes through unrelated errors verbatim', () => {
    expect(describeJobEditError({ code: '23505', message: 'duplicate key value' }))
      .toBe('duplicate key value');
  });

  it('has a safe default for a missing error', () => {
    expect(describeJobEditError(null)).toBe('Could not save changes. Please try again.');
  });
});
