import type { JobCardData } from './JobCard';

// ─── Conflict data type ─────────────────────────────────────────────────
export interface ConflictData {
  personName: string;
  personRole: 'operator' | 'helper';
  currentJobName: string;
  newJob: JobCardData;
  newJobSource: 'unassigned' | 'willcall';
  targetRowIndex: number;
  helperName: string | null;
}

// ─── Row-change conflict (inline dropdown) ──────────────────────────────
export interface RowChangeConflict {
  operatorName: string;
  sourceRowIndex: number;   // row where operator currently has jobs
  targetRowIndex: number;   // row where user wants to place operator
  currentJobNames: string[];
}
