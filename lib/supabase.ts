import { createClient } from '@supabase/supabase-js';

// Updated with new valid API key
const supabaseUrl = 'https://thebticaroasspmbhisx.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRoZWJ0aWNhcm9hc3NwbWJoaXN4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY3NjM5MzMsImV4cCI6MjA3MjMzOTkzM30.DZNpPZ3oI_INt8qguqtDi1IDLIoOt201Fof83LmSuoo';

// Validate the credentials exist
if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Missing Supabase credentials');
  throw new Error('Supabase URL and Anon Key are required');
}

// Create and export the client
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Helper function to check if Supabase is configured
export const isSupabaseConfigured = () => Boolean(supabaseUrl && supabaseAnonKey);

// Log successful initialization
console.log('Supabase client initialized successfully');