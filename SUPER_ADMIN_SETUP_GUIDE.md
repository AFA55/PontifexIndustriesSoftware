# 🚀 Super Admin Setup Guide

## The Problem

You're trying to approve access requests, but you're getting an error: **"reviewedBy (admin user ID) is required"**

This happens because:
1. You're logged in with demo auth (`admin@pontifex.com`)
2. Demo auth doesn't create a real Supabase user
3. The approval system needs a real admin user ID

## ✅ Solution: Create Your First Real Admin Account

### **Option 1: Use the Setup Page (EASIEST)**

I just created an automatic setup page for you!

1. **Go to the setup page:**
   ```
   http://localhost:3000/setup
   ```

2. **Fill out the form:**
   - Full Name: `Your Name` (e.g., "John Smith")
   - Email: `admin@pontifex.com` (or your company email)
   - Password: Create a strong password (minimum 8 characters)

3. **Click "Create Super Admin Account"**

4. **Log in with your new account:**
   - The page will redirect you to login
   - Use the email and password you just created
   - You'll now be a real admin with a real UUID!

5. **Now you can approve users:**
   - Go to Access Requests
   - Approve users - it will work now!

---

### **Option 2: Manual Setup via Supabase Dashboard**

If the setup page doesn't work, you can create the admin manually:

#### Step 1: Create User in Supabase Auth

1. Go to [supabase.com](https://supabase.com)
2. Open your Pontifex Industries project
3. Click **"Authentication"** in the left sidebar
4. Click **"Users"** tab
5. Click **"Add User"** button
6. Fill out:
   - **Email:** `admin@pontifex.com` (or your email)
   - **Password:** Create a strong password
   - **Auto Confirm Email:** ✅ **CHECK THIS BOX** (important!)
7. Click **"Create User"**
8. **Copy the User ID (UUID)** that appears - you'll need it in the next step

#### Step 2: Create Profile in Database

1. Still in Supabase Dashboard, click **"SQL Editor"** in the left sidebar
2. Click **"New Query"**
3. Paste this SQL (replace `PASTE-USER-ID-HERE` with the UUID you copied):

```sql
INSERT INTO public.profiles (id, email, full_name, role, phone, active)
VALUES (
  'PASTE-USER-ID-HERE',  -- Replace with the UUID from step 1
  'admin@pontifex.com',   -- Use the same email
  'Super Admin',          -- Your name
  'admin',
  '',
  true
);
```

4. Click **"Run"** (green button)
5. You should see "Success. No rows returned"

#### Step 3: Log In

1. Go to `http://localhost:3000/login`
2. Enter the email and password you created
3. You're now logged in as a real admin!

---

## 🎯 After Setup - How to Approve Users

Once you've created your super admin account:

1. **Log in** with your new real admin account
2. **Go to Access Requests:** `http://localhost:3000/dashboard/admin/access-requests`
3. **Click "Approve"** on any pending request
4. **Select role:** Admin, Operator, or Apprentice
5. **Click "Approve as [role]"**
6. **Success!** The user will be created and appear in team assignment

---

## 🔐 Security Best Practices

### For Production (When You Give This to the Company):

1. **First Time Setup:**
   - The company owner should go to `/setup` page
   - Create their super admin account with company email
   - Use a strong password (12+ characters, mix of upper/lower/numbers/symbols)

2. **After First Admin is Created:**
   - The `/setup` page will be disabled (it checks if admin exists)
   - All new users must use the access request system
   - Only existing admins can approve new users

3. **User Onboarding Flow:**
   - New employee goes to `/request-access`
   - Fills out their information
   - Waits for admin approval
   - Admin approves and assigns role (Admin/Operator/Apprentice)
   - Employee can now log in

---

## 📋 What Each Account Type Can Do

### **Admin**
- Approve/deny access requests
- Create job orders
- Assign operators to jobs
- View all analytics
- Manage equipment
- Access all system features

### **Operator**
- View assigned jobs
- Complete job documents
- Upload photos
- Sign off on completed work
- View equipment assigned to them

### **Apprentice**
- Similar to operator but with limited permissions
- Can assist operators
- Can view but not complete certain documents
- (You can customize this role as needed)

---

## 🐛 Troubleshooting

### "An admin account already exists"
- This means you already created an admin
- Just log in with that account
- If you forgot the password, reset it in Supabase Auth Dashboard

### "Failed to create user account: A user with this email address has already been registered"
- The email is already in use
- Use a different email
- Or find that user in Supabase Auth and create a profile for them

### "reviewedBy (admin user ID) is required"
- You're still using demo auth
- Log out and log in with your real admin account
- Make sure you created the profile in the database

---

## 📞 Quick Reference

### Setup Page URL:
```
http://localhost:3000/setup
```

### Login Page URL:
```
http://localhost:3000/login
```

### Access Requests Page URL:
```
http://localhost:3000/dashboard/admin/access-requests
```

### Request Access (for new users):
```
http://localhost:3000/request-access
```

---

## ✅ Next Steps

1. Go to `http://localhost:3000/setup`
2. Create your super admin account
3. Log in with the new account
4. Approve the pending access requests
5. Start using the system!

The system is now ready for production use! 🚀
