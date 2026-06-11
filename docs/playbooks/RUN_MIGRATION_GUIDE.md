# 🚀 How to Run the Document System Migration

## Step-by-Step Instructions

### Option 1: Via Supabase Dashboard (Recommended)

1. **Open Supabase Dashboard**
   - Go to [supabase.com](https://supabase.com)
   - Log in to your account
   - Select your Pontifex Industries project

2. **Navigate to SQL Editor**
   - Click on the "SQL Editor" icon in the left sidebar (looks like a database icon)

3. **Open the Migration File**
   - In your code editor, open:
     ```
     supabase/migrations/20250130_enhance_document_system.sql
     ```
   - Copy the **ENTIRE contents** of the file (Cmd+A, then Cmd+C)

4. **Paste and Run**
   - In Supabase SQL Editor, click "New Query"
   - Paste the migration SQL (Cmd+V)
   - Click the green "Run" button (or press Cmd+Enter)

5. **Verify Success**
   - You should see "Success. No rows returned"
   - Check the "Table Editor" - you should see new tables:
     - `job_documents`
     - `document_history`
     - `document_comments`

---

### Option 2: Via Supabase CLI

If you have Supabase CLI installed:

```bash
cd /Users/afa55/Documents/Pontifex\ Industres/pontifex-platform
supabase db push
```

---

## ✅ What This Migration Does

1. **Drops old table:** `required_documents` (if it exists)
2. **Creates 3 new tables:**
   - `job_documents` - Stores all document data
   - `document_history` - Audit trail of changes
   - `document_comments` - Comments on documents

3. **Sets up security:**
   - Row Level Security (RLS) policies
   - Permissions for admins and operators

4. **Creates automation:**
   - Auto-update timestamps
   - Automatic history tracking
   - Performance indexes

5. **Creates views:**
   - `job_document_stats` - Document completion statistics
   - `operator_document_assignments` - Operator task view

---

## 🧪 After Migration - Test It!

### Test Creating a Job Ticket:

1. **Go to Dispatch & Scheduling**
   - Navigate to: http://localhost:3000/dashboard/admin/dispatch-scheduling

2. **Fill Out Job Information**
   - Customer Job Title: "PIEDMONT ATH."
   - Customer Name: "WHITEHAWK (CAM)"
   - Contact On Site: "John Smith"
   - Location: "PIEDMONT ATHENS"
   - Address: "1199 PRINCE AVE, ATHENS, GA"

3. **Select Job Type**
   - Choose: "CORE DRILLING"

4. **Assign Operators**
   - Select: "ANDRES GUERRERO-C" (or any operator)

5. **Select Required Documents**
   - Scroll to "Required Documents" section
   - Click on documents you want to require:
     - ✅ JSA Form (Job Safety Analysis)
     - ✅ Silica Dust/Exposure Control Plan
     - ✅ Equipment Daily Inspection
     - ✅ Time Card
     - ✅ Customer Sign-Off

6. **Submit**
   - Click "Create Job Order"
   - Job should be created successfully!

---

## 🔍 Verify in Database

After creating a job, check Supabase:

1. Go to **Table Editor**
2. Select `job_documents` table
3. You should see records for each document you selected
4. Each document should have:
   - `job_id` - Links to the job
   - `document_template_id` - ID like "jsa-form"
   - `document_name` - Full name
   - `status` - "pending"

---

## ❗ Troubleshooting

### If you get an error about "required_documents":
This means the old table structure conflicts. The migration handles this by dropping the old table first.

### If policies fail:
Make sure you have the `profiles` table with a `role` column.

### If the migration succeeds but no documents appear:
Check your form submission - make sure `requiredDocuments` array contains document IDs (like "jsa-form"), not full names.

---

## 📞 Next Steps After Migration

1. ✅ Migration complete
2. ✅ Create a test job ticket
3. ✅ Assign to operator
4. ⏳ Build operator interface (next phase)
5. ⏳ Add document completion forms (next phase)

---

**Ready to run the migration? Follow Option 1 above!**
