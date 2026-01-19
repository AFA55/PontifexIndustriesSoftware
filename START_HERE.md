# 🚀 START HERE - Deploy in 3 Easy Steps

## ⚠️ IMPORTANT: You tried to run the wrong file!

**What happened:**
- ❌ You tried to run `QUICK_START_DEPLOYMENT.md` (a markdown guide)
- ✅ You need to run `RUN_THIS_IN_SUPABASE.sql` (the actual SQL commands)

---

## 📋 THE ONLY 3 STEPS YOU NEED

### STEP 1: Run the SQL File (2 minutes)

1. Open Supabase Dashboard
2. Click **SQL Editor** (left sidebar)
3. Open this file: **`RUN_THIS_IN_SUPABASE.sql`**
4. **Copy the ENTIRE file contents**
5. **Paste into SQL Editor**
6. Click **"Run"** (bottom right)
7. ✅ You should see success messages

**File to copy:** `RUN_THIS_IN_SUPABASE.sql`

---

### STEP 2: Create Storage Bucket (1 minute)

1. Go to **Storage** (left sidebar in Supabase)
2. Click **"New Bucket"**
3. Name: `job-documents`
4. **Set to PRIVATE** ⚠️ (NOT public!)
5. File size: `10 MB`
6. MIME type: `application/pdf`
7. Click **"Create Bucket"**

---

### STEP 3: Add Storage Policies (1 minute)

1. Click on the `job-documents` bucket you just created
2. Go to **"Policies"** tab
3. Click **"New Policy"**
4. Open file: **`STORAGE_POLICIES.sql`**
5. **Copy Policy 1** → Paste → Save
6. **Repeat for Policies 2, 3, and 4**

**File to use:** `STORAGE_POLICIES.sql`

---

## ✅ THAT'S IT!

After these 3 steps:
1. Navigate to any job in your app
2. You'll see **"Agreement"** as the first step
3. Sign the contract
4. PDF will be auto-generated!

---

## 🆘 TROUBLESHOOTING

**Error: "syntax error at or near #"**
→ You're running a .md file instead of .sql file
→ Use `RUN_THIS_IN_SUPABASE.sql`

**Error: "relation operators does not exist"**
→ You're using the old SQL file
→ Use `RUN_THIS_IN_SUPABASE.sql` (the new one)

**Error: "bucket does not exist"**
→ Complete Step 2 (create the bucket)

**Error: "permission denied"**
→ Complete Step 3 (add the policies)

---

## 📁 FILE REFERENCE

**Files to USE:**
- ✅ `RUN_THIS_IN_SUPABASE.sql` ← Run this in SQL Editor
- ✅ `STORAGE_POLICIES.sql` ← Use for storage policies

**Files to READ (don't run in SQL):**
- 📖 `QUICK_START_DEPLOYMENT.md` ← Deployment guide (reading)
- 📖 `COMPLETE_CONTRACT_AND_PDF_DEPLOYMENT_GUIDE.md` ← Full docs

---

**Next Step:** Open `RUN_THIS_IN_SUPABASE.sql` and copy it to Supabase SQL Editor!
