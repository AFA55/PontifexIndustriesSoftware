/**
 * Regression tests for the "Failed to duplicate" bug (Aug 2026).
 *
 * job_orders has GENERATED ALWAYS columns (total_cost, gross_profit). The old
 * duplicate route spread every key off the source row into the INSERT, so
 * Postgres rejected the whole statement (SQLSTATE 428C9) and NOT ONE duplicate
 * had ever succeeded in production. These tests pin the exclusion rules.
 */

import {
  buildDuplicatePayload,
  isCopyableColumn,
  generatedColumnFromInsertError,
  withoutColumns,
  describeInsertError,
  insertJobOrderCopy,
  JOB_ORDER_GENERATED_COLUMNS,
  DUPLICATE_COPYABLE_COLUMNS,
} from './duplicate-job-order';

const original = {
  id: 'job-1',
  tenant_id: 'tenant-1',
  job_number: 'JOB-2026-000001',
  customer_name: 'Acme Concrete',
  address: '123 Main St',
  equipment_needed: ['wall-saw'],
  scope_details: { cuts: 3 },
  notes: 'Bring the 14in blade',
  scheduled_date: '2026-08-01',
  end_date: null,
  status: 'in_progress',
  assigned_to: 'operator-a',
  helper_assigned_to: 'helper-a',
  created_by: 'office-a',
  created_at: '2026-07-01T00:00:00Z',
  updated_at: '2026-07-30T00:00:00Z',
  dispatched_at: '2026-08-01T12:00:00Z',
  completed_at: null,
  deleted_at: null,
  deleted_by: null,

  // ── Everything below MUST NOT reach the copy ──────────────────────────────
  // Live progress — the board's status pill reads exactly these.
  in_route_at: '2026-08-01T08:00:00Z',
  arrived_at_jobsite_at: '2026-08-01T08:40:00Z',
  work_started_at: '2026-08-01T09:00:00Z',
  work_completed_at: '2026-08-01T15:00:00Z',
  route_started_at: '2026-08-01T07:50:00Z',
  actual_start_time: '09:00',
  actual_end_time: '15:00',
  assigned_at: '2026-07-31T00:00:00Z',
  dispatch_status: 'dispatched',
  loading_started_at: '2026-08-01T07:00:00Z',
  done_for_day_at: null,
  // Signatures / compliance documents
  customer_signature: 'data:image/png;base64,xxx',
  customer_signed_at: '2026-08-01T18:00:00Z',
  completion_signature: 'data:image/png;base64,yyy',
  completion_signature_url: 'https://example/sig.png',
  completion_signer_name: 'Site Super',
  completion_signed_at: '2026-08-01T18:05:00Z',
  completion_pdf_url: 'https://example/completion.pdf',
  work_order_signed: true,
  work_order_signature: 'data:image/png;base64,zzz',
  utility_waiver_signed: true,
  utility_waiver_signature_data: 'data:image/png;base64,www',
  liability_release_signed_at: '2026-08-01T07:30:00Z',
  liability_release_signature: 'data:image/png;base64,vvv',
  liability_release_pdf: 'https://example/release.pdf',
  cut_through_signature: 'data:image/png;base64,uuu',
  cut_through_authorized: true,
  agreement_pdf: 'https://example/agreement.pdf',
  silica_form_pdf: 'https://example/silica.pdf',
  // The previous crew's work log
  work_performed: 'Cut 40 LF of 8in wall',
  materials_used: 'water, poly',
  equipment_used: ['wall-saw'],
  operator_notes: 'Access was tight',
  issues_encountered: 'Waited on the GC',
  photo_urls: ['https://example/1.jpg'],
  // Hours / billing
  total_hours_worked: 8,
  total_days_worked: 1,
  billable_hours: 8,
  overtime_hours: 0,
  billing_status: 'invoiced',
  invoice_number: 'INV-1001',
  invoiced_at: '2026-08-02T00:00:00Z',
  paid_at: null,
  total_revenue: 4000,
  // Actual costs — these FEED the generated total_cost, so copying double-counts
  labor_cost: 500,
  material_cost: 120,
  equipment_cost: 90,
  fuel_cost: 40,
  subcontractor_cost: 0,
  other_cost: 10,
  // Lifecycle / post-job assessment
  on_hold: true,
  on_hold_reason: 'weather',
  rejected_by: null,
  rejection_reason: null,
  reminder_sent: true,
  missing_info_flagged: true,
  customer_overall_rating: 5,
  customer_feedback_comments: 'Great crew',
  feedback_submitted_at: '2026-08-02T00:00:00Z',
  job_difficulty_rating: 4,
  work_area_accessibility_rating: 2,
  // GENERATED ALWAYS — Postgres computes these, any INSERT naming them fails
  total_cost: 760,
  gross_profit: 3240,
};

