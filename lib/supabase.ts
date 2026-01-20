import { createClient } from '@supabase/supabase-js';

// Use fallback values during build to prevent build errors
// Handle both undefined and empty string cases
// These will be replaced with actual values at runtime
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || 'https://placeholder.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBsYWNlaG9sZGVyIiwicm9sZSI6ImFub24iLCJpYXQiOjE2NDUxOTI4MDAsImV4cCI6MTk2MDc2ODgwMH0.placeholder';

// Validate URL format
const isValidUrl = supabaseUrl.startsWith('https://') && supabaseUrl.includes('.supabase.co');
const finalUrl = isValidUrl ? supabaseUrl : 'https://placeholder.supabase.co';

export const supabase = createClient(finalUrl, supabaseAnonKey);
