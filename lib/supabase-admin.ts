/**
 * Supabase Admin Client
 * Uses service_role key for admin operations (bypasses RLS)
 * ONLY use this server-side (API routes, server components)
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error('Missing Supabase environment variables for admin client');
}

/**
 * Admin client with full privileges
 * - Bypasses Row Level Security (RLS)
 * - Can create/delete users
 * - Can perform any database operation
 *
 * ⚠️ NEVER expose this client to the frontend!
 */
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});
