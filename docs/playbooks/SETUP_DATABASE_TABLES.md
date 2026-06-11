# Database Setup Instructions

## Step 1: Create Required Tables

1. Go to your **Supabase Dashboard**: https://supabase.com/dashboard
2. Select your project: **pontifex-platform**
3. Click on **SQL Editor** in the left sidebar
4. Click **New Query**
5. Copy the contents of `CREATE_SILICA_PLANS_AND_WORKFLOW_TABLES.sql`
6. Paste into the SQL Editor
7. Click **Run** or press `Ctrl+Enter` (Windows) / `Cmd+Enter` (Mac)

You should see success messages showing the tables were created:
- ✅ silica_plans
- ✅ operator_status_history
- ✅ workflow_steps

## Step 2: Create Storage Bucket (Optional but Recommended)

1. In Supabase Dashboard, click **Storage** in the left sidebar
2. Click **Create a new bucket**
3. Enter bucket name: `job-attachments`
4. Set to **Public** bucket
5. Click **Create bucket**

## What These Tables Do

### silica_plans
- Stores silica dust exposure control plan data
- Keeps PDF files (or base64 as fallback)
- One plan per job

### operator_status_history
- Tracks operator's current status (in_route, in_progress, completed)
- Records timestamps for each status change
- Allows system to remember where operator left off

### workflow_steps
- Detailed tracking of each step in the workflow
- Flags for: equipment_checklist, silica_form, work_performed, etc.
- Enables resume functionality

## Troubleshooting

**If you get "table already exists" errors:**
- That's okay! It means the tables are already there
- The script uses `CREATE TABLE IF NOT EXISTS` so it's safe to run multiple times

**If you get permission errors:**
- Make sure you're logged into the correct Supabase project
- Contact your Supabase admin if you don't have SQL access

## After Setup

Once the tables are created:
1. Restart your Next.js dev server (`npm run dev`)
2. Try the operator workflow again
3. The "Start In Route" button should now change to "Continue Job" after clicking
4. Silica forms should save successfully
5. System will remember operator's progress

## Notes

- The PDF storage is optional - if the bucket doesn't exist, PDFs will be stored as base64 in the database
- All tables have Row Level Security (RLS) enabled
- Operators can only see their own data; admins can see all data
