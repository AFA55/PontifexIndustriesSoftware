/**
 * Document & Form Types
 *
 * Types for PDF documents, forms, and compliance records.
 */

export interface DocumentField {
  name: string;
  label: string;
  type: 'text' | 'textarea' | 'checkbox' | 'date' | 'time' | 'select' | 'multiselect' | 'signature' | 'photo' | 'number';
  required: boolean;
  options?: string[];
  placeholder?: string;
  description?: string;
}

export interface DocumentTemplate {
  id: string;
  name: string;
  category: 'safety' | 'compliance' | 'operational' | 'quality' | 'administrative';
  description: string;
  fields: DocumentField[];
  requiresSignature: boolean;
  requiresPhoto?: boolean;
}

/** Standby log record */
export interface StandbyLog {
  id: string;
  job_order_id: string;
  operator_id: string;
  start_time: string;
  end_time: string | null;
  duration_hours: number | null;
  reason: string | null;
  notes: string | null;
  status: 'active' | 'completed';
  created_at: string;
}

/** Work item record */
export interface WorkItem {
  id: string;
  job_order_id: string;
  category: string;
  item_name: string;
  quantity: number | null;
  unit: string | null;
  notes: string | null;
  created_at: string;
}

/** Timecard record */
export interface Timecard {
  id: string;
  operator_id: string;
  clock_in: string;
  clock_out: string | null;
  total_hours: number | null;
  status: 'clocked_in' | 'clocked_out' | 'approved';
  approved_by: string | null;
  approved_at: string | null;
  notes: string | null;
  created_at: string;
}
