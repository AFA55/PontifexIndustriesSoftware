import { createClient } from '@supabase/supabase-js';

// Environment variables required — placeholder URL keeps build & static generation working
// Real env vars are set on Vercel and in .env.local for local dev
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || 'https://placeholder.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() || 'placeholder-key';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
