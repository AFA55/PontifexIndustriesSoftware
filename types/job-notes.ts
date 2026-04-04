export interface JobNote {
  id: string;
  job_order_id: string;
  author_id: string;
  author_name: string;
  content: string;
  note_type: 'manual' | 'system' | 'change_log';
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface QuickAddJobData {
  customer_name: string;
  job_type: string;
  scheduled_date: string;
  end_date?: string;
  operator_name?: string;
  assigned_to?: string;
  equipment_needed?: string[];
  location?: string;
  address?: string;
  notes?: string;
}
