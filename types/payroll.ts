/**
 * Payroll & Finance Types
 *
 * Maps directly to the payroll tables in Supabase:
 *   - operator_pay_rates
 *   - pay_periods
 *   - pay_period_entries
 *   - pay_adjustments
 *   - timecard_pay_links
 *   - payroll_settings
 *   - customers
 *   - invoices
 *   - invoice_line_items
 *   - payments
 */

// ─── Pay Rate Types ──────────────────────────────────────────────────────────

export type RateType = 'hourly' | 'salary' | 'day_rate';

export interface OperatorPayRate {
  id: string;
  operator_id: string;
  rate_type: RateType;
  regular_rate: number;
  overtime_rate: number;   // auto-computed: regular_rate * 1.5
  double_time_rate: number; // auto-computed: regular_rate * 2.0
  effective_date: string;  // DATE
  end_date: string | null;
  reason: string | null;
  approved_by: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

// ─── Pay Period Types ────────────────────────────────────────────────────────

export type PayPeriodStatus =
  | 'open'
  | 'locked'
  | 'processing'
  | 'approved'
  | 'paid'
  | 'void';

export interface PayPeriod {
  id: string;
  period_start: string; // DATE
  period_end: string;   // DATE
  pay_date: string | null;
  status: PayPeriodStatus;
  locked_at: string | null;
  locked_by: string | null;
  processed_at: string | null;
  processed_by: string | null;
  approved_at: string | null;
  approved_by: string | null;
  paid_at: string | null;
  total_regular_hours: number;
  total_overtime_hours: number;
  total_double_time_hours: number;
  total_gross_pay: number;
  total_adjustments: number;
  total_deductions: number;
  total_net_pay: number;
  operator_count: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

// ─── Pay Period Entry Types (Operator Paycheck) ──────────────────────────────

export type PayEntryStatus = 'draft' | 'reviewed' | 'approved' | 'paid' | 'void';

export interface PayPeriodEntry {
  id: string;
  pay_period_id: string;
  operator_id: string;
  regular_hours: number;
  overtime_hours: number;
  double_time_hours: number;
  total_hours: number; // computed
  regular_rate: number;
  overtime_rate: number;
  double_time_rate: number;
  regular_pay: number; // computed
  overtime_pay: number; // computed
  double_time_pay: number; // computed
  gross_pay: number;
  total_additions: number;
  total_deductions: number;
  net_pay: number;
  jobs_worked: number;
  job_ids: string[];
  status: PayEntryStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

// Extended with operator profile for display
export interface PayPeriodEntryWithOperator extends PayPeriodEntry {
  operator_name?: string;
  operator_email?: string;
}

// ─── Pay Adjustment Types ────────────────────────────────────────────────────

export type AdjustmentType =
  | 'per_diem'
  | 'bonus'
  | 'reimbursement'
  | 'deduction'
  | 'garnishment'
  | 'advance'
  | 'holiday_pay'
  | 'standby_pay'
  | 'travel_pay'
  | 'tool_allowance'
  | 'other';

export interface PayAdjustment {
  id: string;
  pay_period_entry_id: string;
  operator_id: string;
  type: AdjustmentType;
  description: string;
  amount: number; // Positive = addition, Negative = deduction
  job_order_id: string | null;
  approved_by: string | null;
  approved_at: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

// ─── Timecard-Pay Link Types ─────────────────────────────────────────────────

export interface TimecardPayLink {
  id: string;
  timecard_id: string;
  pay_period_entry_id: string;
  regular_hours_applied: number;
  overtime_hours_applied: number;
  double_time_hours_applied: number;
  work_date: string;
  created_at: string;
}

// ─── Payroll Settings Types ──────────────────────────────────────────────────

export type PayFrequency = 'weekly' | 'biweekly' | 'semi_monthly' | 'monthly';

export interface PayrollSettings {
  id: string;
  pay_frequency: PayFrequency;
  week_start_day: number; // 0=Sun, 1=Mon
  overtime_threshold_weekly: number;
  overtime_multiplier: number;
  double_time_threshold_daily: number | null;
  double_time_multiplier: number;
  default_per_diem_rate: number;
  per_diem_taxable: boolean;
  auto_lock_days_after_period: number;
  require_timecard_approval: boolean;
  company_name: string;
  company_ein: string | null;
  company_address: string | null;
  company_state: string;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

// ─── Customer Types ──────────────────────────────────────────────────────────

export interface Customer {
  id: string;
  name: string;
  display_name: string | null;
  primary_contact_name: string | null;
  primary_contact_email: string | null;
  primary_contact_phone: string | null;
  billing_contact_name: string | null;
  billing_contact_email: string | null;
  billing_address_line1: string | null;
  billing_address_line2: string | null;
  billing_city: string | null;
  billing_state: string | null;
  billing_zip: string | null;
  payment_terms: number;
  default_billing_type: 'fixed_price' | 'time_and_material' | 'cost_plus';
  tax_exempt: boolean;
  tax_id: string | null;
  total_invoiced: number;
  total_paid: number;
  outstanding_balance: number;
  active: boolean;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

// ─── Invoice Types ───────────────────────────────────────────────────────────

export type InvoiceStatus =
  | 'draft'
  | 'sent'
  | 'viewed'
  | 'partial'
  | 'paid'
  | 'overdue'
  | 'void'
  | 'disputed';

export interface Invoice {
  id: string;
  invoice_number: string;
  customer_id: string | null;
  customer_name: string;
  customer_email: string | null;
  billing_address: string | null;
  invoice_date: string;
  due_date: string | null;
  subtotal: number;
  tax_rate: number;
  tax_amount: number;
  discount_amount: number;
  discount_description: string | null;
  total_amount: number;
  amount_paid: number;
  balance_due: number; // computed
  status: InvoiceStatus;
  payment_terms: number;
  po_number: string | null;
  contract_number: string | null;
  pdf_url: string | null;
  notes: string | null;
  internal_notes: string | null;
  sent_at: string | null;
  sent_by: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

// Extended with line items for display
export interface InvoiceWithLineItems extends Invoice {
  line_items: InvoiceLineItem[];
  payments?: Payment[];
}

// ─── Invoice Line Item Types ─────────────────────────────────────────────────

export type LineItemBillingType =
  | 'labor'
  | 'material'
  | 'equipment'
  | 'flat_rate'
  | 'mobilization'
  | 'standby'
  | 'travel'
  | 'fuel_surcharge'
  | 'other';

export interface InvoiceLineItem {
  id: string;
  invoice_id: string;
  line_number: number;
  description: string;
  billing_type: LineItemBillingType;
  quantity: number;
  unit: string;
  unit_rate: number;
  amount: number; // computed: quantity * unit_rate
  job_order_id: string | null;
  operator_id: string | null;
  taxable: boolean;
  created_at: string;
  updated_at: string;
}

// ─── Payment Types ───────────────────────────────────────────────────────────

export type PaymentMethod =
  | 'check'
  | 'ach'
  | 'wire'
  | 'credit_card'
  | 'cash'
  | 'other';

export type PaymentStatus = 'pending' | 'completed' | 'failed' | 'refunded' | 'void';

export interface Payment {
  id: string;
  payment_number: string | null;
  invoice_id: string;
  customer_id: string | null;
  amount: number;
  payment_method: PaymentMethod;
  payment_date: string;
  reference_number: string | null;
  status: PaymentStatus;
  notes: string | null;
  received_by: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

// ─── View Types (from database views) ────────────────────────────────────────

export interface CurrentOperatorRate {
  operator_id: string;
  full_name: string;
  email: string;
  role: string;
  rate_type: RateType;
  regular_rate: number;
  overtime_rate: number;
  double_time_rate: number;
  effective_date: string;
  reason: string | null;
}

export interface ARAgingEntry {
  id: string;
  invoice_number: string;
  customer_name: string;
  invoice_date: string;
  due_date: string | null;
  total_amount: number;
  amount_paid: number;
  balance_due: number;
  status: InvoiceStatus;
  aging_bucket: 'paid' | 'no_terms' | 'current' | '1_30_days' | '31_60_days' | '61_90_days' | 'over_90_days';
  days_overdue: number;
}

export interface FinancialDashboardMetrics {
  total_invoiced: number;
  total_collected: number;
  total_outstanding: number;
  current_period_gross: number;
  draft_invoices: number;
  pending_invoices: number;
  overdue_invoices: number;
  open_pay_periods: number;
  unreviewed_paychecks: number;
}

// ─── API Request/Response Types ──────────────────────────────────────────────

export interface ProcessPayrollRequest {
  period_start: string;
  period_end: string;
  operator_ids?: string[]; // If empty, process all active operators
}

export interface PayrollCalculationResult {
  operator_id: string;
  operator_name: string;
  regular_hours: number;
  overtime_hours: number;
  regular_rate: number;
  overtime_rate: number;
  regular_pay: number;
  overtime_pay: number;
  gross_pay: number;
  timecard_count: number;
  adjustments: PayAdjustment[];
  total_additions: number;
  total_deductions: number;
  net_pay: number;
}

export interface CreateInvoiceRequest {
  customer_id?: string;
  customer_name: string;
  customer_email?: string;
  billing_address?: string;
  invoice_date?: string;
  payment_terms?: number;
  po_number?: string;
  tax_rate?: number;
  discount_amount?: number;
  discount_description?: string;
  notes?: string;
  internal_notes?: string;
  line_items: {
    description: string;
    billing_type: LineItemBillingType;
    quantity: number;
    unit?: string;
    unit_rate: number;
    job_order_id?: string;
    operator_id?: string;
    taxable?: boolean;
  }[];
}

export interface RecordPaymentRequest {
  invoice_id: string;
  amount: number;
  payment_method: PaymentMethod;
  payment_date?: string;
  reference_number?: string;
  notes?: string;
}
