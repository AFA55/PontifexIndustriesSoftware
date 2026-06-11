# 🚀 Run Apprentice Role Migration

## Quick Steps

### Option 1: Via Supabase Dashboard (Recommended)

1. **Open Supabase Dashboard**
   - Go to [supabase.com](https://supabase.com)
   - Log in and select your Pontifex Industries project

2. **Navigate to SQL Editor**
   - Click "SQL Editor" in the left sidebar

3. **Copy the Migration**
   - Open: `supabase/migrations/20250130_add_apprentice_role.sql`
   - Copy the entire contents (Cmd+A, then Cmd+C)

4. **Run the Migration**
   - In Supabase SQL Editor, click "New Query"
   - Paste the SQL (Cmd+V)
   - Click the green "Run" button (or press Cmd+Enter)

5. **Verify Success**
   - You should see "Success. No rows returned"
   - Now you can approve users with the "apprentice" role

---

## What This Migration Does

1. **Updates `profiles` table** - Adds 'apprentice' as a valid role
2. **Updates `access_requests` table** - Adds 'apprentice' as a valid assigned role

Now when you approve access requests, you can assign users as:
- Admin
- Operator
- **Apprentice** (NEW!)

---

## After Migration

Go to Access Requests page and approve a user with the "Apprentice" role to test!

The approval flow will now:
1. ✅ Create user in Supabase Auth
2. ✅ Create profile with selected role (admin/operator/apprentice)
3. ✅ Update access request to "approved"
4. ✅ User appears in team assignment dropdown (for operators)
