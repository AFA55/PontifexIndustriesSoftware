/**
 * Supabase Admin Client
 * Uses service_role key for admin operations (bypasses RLS)
 * ONLY use this server-side (API routes, server components)
 */

import { createClient } from '@supabase/supabase-js';

// Environment variables required — placeholder URL keeps build & static generation working
// Real env vars are set on Vercel and in .env.local for local dev
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || 'https://placeholder.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || 'placeholder-key';

/**
 * Admin client with full privileges
 * - Bypasses Row Level Security (RLS)
 * - Can create/delete users
 * - Can perform any database operation
 *
 * NEVER expose this client to the frontend!
 */
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});