const opts = {
  jobNumber: 'JOB-2026-999999',
  scheduledDate: '2026-08-15',
  parentJobId: 'job-1',
};

describe('buildDuplicatePayload — generated columns', () => {
  it('drops every GENERATED column (the actual bug)', () => {
    const payload = buildDuplicatePayload(original, opts);
    for (const col of JOB_ORDER_GENERATED_COLUMNS) {
      expect(payload).not.toHaveProperty(col);
    }
    expect(payload).not.toHaveProperty('total_cost');
    expect(payload).not.toHaveProperty('gross_profit');
  });

  it('drops the ACTUAL cost inputs — copying them double-counts job cost', () => {
    // total_cost is GENERATED from these. Copy the inputs and Postgres
    // recomputes the same total on a job nobody has worked yet.
    const payload = buildDuplicatePayload(original, opts);
    for (const col of ['labor_cost', 'material_cost', 'equipment_cost', 'fuel_cost', 'subcontractor_cost', 'other_cost']) {
      expect(payload).not.toHaveProperty(col);
    }
  });

  it('never treats a generated column as copyable', () => {
    expect(isCopyableColumn('total_cost')).toBe(false);
    expect(isCopyableColumn('gross_profit')).toBe(false);
    expect(isCopyableColumn('customer_name')).toBe(true);
  });

  it('allowlists nothing that Postgres generates', () => {
    for (const col of JOB_ORDER_GENERATED_COLUMNS) {
      expect(DUPLICATE_COPYABLE_COLUMNS).not.toContain(col);
    }
  });
});

describe('buildDuplicatePayload — a copy must not inherit a job being DONE', () => {
  // The bug this pins: the first version used a 15-entry DENYLIST over a
  // 206-column table. Duplication had never once succeeded, so nothing caught
  // that the copy would arrive signed, logged, invoiced and already "Working".
  const payload = buildDuplicatePayload(original, opts);

  it('does not inherit live-progress timestamps (the board would show "Working")', () => {
    for (const col of [
      'in_route_at', 'arrived_at_jobsite_at', 'work_started_at', 'work_completed_at',
      'route_started_at', 'actual_start_time', 'actual_end_time', 'assigned_at',
      'dispatch_status', 'loading_started_at', 'dispatched_at',
    ]) {
      expect(payload).not.toHaveProperty(col);
    }
  });

  it('does not inherit ANY signature or signed document', () => {
    for (const col of [
      'customer_signature', 'customer_signed_at',
      'completion_signature', 'completion_signature_url', 'completion_signer_name',
      'completion_signed_at', 'completion_pdf_url',
      'work_order_signed', 'work_order_signature',
      'utility_waiver_signed', 'utility_waiver_signature_data',
      'liability_release_signed_at', 'liability_release_signature', 'liability_release_pdf',
      'cut_through_signature', 'cut_through_authorized',
      'agreement_pdf', 'silica_form_pdf',
    ]) {
      expect(payload).not.toHaveProperty(col);
    }
  });

  it("does not inherit the previous crew's work log", () => {
    for (const col of ['work_performed', 'materials_used', 'equipment_used', 'operator_notes', 'issues_encountered', 'photo_urls']) {
      expect(payload).not.toHaveProperty(col);
    }
  });

  it('does not inherit hours or billing state', () => {
    for (const col of [
      'total_hours_worked', 'total_days_worked', 'billable_hours', 'overtime_hours',
      'billing_status', 'invoice_number', 'invoiced_at', 'paid_at', 'total_revenue',
    ]) {
      expect(payload).not.toHaveProperty(col);
    }
  });

  it('does not inherit lifecycle flags or post-job assessments', () => {
    for (const col of [
      'on_hold', 'on_hold_reason', 'reminder_sent', 'missing_info_flagged',
      'customer_overall_rating', 'customer_feedback_comments', 'feedback_submitted_at',
      'job_difficulty_rating', 'work_area_accessibility_rating',
      'deleted_at', 'deleted_by',
    ]) {
      expect(payload).not.toHaveProperty(col);
    }
  });

  it('copies ONLY allowlisted columns — an unknown future column is never carried', () => {
    const withNewColumn = buildDuplicatePayload(
      { ...original, some_future_migration_column: 'should not copy' },
      opts
    );
    expect(withNewColumn).not.toHaveProperty('some_future_migration_column');

    const setByBuilder = new Set(['job_number', 'scheduled_date', 'end_date', 'status', 'parent_job_id', 'created_by', 'created_via', 'helper_assigned_to']);
    for (const key of Object.keys(withNewColumn)) {
      if (setByBuilder.has(key)) continue;
      expect(DUPLICATE_COPYABLE_COLUMNS).toContain(key);
    }
  });

  it("stamps created_via='duplicate' so the copy can't land in the schedule-forms inbox", () => {
    // /api/admin/schedule-forms filters on created_via='schedule_form'.
    const fromForm = buildDuplicatePayload({ ...original, created_via: 'schedule_form' }, opts);
    expect(fromForm.created_via).toBe('duplicate');
  });

  it('never copies the quoted revenue (job_quote) even though it copies estimated_cost', () => {
    const payload = buildDuplicatePayload({ ...original, job_quote: 9000, estimated_cost: 4000 }, opts);
    expect(payload).not.toHaveProperty('job_quote');
    expect(payload.estimated_cost).toBe(4000);
  });

  it('attributes the copy to whoever clicked Duplicate, not the original author', () => {
    expect(buildDuplicatePayload(original, { ...opts, createdBy: 'office-b' }).created_by).toBe('office-b');
    expect(buildDuplicatePayload(original, opts)).not.toHaveProperty('created_by');
  });
});

