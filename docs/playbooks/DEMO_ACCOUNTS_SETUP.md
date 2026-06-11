# Demo Accounts Setup Guide - World of Concrete 2026

## 🎯 Overview

This guide will help you create the demo accounts shown on the login page and enable authentication protection for the dashboard.

## 📋 Demo Accounts to Create

1. **Demo Operator** - For showcasing operator features
   - Email: `demo@pontifex.com`
   - Password: `Demo1234!`
   - Role: Operator

2. **Demo Admin** - For showcasing admin features
   - Email: `admin@pontifex.com`
   - Password: `Admin1234!`
   - Role: Admin

## 🚀 Setup Steps

### Step 1: Create Users in Supabase Dashboard

1. Open Supabase Dashboard: https://supabase.com/dashboard
2. Select your project
3. Navigate to **Authentication** > **Users**
4. Click **"Add user"** button

#### Create Demo Operator:
- **Email**: `demo@pontifex.com`
- **Password**: `Demo1234!`
- **Auto Confirm User**: ✅ YES (check this box!)
- Click **"Create user"**

#### Create Demo Admin:
- **Email**: `admin@pontifex.com`
- **Password**: `Admin1234!`
- **Auto Confirm User**: ✅ YES (check this box!)
- Click **"Create user"**

### Step 2: Run SQL Script

1. In Supabase Dashboard, go to **SQL Editor**
2. Open the file: `CREATE_DEMO_ACCOUNTS_SIMPLE.sql`
3. Copy the entire contents
4. Paste into SQL Editor
5. Click **"Run"**

The script will:
- ✅ Automatically find the user IDs you just created
- ✅ Create profiles for both demo accounts
- ✅ Set correct roles (operator and admin)
- ✅ Make accounts active
- ✅ Show confirmation of success

### Step 3: Verify Accounts

After running the SQL, you should see output showing 4 accounts:
- ✅ andres.altamirano1280@gmail.com (admin)
- ✅ admin@pontifex.com (admin) - **NEW**
- ✅ demo@pontifex.com (operator) - **NEW**
- ✅ quantumlearnr@gmail.com (operator)

## 🔒 Authentication Protection

### What's Been Added

1. **Middleware Protection** (`middleware.ts`)
   - Blocks access to all `/dashboard/*` routes without login
   - Redirects to login page if not authenticated
   - Preserves the original URL for redirect after login

2. **AuthGuard Component** (`components/AuthGuard.tsx`)
   - Client-side authentication verification
   - Checks Supabase session
   - Verifies user profile and role
   - Optional role-based access control

3. **Protected Routes**
   - `/dashboard` - Requires login
   - `/dashboard/admin/*` - Requires login (ideally admin role)
   - All dashboard pages - Requires login

4. **Public Routes** (No login required)
   - `/` - Landing page
   - `/login` - Login page
   - `/request-access` - Request access form
   - `/andresDBC` - Your digital business card
   - `/forgot-password` - Password reset

## 🧪 Testing Demo Accounts

### Test Demo Operator Account

1. Go to: http://localhost:3002/login
2. Enter:
   - Email: `demo@pontifex.com`
   - Password: `Demo1234!`
3. Click "Sign In"
4. Should redirect to: `/dashboard` (Operator Dashboard)
5. Verify: Can see operator features, cannot access admin features

### Test Demo Admin Account

1. Go to: http://localhost:3002/login
2. Enter:
   - Email: `admin@pontifex.com`
   - Password: `Admin1234!`
3. Click "Sign In"
4. Should redirect to: `/dashboard/admin` (Admin Dashboard)
5. Verify: Can see all admin features

### Test Authentication Protection

1. **Without Login**:
   - Try accessing: http://localhost:3002/dashboard
   - Should redirect to: `/login?redirect=/dashboard`
   - After login, should return to `/dashboard`

2. **After Logout**:
   - Logout from dashboard
   - Try accessing dashboard again
   - Should redirect to login

## 🎤 Demo Flow for World of Concrete

### Scenario 1: Show Operator Experience
1. Start at login page
2. Point out the demo credentials
3. Login as **demo@pontifex.com**
4. Show operator dashboard features:
   - Job schedule
   - Timecard
   - Equipment scanning
   - Mobile responsiveness

### Scenario 2: Show Admin Experience
1. Logout
2. Login as **admin@pontifex.com**
3. Show admin dashboard features:
   - Dispatch scheduling
   - Operator management
   - Equipment inventory
   - Analytics
   - Team management

### Scenario 3: Show Security
1. Logout
2. Try to access `/dashboard/admin` directly
3. Show that it redirects to login
4. Explain: "The system is secure - no one can access without proper credentials"

## 🔧 Troubleshooting

### Problem: "Profile not found" error after login

**Solution**: Make sure you ran `CREATE_DEMO_ACCOUNTS_SIMPLE.sql` after creating users in Auth Dashboard.

### Problem: Demo account redirects to wrong dashboard

**Solution**: Check that the SQL script set the correct role:
- demo@pontifex.com should have role='operator'
- admin@pontifex.com should have role='admin'

Run this to verify:
```sql
SELECT email, role FROM profiles WHERE email IN ('demo@pontifex.com', 'admin@pontifex.com');
```

### Problem: Can access dashboard without login

**Solution**:
1. Make sure `middleware.ts` exists in the root directory
2. Restart the dev server: `npm run dev`
3. Clear browser cache and cookies

### Problem: "Account is inactive" error

**Solution**: Make sure `active` is set to `true` in the profiles table:
```sql
UPDATE profiles
SET active = true
WHERE email IN ('demo@pontifex.com', 'admin@pontifex.com');
```

## ✅ Pre-Deployment Checklist

Before deploying to Vercel:

- [ ] Created demo@pontifex.com in Supabase Auth
- [ ] Created admin@pontifex.com in Supabase Auth
- [ ] Ran CREATE_DEMO_ACCOUNTS_SIMPLE.sql
- [ ] Verified 4 accounts exist in profiles table
- [ ] Tested demo operator login works
- [ ] Tested demo admin login works
- [ ] Tested authentication protection (try accessing /dashboard without login)
- [ ] Verified middleware.ts exists in root directory
- [ ] Committed all changes to git

## 📱 Production Deployment

After deploying to Vercel:

1. **Verify demo accounts work in production**:
   - Login with demo@pontifex.com
   - Login with admin@pontifex.com

2. **Test authentication protection**:
   - Try accessing dashboard without login
   - Should redirect to login page

3. **Test mobile experience**:
   - Pull up production URL on phone
   - Test demo login on mobile
   - Verify dashboard is mobile-responsive

## 🎉 You're Ready!

Once all checkboxes are complete, you're ready to showcase at World of Concrete!

**Key Talking Points**:
- "We have separate operator and admin dashboards"
- "Role-based access control keeps data secure"
- "Try it yourself with our demo accounts"
- "The system works on any device"

---

**Last Updated**: January 19, 2026
**Status**: Ready for World of Concrete Demo
