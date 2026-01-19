# Setup Storage Bucket for Certification Documents

## Step 1: Create Storage Bucket in Supabase

1. Go to your **Supabase Dashboard**
2. Navigate to **Storage** in the left sidebar
3. Click **"New bucket"**
4. Fill in the details:
   - **Name:** `certification-documents`
   - **Public bucket:** ✅ Check this (so PDFs can be accessed via URL)
   - Click **"Create bucket"**

## Step 2: Set Storage Policies

Run this SQL in your **Supabase SQL Editor**:

```sql
-- Allow authenticated users to upload files
CREATE POLICY "Authenticated users can upload certification documents"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'certification-documents');

-- Allow authenticated users to view files
CREATE POLICY "Authenticated users can view certification documents"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'certification-documents');

-- Allow authenticated users to delete files
CREATE POLICY "Authenticated users can delete certification documents"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'certification-documents');

-- Verify policies were created
SELECT * FROM storage.policies WHERE bucket_id = 'certification-documents';
```

## Step 3: Run the Database Migration

Run this in **Supabase SQL Editor**:

```sql
-- Copy and paste contents of:
supabase/migrations/20260112_add_equipment_skill_levels.sql
```

## Step 4: Test It Out!

1. Go to Operator Profiles page
2. Click on an operator
3. Go to **"Certifications & Docs"** tab
4. Click **"Upload PDF"** button
5. Select a PDF file (OSHA card, license, etc.)
6. It should upload and appear in the list!

## Troubleshooting

**Error: "Failed to upload file. Make sure the storage bucket exists."**
- Go back to Step 1 and create the `certification-documents` bucket
- Make sure it's marked as **Public**

**Error: "Permission denied"**
- Run the SQL policies from Step 2
- Make sure you're logged in as an authenticated user

**Can't view PDF**
- Make sure the bucket is set to **Public**
- Check the file URL in the browser - it should load the PDF

## File Structure

Files are stored as:
```
certification-documents/
  ├── {operator_id}/
  │   ├── {timestamp1}.pdf
  │   ├── {timestamp2}.pdf
  │   └── ...
```

Each operator has their own folder for organization.

## Security Notes

- ✅ Only authenticated users can upload/view/delete
- ✅ Files are organized by operator ID
- ✅ Public URLs allow easy sharing and viewing
- ⚠️ Anyone with the URL can view the PDF (by design for easy access)
- 🔒 To make fully private, uncheck "Public bucket" and use signed URLs instead
