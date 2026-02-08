/**
 * Operators Service
 *
 * All operator-related data operations.
 */

import { supabase } from '@/lib/supabase';
import type { OperatorOption, Profile } from '@/types/operator';

/** Fetch all operators for dropdown/assignment lists */
export async function getOperatorOptions(): Promise<OperatorOption[]> {
  // Ensure we have an active session before querying (RLS requires auth)
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    console.warn('No active session — cannot fetch operators');
    return [];
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, email')
    .eq('role', 'operator')
    .order('full_name');

  if (error) {
    console.error('Error fetching operators:', error);
    return [];
  }

  return data || [];
}

/** Fetch a single operator's profile */
export async function getOperatorProfile(id: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    console.error('Error fetching operator profile:', error);
    return null;
  }

  return data;
}

/** Get the current user's profile */
export async function getCurrentProfile(): Promise<Profile | null> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return null;

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', session.user.id)
    .single();

  if (error) {
    console.error('Error fetching current profile:', error);
    return null;
  }

  return data;
}
