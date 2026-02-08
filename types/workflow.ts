/**
 * Workflow Types
 *
 * Defines the operator workflow steps and progress tracking.
 * The workflow is the step-by-step process an operator follows
 * from receiving a job to completing it.
 */

import type { JobOrder } from './job';

// ─── Workflow Step Definitions ───────────────────────────────────────────────

export interface WorkflowStepDef {
  key: string;
  label: string;
  /** The field on JobOrder that indicates this step is complete */
  field: keyof JobOrder;
  /** Route path segment for the operator's workflow page */
  route: string;
}

/**
 * The complete operator workflow in order.
 * Each step maps to a field on the JobOrder that gets populated
 * when the operator completes that step.
 */
export const WORKFLOW_STEPS: WorkflowStepDef[] = [
  { key: 'in_route',          label: 'In Route',           field: 'route_started_at',             route: 'start-route' },
  { key: 'legal_doc_1',       label: 'Legal Document 1',   field: 'liability_release_signed_at',  route: 'liability-release' },
  { key: 'in_progress',       label: 'In Progress',        field: 'work_started_at',              route: 'in-route' },
  { key: 'silica_sheet',      label: 'Silica Sheet',       field: 'silica_form_pdf',              route: 'silica-exposure' },
  { key: 'work_performed',    label: 'Work Performed',     field: 'work_performed',               route: 'work-performed' },
  { key: 'operator_survey',   label: 'Operator Survey',    field: 'job_difficulty_rating',         route: 'complete-job' },
  { key: 'legal_doc_2',       label: 'Legal Document 2',   field: 'agreement_pdf',                route: 'work-order-agreement' },
  { key: 'client_survey',     label: 'Client Survey',      field: 'customer_overall_rating',      route: 'customer-signature' },
  { key: 'ticket_submitted',  label: 'Ticket Submitted',   field: 'completion_signed_at',         route: 'complete-job' },
];

// ─── Workflow Progress Types ─────────────────────────────────────────────────

export interface WorkflowStepProgress {
  key: string;
  label: string;
  completed: boolean;
  route: string;
}

export interface WorkflowProgress {
  steps: WorkflowStepProgress[];
  completedCount: number;
  totalSteps: number;
  percentComplete: number;
  currentStep: string | null;
}

// ─── Workflow Navigation (for operator-side UI) ──────────────────────────────

export interface WorkflowNavStep {
  id: string;
  name: string;
  order: number;
  completed: boolean;
  current: boolean;
  url: string;
}

// ─── Helper Functions ────────────────────────────────────────────────────────

/**
 * Calculate workflow progress from a job order's fields.
 * Used by both the Job Board (admin) and operator workflow pages.
 */
export function getWorkflowProgress(job: Partial<JobOrder>): WorkflowProgress {
  let currentStep: string | null = null;
  let foundIncomplete = false;

  const steps: WorkflowStepProgress[] = WORKFLOW_STEPS.map(step => {
    const value = job[step.field];
    const completed = value !== null && value !== undefined && value !== '' && value !== false;

    if (!completed && !foundIncomplete) {
      currentStep = step.key;
      foundIncomplete = true;
    }

    return {
      key: step.key,
      label: step.label,
      completed,
      route: step.route,
    };
  });

  const completedCount = steps.filter(s => s.completed).length;

  return {
    steps,
    completedCount,
    totalSteps: WORKFLOW_STEPS.length,
    percentComplete: Math.round((completedCount / WORKFLOW_STEPS.length) * 100),
    currentStep,
  };
}
