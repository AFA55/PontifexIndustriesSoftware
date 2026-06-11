# 🔧 QUICK FIX - Connect Your Existing Admin

## The Problem
- An admin already exists in your database
- You can't log in as that admin
- You're stuck with demo auth

## ✅ SOLUTION: Find and Use Your Existing Admin

### Step 1: Go to Supabase Dashboard

1. Open [supabase.com](https://supabase.com)
2. Select your Pontifex Industries project
3. Click **"Table Editor"** in the left sidebar
4. Click on the **"profiles"** table

### Step 2: Find Your Admin User

Look for a row where `role = 'admin'`

You should see something like:
- **id**: Some UUID like `abc123...`
- **email**: An email address
- **full_name**: A name
- **role**: admin

### Step 3: Get the Email and Reset Password

1. Copy the **email** from the profiles table
2. Go to **"Authentication"** > **"Users"** in the left sidebar
3. Find the user with that email
4. Click the three dots (•••) next to that user
5. Click **"Send Password Recovery"**
6. OR click **"Edit User"** and set a new password manually

### Step 4: Log In

1. Go to `http://localhost:3000/login`
2. Enter the email you found
3. Use the password you just set
4. You're now logged in as the real admin!

### Step 5: Approve Users

1. Go to Access Requests
2. Click "Approve"
3. It will work now!

---

## Alternative: Create New Admin Manually

If you don't know the existing admin's email or can't reset it:

### In Supabase SQL Editor, run this:

```sql
-- Step 1: Create auth user
-- Go to Authentication > Users > Add User
-- Email: youremail@pontifex.com
-- Password: YourPassword123!
-- Auto Confirm: YES
-- Copy the UUID that appears

-- Step 2: Create profile (replace UUID below)
INSERT INTO public.profiles (id, email, full_name, role, phone, active)
VALUES (
  'PASTE-UUID-HERE',  -- Replace with UUID from step 1
  'youremail@pontifex.com',
  'Your Name',
  'admin',
  '',
  true
)
ON CONFLICT (id) DO UPDATE SET
  role = 'admin',
  active = true;
```

---

## Fastest Solution: Just Tell Me the Login

Since there's already an admin, let's find it:

### Run this SQL in Supabase SQL Editor:

```sql
SELECT p.email, p.full_name, p.role
FROM public.profiles p
WHERE p.role = 'admin'
LIMIT 1;
```

This will show you the admin email. Then reset the password for that email in Auth > Users.
