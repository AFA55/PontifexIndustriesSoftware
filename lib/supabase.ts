import { createClient } from '@supabase/supabase-js';

// Placeholder URL keeps build & static generation working — real env vars set on Vercel / .env.local
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || 'https://placeholder.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() || 'placeholder-key';

if (typeof window !== 'undefined' && supabaseUrl === 'https://placeholder.supabase.co') {
  console.error('[Supabase] NEXT_PUBLIC_SUPABASE_URL is not set — API calls will fail. Check .env.local');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
