import { supabaseAdmin } from '@/lib/supabase-admin';

/**
 * Get the tenant_id for a given user from their profile.
 * Returns null if user has no tenant (demo/legacy users).
 */
export async function getTenantId(userId: string): Promise<string | null> {
  try {
    const { data } = await supabaseAdmin
      .from('profiles')
      .select('tenant_id')
      .eq('id', userId)
      .single();
    return data?.tenant_id || null;
  } catch {
    return null;
  }
}
