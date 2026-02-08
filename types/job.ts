/**
 * Job Order Types
 *
 * Maps directly to the `job_orders` table in Supabase.
 * This is the ONLY place JobOrder should be defined.
 */

// ─── Status & Priority Enums ─────────────────────────────────────────────────

export type JobStatus =
  | 'scheduled'
  | 'assigned'
  | 'in_route'
  | 'in_progress'
  | 'completed'
  | 'cancelled';

export type JobPriority = 'low' | 'medium' | 'high' | 'urgent';

export type JobType =
  | 'Core Drilling'
  | 'Wall Sawing'
  | 'Slab Sawing'
  | 'Hand Sawing'
  | 'Wire Sawing'
  | 'GPR Scanning'
  | 'Demolition'
  | 'Other';

// ─── Main JobOrder Interface ─────────────────────────────────────────────────

export interface JobOrder {
  id: string;
  job_number: string;
  title: string;
  customer_name: string;
  customer_contact: string | null;
  customer_email: string | null;
  job_type: string;
  location: string;
  address: string;
  description: string | null;
  additional_info: string | null;

  // Assignment
  assigned_to: string | null;
  operator_name: string | null;
  foreman_name: string | null;
  foreman_phone: string | null;
  salesman_name: string | null;
  salesperson_email: string | null;

  // Status
  status: JobStatus;
  priority: JobPriority;

  // Scheduling
  scheduled_date: string;
  end_date: string | null;
  arrival_time: string | null;
  shop_arrival_time: string | null;
  estimated_hours: number | null;
  departure_time: string | null;

  // Tracking timestamps
  assigned_at: string | null;
  route_started_at: string | null;
  work_started_at: string | null;
  work_completed_at: string | null;

  // Time tracking
  drive_time: number | null;
  production_time: number | null;
  total_time: number | null;

  // Equipment
  equipment_needed: string[] | null;
  special_equipment: string[] | null;
  required_documents: string[] | null;

  // Reference numbers
  job_site_number: string | null;
  po_number: string | null;
  customer_job_number: string | null;
  job_quote: number | null;

  // Work performed
  work_performed: string | null;
  materials_used: string | null;
  equipment_used: string | null;
  operator_notes: string | null;
  issues_encountered: string | null;

  // Customer signature
  customer_signature: string | null;
  customer_signed_at: string | null;

  // Completion
  completion_signature: string | null;
  completion_signer_name: string | null;
  completion_signed_at: string | null;
  completion_notes: string | null;
  contact_not_on_site: boolean | null;

  // Work order agreement
  work_order_signed: boolean | null;
  work_order_signature: string | null;
  work_order_signer_name: string | null;
  work_order_signer_title: string | null;
  work_order_signed_at: string | null;
  cut_through_authorized: boolean | null;
  cut_through_signature: string | null;

  // Liability release
  liability_release_signed_by: string | null;
  liability_release_signature: string | null;
  liability_release_signed_at: string | null;
  liability_release_customer_name: string | null;
  liability_release_customer_email: string | null;
  liability_release_pdf: string | null;

  // Documents (PDFs)
  silica_form_pdf: string | null;
  agreement_pdf: string | null;

  // Customer ratings
  customer_overall_rating: number | null;
  customer_cleanliness_rating: number | null;
  customer_communication_rating: number | null;
  customer_feedback_comments: string | null;

  // Operator feedback
  job_difficulty_rating: number | null;
  job_access_rating: number | null;
  job_difficulty_notes: string | null;
  job_access_notes: string | null;
  feedback_submitted_at: string | null;
  feedback_submitted_by: string | null;

  // Site conditions
  truck_distance_to_work: string | null;
  work_environment: string | null;
  site_cleanliness: number | null;
  difficulty_rating: number | null;
  work_area_accessibility_rating: number | null;
  work_area_accessibility_notes: string | null;

  // Location tracking
  route_start_latitude: number | null;
  route_start_longitude: number | null;
  work_start_latitude: number | null;
  work_start_longitude: number | null;
  work_end_latitude: number | null;
  work_end_longitude: number | null;

  // Performance flags
  was_on_time: boolean | null;
  within_estimated_hours: boolean | null;
  customer_satisfied: boolean | null;

  // Photos
  photo_urls: string[] | null;

  // Metadata
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  deleted_by: string | null;
}

// ─── Convenience Types (for pages that only need a subset) ───────────────────

/** Minimal job info for list views and cards */
export type JobSummary = Pick<JobOrder,
  | 'id' | 'job_number' | 'title' | 'customer_name'
  | 'location' | 'address' | 'scheduled_date' | 'end_date'
  | 'arrival_time' | 'status' | 'priority'
  | 'assigned_to' | 'operator_name'
  | 'foreman_name' | 'foreman_phone'
>;

/** Fields needed for the Job Board workflow progress */
export type JobWithWorkflow = JobSummary & Pick<JobOrder,
  | 'route_started_at' | 'liability_release_signed_at'
  | 'work_started_at' | 'silica_form_pdf'
  | 'work_performed' | 'job_difficulty_rating'
  | 'agreement_pdf' | 'customer_overall_rating'
  | 'completion_signed_at' | 'work_completed_at'
  | 'description' | 'job_type' | 'estimated_hours'
  | 'shop_arrival_time' | 'equipment_needed'
  | 'customer_cleanliness_rating' | 'customer_communication_rating'
  | 'customer_feedback_comments' | 'job_access_rating'
  | 'job_difficulty_notes' | 'photo_urls'
  | 'liability_release_pdf' | 'salesman_name'
  | 'created_at'
>;

/** Fields the admin can update from the Job Board / Schedule Board */
export interface JobUpdatePayload {
  scheduled_date?: string;
  end_date?: string | null;
  arrival_time?: string | null;
  shop_arrival_time?: string | null;
  estimated_hours?: number | null;
  assigned_to?: string | null;
  operator_name?: string | null;
  location?: string;
  address?: string;
  customer_name?: string;
  foreman_name?: string | null;
  foreman_phone?: string | null;
  equipment_needed?: string[] | null;
  description?: string | null;
  status?: JobStatus;
  priority?: JobPriority;
}