describe('buildDuplicatePayload — business fields', () => {
  it('carries the business fields onto the copy', () => {
    const payload = buildDuplicatePayload(original, opts);
    expect(payload.customer_name).toBe('Acme Concrete');
    expect(payload.address).toBe('123 Main St');
    expect(payload.equipment_needed).toEqual(['wall-saw']);
    expect(payload.scope_details).toEqual({ cuts: 3 });
    expect(payload.tenant_id).toBe('tenant-1');
  });

  it('resets identity/lifecycle fields', () => {
    const payload = buildDuplicatePayload(original, opts);
    expect(payload).not.toHaveProperty('id');
    expect(payload).not.toHaveProperty('created_at');
    expect(payload).not.toHaveProperty('updated_at');
    expect(payload).not.toHaveProperty('dispatched_at');
    expect(payload).not.toHaveProperty('customer_signature');
    expect(payload).not.toHaveProperty('customer_signed_at');
    expect(payload).not.toHaveProperty('loading_started_at');
    expect(payload.job_number).toBe('JOB-2026-999999');
    expect(payload.status).toBe('scheduled');
    expect(payload.scheduled_date).toBe('2026-08-15');
    expect(payload.end_date).toBeNull();
    expect(payload.parent_job_id).toBe('job-1');
  });

  it('lands unassigned by default — no lead, no helper', () => {
    const payload = buildDuplicatePayload(original, opts);
    expect(payload).not.toHaveProperty('assigned_to');
    expect(payload).not.toHaveProperty('helper_assigned_to');
  });

  it('carries only the helper seat when copyCrew is set — never the lead', () => {
    const payload = buildDuplicatePayload(original, { ...opts, copyCrew: true });
    expect(payload.helper_assigned_to).toBe('helper-a');
    expect(payload).not.toHaveProperty('assigned_to');
  });

  it('appends the duplicate reason to the existing additional_info', () => {
    const payload = buildDuplicatePayload(
      { ...original, additional_info: 'Gate code 4321' },
      { ...opts, notes: 'second crew' }
    );
    expect(payload.additional_info).toBe('Gate code 4321\n---\nDuplicated: second crew');
  });

  it('sets additional_info from scratch when the source had none', () => {
    const payload = buildDuplicatePayload(original, { ...opts, notes: 'second crew' });
    expect(payload.additional_info).toBe('Duplicated: second crew');
  });

  it('never invents a `notes` column', () => {
    // job_orders (prod, Aug 2026) has NO plain `notes` column — writing one
    // fails the INSERT exactly like the generated columns did. Even when the
    // SOURCE row carries a `notes` key, the copy must not.
    const payload = buildDuplicatePayload(original, { ...opts, notes: 'second crew' });
    expect(payload).not.toHaveProperty('notes');
  });

  it('passes end_date through and normalizes falsy to null', () => {
    expect(buildDuplicatePayload(original, { ...opts, endDate: '2026-08-18' }).end_date).toBe('2026-08-18');
    expect(buildDuplicatePayload(original, { ...opts, endDate: '' }).end_date).toBeNull();
  });

  it('does not mutate the source row', () => {
    const snapshot = JSON.parse(JSON.stringify(original));
    buildDuplicatePayload(original, { ...opts, notes: 'x', copyCrew: true });
    expect(original).toEqual(snapshot);
  });
});

