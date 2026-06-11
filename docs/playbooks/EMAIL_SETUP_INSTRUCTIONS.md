# Email Notifications Setup

## Overview
The Service Completion Agreement feature now automatically sends emails to customers and salespeople when jobs are signed.

## Setup Steps

### 1. Run SQL Migration
Run the following SQL file in your Supabase SQL Editor to add email columns:

**File:** `ADD_EMAIL_COLUMNS_TO_JOB_ORDERS.sql`

This adds:
- `customer_email` - Email address to send signed agreements
- `salesperson_email` - Email address for completion notifications

### 2. Configure Resend API
The email service uses Resend. Make sure your `.env.local` has:

```env
RESEND_API_KEY=re_xxxxxxxxxxxxx
RESEND_FROM_EMAIL="Pontifex Industries <your-domain@resend.dev>"
```

If you don't have a Resend account:
1. Sign up at https://resend.com
2. Verify your domain (or use their test domain)
3. Get your API key from the dashboard
4. Add it to `.env.local`

### 3. Add Email Addresses to Jobs
Admins can add customer and salesperson emails when creating/editing jobs in the dispatch scheduling page.

## Features

### Customer Email
When a job is completed and signed:
- ✅ Generates PDF of signed Service Completion Agreement
- ✅ Sends email to customer with PDF attached
- ✅ Includes job details, signed date, and direct PDF link
- ✅ Professional email template with Pontifex branding

### Salesperson Email
When a job is completed and signed:
- ✅ Sends notification to salesperson/admin
- ✅ Includes customer name, job ID, and signed date
- ✅ Shows customer feedback ratings if provided
- ✅ Includes link to view signed agreement

## Testing

To test the email functionality:

1. Ensure `.env.local` has valid `RESEND_API_KEY`
2. Create a test job with your email addresses
3. Complete the job workflow as an operator
4. Sign the Service Completion Agreement
5. Check your inbox for both emails

## Troubleshooting

### Emails Not Sending

Check the server console logs for:
- `⚠️ RESEND_API_KEY not configured` - Add API key to .env.local
- `❌ Error sending email via Resend` - Check API key validity
- `📧 Email sent successfully` - Email sent (check spam folder)

### Missing Email Columns

If you see database errors about missing columns:
1. Run `ADD_EMAIL_COLUMNS_TO_JOB_ORDERS.sql` in Supabase SQL Editor
2. Refresh the database schema
3. Restart your Next.js development server

## Email Templates

Emails use the "Professionalism Modernism" design theme with:
- Professional HTML templates
- Pontifex Industries branding
- Mobile-responsive design
- Clear call-to-action buttons

## Admin Completed Jobs Archive

Admins can view all completed jobs and their documents at:
**URL:** `/dashboard/admin/completed-jobs`

Features:
- View all signed jobs
- Search by customer, location, or signer
- See customer feedback ratings
- Download PDFs
- Filter by completion date
