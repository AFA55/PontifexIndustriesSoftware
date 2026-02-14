import { createClient } from '@supabase/supabase-js';

// Environment variables required — empty string fallback keeps build working
// but will fail at runtime with clear errors if env vars are missing
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() || '';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
