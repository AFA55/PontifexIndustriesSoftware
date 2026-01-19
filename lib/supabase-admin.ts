/**
 * Supabase Admin Client
 * Uses service_role key for admin operations (bypasses RLS)
 * ONLY use this server-side (API routes, server components)
 */

import { createClient } from '@supabase/supabase-js';

// Use fallback values during build to prevent build errors
// Handle both undefined and empty string cases
// These will be replaced with actual values at runtime
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || 'https://placeholder.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBsYWNlaG9sZGVyIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTY0NTE5MjgwMCwiZXhwIjoxOTYwNzY4ODAwfQ.placeholder';

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
