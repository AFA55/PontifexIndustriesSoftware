/**
 * Operator & User Types
 *
 * Maps to `profiles` table and related operator data.
 */

export type UserRole = 'admin' | 'operator';

/** Maps to the `profiles` table */
export interface Profile {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  phone?: string | null;
  active?: boolean;
  created_at?: string;
  updated_at?: string;
}

/** Simplified user for auth context */
export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
}

/** Operator as shown in dropdowns / assignment lists */
export interface OperatorOption {
  id: string;
  full_name: string;
  email: string;
}

/** Operator with their schedule for dispatch views */
export interface OperatorSchedule {
  operator_id: string;
  operator_name: string;
  operator_email: string;
  jobs: import('./job').JobOrder[];
}
