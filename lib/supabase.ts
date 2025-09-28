import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://thebticaroasspmbhisx.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRoZWJ0aWNhcm9hc3NwbWJoaXN4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3MjU5OTU2MDAsImV4cCI6MjA0MTU3MTYwMH0.qPUn9OX_E9M5vYtGxJqJYHRh8h-RbutgrVW6wV42UWU';

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
