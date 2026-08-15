export interface JobNote {
  id: string;
  job_order_id: string;
  author_id: string;
  author_name: string;
  content: string;
  /**
   * The note's KIND. Deliberately NOT the audience — see `audience` below and
   * lib/job-note-audience.ts. Live code reads specific kinds ('amendment' in
   * work-performed, 'completion'/'done_for_day' at day-complete), so this list
   * is open-ended.
   */
  note_type: string;
  /**
   * WHO MAY READ IT. 'internal' = office only; 'operator' = the job's crew.
   * Anything unrecognised is treated as 'internal' — failing private is the
   * safety property.
   */
  audience: 'internal' | 'operator';
  /** Attachments (photos / PDFs). Reach the crew only on an operator note. */
  photo_urls: string[];
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
