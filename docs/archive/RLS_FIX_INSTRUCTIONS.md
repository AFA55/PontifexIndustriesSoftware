# Fix RLS Infinite Recursion Errors

## Problem
The application is experiencing infinite recursion errors in RLS (Row Level Security) policies, specifically for the `profiles` and `standby_logs` tables. This causes 500 Internal Server errors when trying to fetch operator profiles or standby logs.

## Error Messages
```
Could not check standby status (RLS policy): infinite recursion detected in policy for relation "profiles"
Could not fetch operator profile (RLS policy): infinite recursion detected in policy for relation "profiles"
GET https://[supabase-url]/rest/v1/standby_logs?select=... 500 (Internal Server Error)
GET https://[supabase-url]/rest/v1/profiles?select=... 500 (Internal Server Error)
```

## Root Cause
RLS policies were referencing the `profiles` table while checking permissions on the `profiles` table itself, causing infinite recursion. For example:
- A policy on `profiles` checks `profiles.role = 'admin'`
- To check that role, Supabase queries the `profiles` table
- Which triggers the same policy again
- Creating infinite recursion

## Solution

Two SQL migration files have been created to fix this:

### 1. Fix Profiles RLS Policies
**File**: `supabase/migrations/20260203_fix_profiles_rls_infinite_recursion.sql`

This migration:
- Drops all existing problematic policies on the `profiles` table
- Creates new policies that use `auth.uid()` directly instead of referencing `profiles`
- For admin checks, queries `auth.users.raw_user_meta_data` instead of the `profiles` table

### 2. Fix Standby Logs RLS Policies
**File**: `supabase/migrations/20260203_fix_standby_rls_policies.sql`

This migration:
- Drops all existing policies on the `standby_logs` table
- Creates clean policies without any recursion
- Properly separates operator vs admin access

## How to Apply the Fix

### Option 1: Using Supabase CLI (Recommended)

1. Make sure you're in the project directory:
```bash
cd /Users/afa55/Documents/Pontifex\ Industres/pontifex-platform
```

2. Apply the migrations:
```bash
npx supabase db push
```

This will apply both migration files to your Supabase database.

### Option 2: Manual Application via Supabase Dashboard

1. Go to your Supabase Dashboard
2. Navigate to **SQL Editor**
3. Copy the contents of `supabase/migrations/20260203_fix_profiles_rls_infinite_recursion.sql`
4. Paste and run it
5. Then copy the contents of `supabase/migrations/20260203_fix_standby_rls_policies.sql`
6. Paste and run it

### Option 3: Using psql (if you have direct database access)

```bash
psql "postgresql://[your-connection-string]" -f supabase/migrations/20260203_fix_profiles_rls_infinite_recursion.sql
psql "postgresql://[your-connection-string]" -f supabase/migrations/20260203_fix_standby_rls_policies.sql
```

## Verification

After applying the migrations, test the following:

1. **Reload the silica exposure page** - the errors should be gone
2. **Check browser console** - no more 500 errors for profiles or standby_logs
3. **Test standby functionality**:
   - Start a standby period
   - Stop a standby period
   - View standby logs on the work-performed page

4. **Test profile access**:
   - View your own profile
   - Admins should be able to view all profiles

## What Changed

### Profiles Table Policies

**Before** (caused recursion):
```sql
-- Bad: References profiles table while on profiles table
CREATE POLICY "Admins can view all profiles"
ON profiles FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role = 'admin'
  )
);
```

**After** (no recursion):
```sql
-- Good: Uses auth.users metadata directly
CREATE POLICY "Admins can view all profiles"
ON profiles FOR SELECT
USING (
  auth.uid() IN (
    SELECT id FROM auth.users
    WHERE raw_user_meta_data->>'role' = 'admin'
  )
);
```

### Standby Logs Policies

All policies now use simple `auth.uid()` comparisons without any complex subqueries that reference other tables with RLS enabled.

## Rollback (if needed)

If you need to rollback these changes:

1. Save your current policies first:
```sql
-- Dump current policies
SELECT * FROM pg_policies WHERE tablename IN ('profiles', 'standby_logs');
```

2. The migrations drop the old policies, so you'll need to restore from your backup if you have one

## Impact

After applying these fixes:
- ✅ All 500 Internal Server errors related to profiles and standby_logs should be resolved
- ✅ Operators can view/update their own profiles
- ✅ Operators can create and manage their own standby logs
- ✅ Admins can view all profiles and standby logs
- ✅ No performance impact (policies are actually simpler now)

## Related Files

- `app/api/standby/route.ts` - Standby API endpoint
- `app/dashboard/job-schedule/[id]/silica-exposure/page.tsx` - Page showing the errors
- `components/QuickAccessButtons.tsx` - Standby time tracking UI