describe('generatedColumnFromInsertError', () => {
  it('extracts the column from the Postgres message', () => {
    expect(
      generatedColumnFromInsertError({
        code: '428C9',
        message: 'cannot insert a non-DEFAULT value into column "total_cost"',
      })
    ).toBe('total_cost');
  });

  it('extracts from the PostgREST "generated column" wording', () => {
    expect(
      generatedColumnFromInsertError({ code: 'PGRST204', message: 'column "gross_profit" is a generated column' })
    ).toBe('gross_profit');
  });

  it('returns null for unrelated errors', () => {
    expect(generatedColumnFromInsertError({ code: '23505', message: 'duplicate key value violates unique constraint' })).toBeNull();
    expect(generatedColumnFromInsertError(null)).toBeNull();
  });
});

describe('withoutColumns', () => {
  it('removes the named columns without mutating the input', () => {
    const input = { a: 1, b: 2, c: 3 };
    expect(withoutColumns(input, ['b'])).toEqual({ a: 1, c: 3 });
    expect(input).toEqual({ a: 1, b: 2, c: 3 });
  });
});

describe('describeInsertError', () => {
  it('surfaces the Postgres message instead of a bare failure string', () => {
    const msg = describeInsertError({
      code: '428C9',
      message: 'cannot insert a non-DEFAULT value into column "total_cost"',
      details: null,
      hint: 'Use OVERRIDING SYSTEM VALUE',
    });
    expect(msg).toContain('total_cost');
    expect(msg).toContain('428C9');
  });

  it('falls back to the prefix when there is no error', () => {
    expect(describeInsertError(null, 'Failed to duplicate job order')).toBe('Failed to duplicate job order');
  });
});

describe('insertJobOrderCopy — self-healing retry', () => {
  function clientThatRejects(columns: string[]) {
    const calls: Record<string, any>[] = [];
    const client = {
      from: () => ({
        insert: (payload: Record<string, any>) => {
          calls.push(payload);
          const offender = columns.find((c) => c in payload);
          return {
            select: () => ({
              single: async () =>
                offender
                  ? { data: null, error: { code: '428C9', message: `cannot insert a non-DEFAULT value into column "${offender}"` } }
                  : { data: { id: 'new-job' }, error: null },
            }),
          };
        },
      }),
    };
    return { client, calls };
  }

  it('strips an UNKNOWN generated column and retries instead of failing', async () => {
    const { client, calls } = clientThatRejects(['margin_pct']);
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const res = await insertJobOrderCopy(client as any, { customer_name: 'Acme', margin_pct: 12 });
    warn.mockRestore();

    expect(res.error).toBeNull();
    expect(res.data).toEqual({ id: 'new-job' });
    expect(res.strippedColumns).toEqual(['margin_pct']);
    expect(calls).toHaveLength(2);
    expect(calls[1]).not.toHaveProperty('margin_pct');
    expect(calls[1].customer_name).toBe('Acme');
  });

  it('gives up (bounded) and returns the raw error rather than looping', async () => {
    const { client, calls } = clientThatRejects(['a', 'b', 'c', 'd']);
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const res = await insertJobOrderCopy(client as any, { a: 1, b: 2, c: 3, d: 4 });
    warn.mockRestore();

    expect(res.data).toBeNull();
    expect(res.error.code).toBe('428C9');
    expect(calls).toHaveLength(3);
  });

  it('does not retry on unrelated errors', async () => {
    const calls: any[] = [];
    const client = {
      from: () => ({
        insert: (payload: any) => {
          calls.push(payload);
          return {
            select: () => ({
              single: async () => ({ data: null, error: { code: '23505', message: 'duplicate key' } }),
            }),
          };
        },
      }),
    };
    const res = await insertJobOrderCopy(client as any, { a: 1 });
    expect(res.error.code).toBe('23505');
    expect(calls).toHaveLength(1);
  });
});
