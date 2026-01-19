# Fix SECURITY DEFINER Views - Instructions

## Issue
Supabase Security Advisor detected 4 views with SECURITY DEFINER property, which can bypass Row Level Security (RLS) policies. This is a security concern.

## Affected Views
1. `public.active_job_orders`
2. `public.timecards_with_users`
3. `public.job_document_stats`
4. `public.operator_document_assignments`

## How to Fix

### Step 1: Open Supabase SQL Editor
1. Go to your Supabase dashboard
2. Click on "SQL Editor" in the left sidebar

### Step 2: Run the Migration
1. Open the file `FIX_SECURITY_DEFINER_VIEWS.sql`
2. Copy the entire contents
3. Paste into the Supabase SQL Editor
4. Click "Run" or press Cmd/Ctrl + Enter

### Step 3: Verify the Fix
1. Go to "Advisors" > "Security Advisor" in Supabase
2. Click "Refresh"
3. The 4 errors should be gone

## What This Does
- Drops all 4 views
- Recreates them WITHOUT the SECURITY DEFINER property
- This ensures views respect RLS policies of the querying user
- Adds proper GRANT permissions for authenticated users
- Adds documentation comments

## Safety
This is a safe operation because:
- Views don't store data, only define queries
- Recreating them won't lose any data
- The view definitions are identical, just without SECURITY DEFINER
- All existing queries will continue to work
