/**
 * Shared helper to resolve tenant_id for the current user.
 * Used by admin API routes to scope queries to the correct tenant.
 */

import { supabaseAdmin } from '@/lib/supabase-admin';

export async function getTenantId(userId: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from('profiles')
    .select('tenant_id')
    .eq('id', userId)
    .single();
  return data?.tenant_id || null;
}
