/**
 * useWorkflow Hook
 *
 * Provides workflow progress tracking for a job.
 * Used by both admin (job board) and operator (workflow pages).
 */

'use client';

import { useMemo } from 'react';
import { getWorkflowProgress, type WorkflowProgress } from '@/types/workflow';
import type { JobOrder } from '@/types/job';

/**
 * Get workflow progress for a single job.
 * Reactive - recalculates when job data changes.
 */
export function useWorkflow(job: Partial<JobOrder> | null): WorkflowProgress | null {
  return useMemo(() => {
    if (!job) return null;
    return getWorkflowProgress(job);
  }, [job]);
}

/**
 * Get workflow progress for multiple jobs at once.
 * Useful for list views where you need progress for every card.
 */
export function useWorkflowBatch(
  jobs: Partial<JobOrder>[]
): Map<string, WorkflowProgress> {
  return useMemo(() => {
    const map = new Map<string, WorkflowProgress>();
    jobs.forEach(job => {
      if (job.id) {
        map.set(job.id, getWorkflowProgress(job));
      }
    });
    return map;
  }, [jobs]);
}
