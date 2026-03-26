-- =============================================================================
-- Printable Documents Full Deployment
-- =============================================================================
-- Creates the document template registry and generated documents table.
-- Seeds 4 production-ready HTML/CSS templates:
--   1. job_ticket_landscape  — dispatch ticket for the field crew
--   2. daily_schedule_landscape — ops manager's daily run sheet
--   3. timecard_summary      — weekly timecard review sheet
--   4. equipment_checklist   — pre-job equipment verification sheet
-- Also creates generate_job_ticket_data() and generate_schedule_data() helpers.
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. document_templates table
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.document_templates (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_key    TEXT NOT NULL UNIQUE,          -- machine-readable key
  name            TEXT NOT NULL,
  description     TEXT,
  document_type   TEXT NOT NULL
    CHECK (document_type IN (
      'job_ticket', 'daily_schedule', 'timecard', 'invoice',
      'equipment_checklist', 'scope_sheet', 'custom'
    )),
  orientation     TEXT NOT NULL DEFAULT 'landscape'
    CHECK (orientation IN ('portrait', 'landscape')),
  paper_size      TEXT NOT NULL DEFAULT 'letter'
    CHECK (paper_size IN ('letter', 'legal', 'a4')),
  html_template   TEXT NOT NULL,                 -- Handlebars/Mustache-style HTML
  css_styles      TEXT,                          -- scoped CSS
  variables       JSONB DEFAULT '[]',            -- [{name, label, type, required}]
  is_active       BOOLEAN NOT NULL DEFAULT true,
  is_system       BOOLEAN NOT NULL DEFAULT false, -- system templates cannot be deleted
  version         INTEGER NOT NULL DEFAULT 1,
  created_by      UUID REFERENCES auth.users(id),
  updated_by      UUID REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.document_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "doc_templates_admin_all" ON public.document_templates
  FOR ALL
  USING (
    (auth.jwt() -> 'user_metadata' ->> 'role') IN
      ('super_admin', 'operations_manager', 'admin')
  );

CREATE POLICY "doc_templates_read_auth" ON public.document_templates
  FOR SELECT
  USING (auth.role() = 'authenticated' AND is_active = true);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. generated_documents table
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.generated_documents (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id     UUID NOT NULL REFERENCES public.document_templates(id) ON DELETE RESTRICT,
  template_key    TEXT NOT NULL,
  -- Source reference
  job_order_id    UUID REFERENCES public.job_orders(id) ON DELETE SET NULL,
  reference_id    UUID,               -- generic FK for non-job documents
  reference_type  TEXT,               -- 'job_order' | 'timecard_period' | 'schedule_date'
  -- Generated content
  rendered_html   TEXT,               -- final HTML after variable substitution
  storage_path    TEXT,               -- Supabase Storage path if PDF was saved
  storage_url     TEXT,               -- public URL if applicable
  data_snapshot   JSONB,             -- snapshot of the data at generation time
  -- Metadata
  generated_by    UUID REFERENCES auth.users(id),
  generated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  print_count     INTEGER NOT NULL DEFAULT 0,
  last_printed_at TIMESTAMPTZ,
  notes           TEXT
);

ALTER TABLE public.generated_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "gen_docs_admin_all" ON public.generated_documents
  FOR ALL
  USING (
    (auth.jwt() -> 'user_metadata' ->> 'role') IN
      ('super_admin', 'operations_manager', 'admin', 'shop_manager')
  );

CREATE POLICY "gen_docs_own" ON public.generated_documents
  FOR SELECT
  USING (generated_by = auth.uid());

CREATE INDEX IF NOT EXISTS idx_gen_docs_job_order
  ON public.generated_documents(job_order_id) WHERE job_order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_gen_docs_template
  ON public.generated_documents(template_id);
CREATE INDEX IF NOT EXISTS idx_gen_docs_generated_at
  ON public.generated_documents(generated_at DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Seed template 1: job_ticket_landscape
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO public.document_templates (
  template_key, name, description, document_type, orientation, paper_size,
  is_system, html_template, css_styles, variables
) VALUES (
  'job_ticket_landscape',
  'Job Ticket (Landscape)',
  'Dispatch ticket for field crew — includes job details, scope, equipment list, and sign-off blocks',
  'job_ticket',
  'landscape',
  'letter',
  true,
$$<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><title>Job Ticket — {{job_number}}</title></head>
<body>
<div class="page">
  <header class="header">
    <div class="company-block">
      <h1 class="company-name">{{company_name}}</h1>
      <p class="company-tagline">Concrete Cutting &amp; Drilling</p>
    </div>
    <div class="ticket-meta">
      <div class="job-number-badge">{{job_number}}</div>
      <p class="print-date">Printed: {{print_date}}</p>
    </div>
  </header>

  <div class="two-col">
    <section class="card">
      <h2 class="card-title">Job Information</h2>
      <table class="info-table">
        <tr><td class="label">Customer</td><td>{{customer_name}}</td></tr>
        <tr><td class="label">Contact</td><td>{{customer_contact}}</td></tr>
        <tr><td class="label">Job Type</td><td>{{job_type}}</td></tr>
        <tr><td class="label">Date</td><td>{{scheduled_date}}</td></tr>
        <tr><td class="label">Arrival</td><td>{{arrival_time}}</td></tr>
        <tr><td class="label">Est. Hours</td><td>{{estimated_hours}} hrs</td></tr>
        <tr><td class="label">Priority</td><td>{{priority}}</td></tr>
        <tr><td class="label">PO #</td><td>{{po_number}}</td></tr>
      </table>
    </section>

    <section class="card">
      <h2 class="card-title">Location</h2>
      <p class="address-block">{{address}}</p>
      <table class="info-table">
        <tr><td class="label">Foreman</td><td>{{foreman_name}}</td></tr>
        <tr><td class="label">Phone</td><td>{{foreman_phone}}</td></tr>
        <tr><td class="label">Operator</td><td>{{operator_name}}</td></tr>
        <tr><td class="label">Helper</td><td>{{helper_name}}</td></tr>
      </table>
    </section>
  </div>

  <section class="card full-width">
    <h2 class="card-title">Scope of Work</h2>
    <p class="description">{{description}}</p>
  </section>

  <div class="two-col">
    <section class="card">
      <h2 class="card-title">Equipment Required</h2>
      <ul class="checklist">{{#each equipment_items}}<li><span class="check-box"></span> {{this}}</li>{{/each}}</ul>
      <div class="special-equipment">{{special_equipment}}</div>
    </section>

    <section class="card">
      <h2 class="card-title">Required Documents / Permits</h2>
      <ul class="checklist">{{#each required_documents}}<li><span class="check-box"></span> {{this}}</li>{{/each}}</ul>
    </section>
  </div>

  <section class="card full-width">
    <h2 class="card-title">Operator Notes</h2>
    <div class="notes-area"></div>
  </section>

  <footer class="signoff-row">
    <div class="signoff-block">
      <div class="sig-line"></div>
      <p class="sig-label">Operator Signature &amp; Date</p>
    </div>
    <div class="signoff-block">
      <div class="sig-line"></div>
      <p class="sig-label">Customer Signature &amp; Date</p>
    </div>
    <div class="signoff-block">
      <div class="sig-line"></div>
      <p class="sig-label">Customer Printed Name</p>
    </div>
  </footer>
</div>
</body>
</html>$$,
$$@page { size: letter landscape; margin: 0.5in; }
* { box-sizing: border-box; margin: 0; padding: 0; font-family: Arial, sans-serif; }
.page { width: 100%; color: #1e293b; }
.header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px; padding-bottom: 8px; border-bottom: 3px solid #6366f1; }
.company-name { font-size: 22px; font-weight: 900; color: #6366f1; }
.company-tagline { font-size: 10px; color: #64748b; }
.job-number-badge { font-size: 18px; font-weight: 700; background: #6366f1; color: #fff; padding: 4px 12px; border-radius: 4px; }
.print-date { font-size: 9px; color: #94a3b8; text-align: right; margin-top: 4px; }
.two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 10px; }
.card { border: 1px solid #e2e8f0; border-radius: 4px; padding: 8px 10px; }
.full-width { margin-bottom: 10px; }
.card-title { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #6366f1; margin-bottom: 6px; border-bottom: 1px solid #e2e8f0; padding-bottom: 3px; }
.info-table { width: 100%; border-collapse: collapse; font-size: 11px; }
.info-table tr td { padding: 2px 4px; }
.label { font-weight: 600; color: #475569; width: 90px; }
.address-block { font-size: 12px; font-weight: 600; margin-bottom: 8px; }
.description { font-size: 11px; line-height: 1.5; min-height: 40px; }
.checklist { list-style: none; font-size: 11px; }
.checklist li { margin-bottom: 3px; }
.check-box { display: inline-block; width: 12px; height: 12px; border: 1px solid #475569; margin-right: 6px; vertical-align: middle; }
.special-equipment { font-size: 10px; color: #64748b; margin-top: 6px; font-style: italic; }
.notes-area { min-height: 50px; border-bottom: 1px solid #cbd5e1; margin-bottom: 4px; }
.signoff-row { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 20px; margin-top: 12px; }
.sig-line { border-bottom: 1.5px solid #334155; height: 30px; margin-bottom: 4px; }
.sig-label { font-size: 9px; color: #64748b; text-align: center; }$$,
'[{"name":"job_number","label":"Job Number","type":"string","required":true},{"name":"company_name","label":"Company Name","type":"string","required":true},{"name":"customer_name","label":"Customer Name","type":"string","required":true},{"name":"address","label":"Job Address","type":"string","required":true},{"name":"scheduled_date","label":"Scheduled Date","type":"string","required":true}]'::JSONB
) ON CONFLICT (template_key) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Seed template 2: daily_schedule_landscape
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO public.document_templates (
  template_key, name, description, document_type, orientation, paper_size,
  is_system, html_template, css_styles, variables
) VALUES (
  'daily_schedule_landscape',
  'Daily Schedule (Landscape)',
  'Operations manager run sheet for a single day — all jobs, operators, addresses, arrival times',
  'daily_schedule',
  'landscape',
  'letter',
  true,
$$<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><title>Daily Schedule — {{schedule_date}}</title></head>
<body>
<div class="page">
  <header class="header">
    <div>
      <h1 class="company-name">{{company_name}}</h1>
      <p class="subtitle">Daily Operations Schedule</p>
    </div>
    <div class="date-badge">{{schedule_date}}</div>
  </header>

  <table class="schedule-table">
    <thead>
      <tr>
        <th>Job #</th>
        <th>Customer</th>
        <th>Address</th>
        <th>Type</th>
        <th>Arrival</th>
        <th>Est Hrs</th>
        <th>Operator</th>
        <th>Helper</th>
        <th>Priority</th>
        <th>Status</th>
        <th>Notes</th>
      </tr>
    </thead>
    <tbody>
      {{#each jobs}}
      <tr class="{{row_class}}">
        <td class="job-num">{{job_number}}</td>
        <td>{{customer_name}}</td>
        <td class="address">{{address}}</td>
        <td>{{job_type}}</td>
        <td class="time">{{arrival_time}}</td>
        <td class="center">{{estimated_hours}}</td>
        <td>{{operator_name}}</td>
        <td>{{helper_name}}</td>
        <td class="center">{{priority}}</td>
        <td><span class="status-pill status-{{status}}">{{status}}</span></td>
        <td class="notes-col"></td>
      </tr>
      {{/each}}
    </tbody>
  </table>

  <footer class="doc-footer">
    <span>Generated: {{print_date}}</span>
    <span>Total Jobs: {{total_jobs}}</span>
    <span>Total Est. Hours: {{total_hours}}</span>
  </footer>
</div>
</body>
</html>$$,
$$@page { size: letter landscape; margin: 0.4in; }
* { box-sizing: border-box; margin: 0; padding: 0; font-family: Arial, sans-serif; }
.page { width: 100%; color: #1e293b; }
.header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; padding-bottom: 8px; border-bottom: 3px solid #6366f1; }
.company-name { font-size: 20px; font-weight: 900; color: #6366f1; }
.subtitle { font-size: 11px; color: #64748b; }
.date-badge { font-size: 20px; font-weight: 700; color: #6366f1; }
.schedule-table { width: 100%; border-collapse: collapse; font-size: 10px; }
.schedule-table th { background: #6366f1; color: #fff; padding: 5px 6px; text-align: left; font-weight: 600; }
.schedule-table td { padding: 4px 6px; border-bottom: 1px solid #e2e8f0; vertical-align: top; }
.schedule-table tbody tr:nth-child(even) { background: #f8fafc; }
.job-num { font-weight: 700; color: #6366f1; white-space: nowrap; }
.address { font-size: 9px; }
.time { white-space: nowrap; }
.center { text-align: center; }
.notes-col { min-width: 80px; }
.status-pill { display: inline-block; padding: 1px 6px; border-radius: 999px; font-size: 9px; font-weight: 600; }
.status-scheduled { background: #dbeafe; color: #1d4ed8; }
.status-in_progress { background: #dcfce7; color: #15803d; }
.status-completed { background: #f1f5f9; color: #475569; }
.status-assigned { background: #ede9fe; color: #7c3aed; }
.doc-footer { display: flex; justify-content: space-between; margin-top: 10px; font-size: 9px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 6px; }$$,
'[{"name":"schedule_date","label":"Schedule Date","type":"string","required":true},{"name":"company_name","label":"Company Name","type":"string","required":true},{"name":"jobs","label":"Jobs Array","type":"array","required":true}]'::JSONB
) ON CONFLICT (template_key) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Seed template 3: timecard_summary
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO public.document_templates (
  template_key, name, description, document_type, orientation, paper_size,
  is_system, html_template, css_styles, variables
) VALUES (
  'timecard_summary',
  'Timecard Summary',
  'Weekly timecard review sheet — all operators, hours by type (regular/OT/DT), total cost',
  'timecard',
  'landscape',
  'letter',
  true,
$$<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><title>Timecard Summary — {{period_label}}</title></head>
<body>
<div class="page">
  <header class="header">
    <div>
      <h1 class="company-name">{{company_name}}</h1>
      <p class="subtitle">Timecard Summary</p>
    </div>
    <div class="period-badge">{{period_label}}</div>
  </header>

  <table class="tc-table">
    <thead>
      <tr>
        <th>Employee</th>
        <th>Role</th>
        <th>Date</th>
        <th>Clock In</th>
        <th>Clock Out</th>
        <th class="num">Reg Hrs</th>
        <th class="num">OT Hrs</th>
        <th class="num">DT Hrs</th>
        <th class="num">Total Hrs</th>
        <th>Method</th>
        <th>Job #</th>
        <th>Status</th>
      </tr>
    </thead>
    <tbody>
      {{#each entries}}
      <tr>
        <td class="name">{{full_name}}</td>
        <td class="role-cell">{{role}}</td>
        <td class="date-cell">{{date}}</td>
        <td class="time-cell">{{clock_in_time}}</td>
        <td class="time-cell">{{clock_out_time}}</td>
        <td class="num">{{regular_hours}}</td>
        <td class="num ot">{{overtime_hours}}</td>
        <td class="num dt">{{double_time_hours}}</td>
        <td class="num bold">{{total_hours}}</td>
        <td class="method-cell">{{clock_in_method}}</td>
        <td class="job-num">{{job_number}}</td>
        <td><span class="status-pill status-{{approval_status}}">{{approval_status}}</span></td>
      </tr>
      {{/each}}
    </tbody>
    <tfoot>
      <tr class="totals-row">
        <td colspan="5" class="totals-label">PERIOD TOTALS</td>
        <td class="num">{{totals.regular_hours}}</td>
        <td class="num ot">{{totals.overtime_hours}}</td>
        <td class="num dt">{{totals.double_time_hours}}</td>
        <td class="num bold">{{totals.total_hours}}</td>
        <td colspan="3" class="labor-cost">Est. Labor Cost: ${{totals.labor_cost}}</td>
      </tr>
    </tfoot>
  </table>

  <footer class="doc-footer">
    <span>Generated: {{print_date}}</span>
    <span>Total Entries: {{total_entries}}</span>
    <span>Pending Approval: {{pending_count}}</span>
  </footer>
</div>
</body>
</html>$$,
$$@page { size: letter landscape; margin: 0.4in; }
* { box-sizing: border-box; margin: 0; padding: 0; font-family: Arial, sans-serif; }
.page { color: #1e293b; }
.header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; padding-bottom: 8px; border-bottom: 3px solid #6366f1; }
.company-name { font-size: 20px; font-weight: 900; color: #6366f1; }
.subtitle { font-size: 11px; color: #64748b; }
.period-badge { font-size: 16px; font-weight: 700; color: #6366f1; }
.tc-table { width: 100%; border-collapse: collapse; font-size: 10px; }
.tc-table th { background: #6366f1; color: #fff; padding: 5px 6px; text-align: left; }
.tc-table th.num { text-align: right; }
.tc-table td { padding: 3px 6px; border-bottom: 1px solid #e2e8f0; }
.tc-table tbody tr:nth-child(even) { background: #f8fafc; }
.num { text-align: right; }
.bold { font-weight: 700; }
.ot { color: #d97706; }
.dt { color: #dc2626; }
.name { font-weight: 600; }
.job-num { color: #6366f1; font-weight: 600; }
.status-pill { display: inline-block; padding: 1px 5px; border-radius: 999px; font-size: 9px; font-weight: 600; }
.status-approved, .status-auto_approved { background: #dcfce7; color: #15803d; }
.status-pending { background: #fef9c3; color: #854d0e; }
.status-rejected { background: #fee2e2; color: #991b1b; }
.totals-row { background: #1e293b !important; color: #fff; font-weight: 700; }
.totals-row td { padding: 5px 6px; }
.totals-label { color: #94a3b8; }
.labor-cost { text-align: right; color: #86efac; }
.doc-footer { display: flex; justify-content: space-between; margin-top: 10px; font-size: 9px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 6px; }$$,
'[{"name":"period_label","label":"Period Label","type":"string","required":true},{"name":"company_name","label":"Company Name","type":"string","required":true},{"name":"entries","label":"Timecard Entries","type":"array","required":true},{"name":"totals","label":"Period Totals","type":"object","required":true}]'::JSONB
) ON CONFLICT (template_key) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Seed template 4: equipment_checklist
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO public.document_templates (
  template_key, name, description, document_type, orientation, paper_size,
  is_system, html_template, css_styles, variables
) VALUES (
  'equipment_checklist',
  'Equipment Checklist',
  'Pre-job equipment verification sheet — mandatory items, condition check, operator sign-off',
  'equipment_checklist',
  'portrait',
  'letter',
  true,
$$<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><title>Equipment Checklist — {{job_number}}</title></head>
<body>
<div class="page">
  <header class="header">
    <div>
      <h1 class="company-name">{{company_name}}</h1>
      <p class="subtitle">Pre-Job Equipment Checklist</p>
    </div>
    <div class="meta">
      <p class="job-num">{{job_number}}</p>
      <p class="meta-date">{{scheduled_date}}</p>
    </div>
  </header>

  <div class="job-info">
    <p><strong>Job:</strong> {{title}}</p>
    <p><strong>Customer:</strong> {{customer_name}}</p>
    <p><strong>Operator:</strong> {{operator_name}}</p>
    <p><strong>Address:</strong> {{address}}</p>
  </div>

  <h2 class="section-title">Mandatory Equipment</h2>
  <table class="checklist-table">
    <thead><tr><th>Item</th><th class="check-col">OK</th><th class="check-col">Damaged</th><th class="check-col">Missing</th><th>Notes</th></tr></thead>
    <tbody>
      {{#each mandatory_equipment}}
      <tr>
        <td>{{this}}</td>
        <td class="check-col"><div class="check-box"></div></td>
        <td class="check-col"><div class="check-box"></div></td>
        <td class="check-col"><div class="check-box"></div></td>
        <td class="notes-td"></td>
      </tr>
      {{/each}}
    </tbody>
  </table>

  <h2 class="section-title">Additional Equipment</h2>
  <table class="checklist-table">
    <thead><tr><th>Item</th><th class="check-col">OK</th><th class="check-col">Damaged</th><th class="check-col">Missing</th><th>Notes</th></tr></thead>
    <tbody>
      {{#each equipment_needed}}
      <tr>
        <td>{{this}}</td>
        <td class="check-col"><div class="check-box"></div></td>
        <td class="check-col"><div class="check-box"></div></td>
        <td class="check-col"><div class="check-box"></div></td>
        <td class="notes-td"></td>
      </tr>
      {{/each}}
    </tbody>
  </table>

  <div class="special-note">
    <strong>Special Equipment / Notes:</strong>
    <p>{{special_equipment}}</p>
  </div>

  <footer class="signoff-row">
    <div class="signoff-block">
      <div class="sig-line"></div>
      <p class="sig-label">Operator Signature</p>
    </div>
    <div class="signoff-block">
      <div class="sig-line"></div>
      <p class="sig-label">Date &amp; Time</p>
    </div>
    <div class="signoff-block">
      <div class="sig-line"></div>
      <p class="sig-label">Supervisor (if required)</p>
    </div>
  </footer>
</div>
</body>
</html>$$,
$$@page { size: letter portrait; margin: 0.5in; }
* { box-sizing: border-box; margin: 0; padding: 0; font-family: Arial, sans-serif; }
.page { color: #1e293b; }
.header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px; padding-bottom: 8px; border-bottom: 3px solid #6366f1; }
.company-name { font-size: 20px; font-weight: 900; color: #6366f1; }
.subtitle { font-size: 11px; color: #64748b; }
.job-num { font-size: 16px; font-weight: 700; color: #6366f1; text-align: right; }
.meta-date { font-size: 11px; color: #64748b; text-align: right; }
.job-info { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; font-size: 11px; margin-bottom: 12px; padding: 8px; background: #f8fafc; border-radius: 4px; border: 1px solid #e2e8f0; }
.section-title { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #6366f1; margin: 10px 0 4px; }
.checklist-table { width: 100%; border-collapse: collapse; font-size: 10px; margin-bottom: 12px; }
.checklist-table th { background: #6366f1; color: #fff; padding: 4px 8px; text-align: left; }
.checklist-table td { padding: 4px 8px; border-bottom: 1px solid #e2e8f0; }
.checklist-table tbody tr:nth-child(even) { background: #f8fafc; }
.check-col { width: 50px; text-align: center; }
.check-box { width: 14px; height: 14px; border: 1.5px solid #475569; margin: 0 auto; border-radius: 2px; }
.notes-td { min-width: 120px; }
.special-note { font-size: 10px; padding: 6px 8px; background: #fef9c3; border: 1px solid #fde047; border-radius: 4px; margin-bottom: 16px; }
.signoff-row { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 24px; margin-top: 16px; }
.sig-line { border-bottom: 1.5px solid #334155; height: 32px; margin-bottom: 4px; }
.sig-label { font-size: 9px; color: #64748b; text-align: center; }$$,
'[{"name":"job_number","label":"Job Number","type":"string","required":true},{"name":"company_name","label":"Company Name","type":"string","required":true},{"name":"mandatory_equipment","label":"Mandatory Equipment","type":"array","required":true},{"name":"equipment_needed","label":"Additional Equipment","type":"array","required":false}]'::JSONB
) ON CONFLICT (template_key) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. generate_job_ticket_data() — returns structured data for job ticket render
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.generate_job_ticket_data(p_job_order_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_job     RECORD;
  v_result  JSONB;
BEGIN
  SELECT
    jo.id,
    jo.job_number,
    jo.title,
    jo.customer_name,
    jo.customer_contact,
    jo.job_type,
    jo.address,
    jo.location,
    jo.description,
    jo.estimated_hours,
    jo.arrival_time,
    jo.shop_arrival_time,
    jo.priority,
    jo.po_number,
    jo.customer_job_number,
    jo.scheduled_date,
    jo.equipment_needed,
    jo.special_equipment,
    jo.mandatory_equipment,
    jo.required_documents,
    jo.operator_notes,
    jo.foreman_name,
    jo.foreman_phone,
    jo.dispatch_status,
    jo.dispatch_priority,
    jo.schedule_color,
    jo.schedule_color_label,
    p.full_name  AS operator_name,
    p.phone      AS operator_phone,
    hp.full_name AS helper_name
  INTO v_job
  FROM public.job_orders jo
  LEFT JOIN public.profiles p  ON p.id  = jo.assigned_to
  LEFT JOIN public.profiles hp ON hp.id = jo.helper_assigned_to
  WHERE jo.id = p_job_order_id AND jo.deleted_at IS NULL;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Job not found');
  END IF;

  v_result := jsonb_build_object(
    'job_number',          v_job.job_number,
    'title',               v_job.title,
    'customer_name',       v_job.customer_name,
    'customer_contact',    v_job.customer_contact,
    'job_type',            v_job.job_type,
    'address',             v_job.address,
    'location',            v_job.location,
    'description',         v_job.description,
    'estimated_hours',     v_job.estimated_hours,
    'arrival_time',        v_job.arrival_time,
    'shop_arrival_time',   v_job.shop_arrival_time,
    'priority',            v_job.priority,
    'po_number',           COALESCE(v_job.po_number, ''),
    'customer_job_number', COALESCE(v_job.customer_job_number, ''),
    'scheduled_date',      v_job.scheduled_date,
    'equipment_items',     COALESCE(v_job.equipment_needed, '{}'),
    'special_equipment',   COALESCE(v_job.special_equipment, ''),
    'mandatory_equipment', COALESCE(v_job.mandatory_equipment, '{}'),
    'required_documents',  COALESCE(v_job.required_documents, '{}'),
    'operator_notes',      COALESCE(v_job.operator_notes, ''),
    'foreman_name',        COALESCE(v_job.foreman_name, ''),
    'foreman_phone',       COALESCE(v_job.foreman_phone, ''),
    'operator_name',       COALESCE(v_job.operator_name, ''),
    'operator_phone',      COALESCE(v_job.operator_phone, ''),
    'helper_name',         COALESCE(v_job.helper_name, ''),
    'dispatch_status',     v_job.dispatch_status,
    'schedule_color',      COALESCE(v_job.schedule_color, '#6366f1'),
    'schedule_color_label',COALESCE(v_job.schedule_color_label, ''),
    'print_date',          TO_CHAR(NOW(), 'Mon DD, YYYY HH12:MI AM'),
    'company_name',        'Patriot Concrete Cutting'
  );

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. generate_schedule_data() — returns all jobs for a given date
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.generate_schedule_data(p_date DATE)
RETURNS JSONB AS $$
DECLARE
  v_jobs      JSONB;
  v_total_hrs DECIMAL(8,2);
  v_count     INTEGER;
BEGIN
  SELECT
    jsonb_agg(
      jsonb_build_object(
        'job_number',    jo.job_number,
        'title',         jo.title,
        'customer_name', jo.customer_name,
        'address',       COALESCE(jo.address, ''),
        'job_type',      jo.job_type,
        'arrival_time',  COALESCE(TO_CHAR(jo.arrival_time, 'HH12:MI AM'), ''),
        'estimated_hours', COALESCE(jo.estimated_hours, 0),
        'operator_name', COALESCE(p.full_name, 'Unassigned'),
        'helper_name',   COALESCE(hp.full_name, ''),
        'priority',      jo.priority,
        'status',        jo.status,
        'dispatch_status', jo.dispatch_status,
        'schedule_color',  COALESCE(jo.schedule_color, '#6366f1'),
        'row_class',     CASE
                           WHEN jo.on_hold THEN 'row-hold'
                           WHEN jo.priority = 'urgent' THEN 'row-urgent'
                           ELSE ''
                         END
      )
      ORDER BY
        CASE jo.dispatch_priority WHEN 1 THEN 0 ELSE jo.dispatch_priority END,
        jo.arrival_time ASC NULLS LAST
    ),
    SUM(COALESCE(jo.estimated_hours, 0)),
    COUNT(*)
  INTO v_jobs, v_total_hrs, v_count
  FROM public.job_orders jo
  LEFT JOIN public.profiles p  ON p.id  = jo.assigned_to
  LEFT JOIN public.profiles hp ON hp.id = jo.helper_assigned_to
  WHERE jo.scheduled_date = p_date
    AND jo.deleted_at IS NULL
    AND jo.status NOT IN ('cancelled');

  RETURN jsonb_build_object(
    'schedule_date',  TO_CHAR(p_date, 'Day, Month DD YYYY'),
    'print_date',     TO_CHAR(NOW(), 'Mon DD, YYYY HH12:MI AM'),
    'company_name',   'Patriot Concrete Cutting',
    'jobs',           COALESCE(v_jobs, '[]'::JSONB),
    'total_jobs',     COALESCE(v_count, 0),
    'total_hours',    COALESCE(v_total_hrs, 0)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
