# Resend Email Setup Guide

This guide will help you set up Resend to send emails from your Pontifex Industries platform.

## Step 1: Create a Resend Account

1. Go to **[https://resend.com](https://resend.com)**
2. Click "Sign Up" (or "Get Started")
3. Create your account (you can use GitHub or email)

## Step 2: Get Your API Key

1. Once logged in, go to **[API Keys](https://resend.com/api-keys)**
2. Click "Create API Key"
3. Give it a name like "Pontifex Platform Production"
4. Select permissions: **"Sending access"** (Full access or Sending only)
5. Click "Create"
6. **COPY THE API KEY** - You won't be able to see it again!
   - It will look like: `re_xxxxxxxxxxxxxxxxxxxxxxxxxxxxx`

## Step 3: Configure Your Environment

1. Open your `.env.local` file in the project root
2. Replace `re_YOUR_API_KEY_HERE` with your actual API key:

```env
RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

## Step 4: Set Up Your Domain (Optional but Recommended)

By default, emails will be sent from `onboarding@resend.dev`. To use your own domain:

### Option A: Use Resend's Free Testing Domain
- No setup needed, but emails might go to spam
- From address: `onboarding@resend.dev`

### Option B: Add Your Own Domain (Recommended for Production)
1. Go to **[Domains](https://resend.com/domains)** in Resend dashboard
2. Click "Add Domain"
3. Enter your domain (e.g., `pontifexindustries.com`)
4. Follow the DNS setup instructions (add SPF, DKIM, DMARC records)
5. Wait for verification (usually takes a few minutes)
6. Once verified, update your `.env.local`:

```env
RESEND_FROM_EMAIL=Pontifex Industries <noreply@pontifexindustries.com>
```

## Step 5: Restart Your Development Server

After updating `.env.local`, restart your dev server:

```bash
# Stop the server (Ctrl+C)
# Then restart it
npm run dev
```

## Step 6: Test Your Email Setup

1. Log in as admin to your platform
2. Go to **Access Requests**
3. Approve a test user
4. Check the console logs - you should see:
   ```
   ✅ Email sent successfully via Resend!
   📧 Email ID: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
   ```
5. Check the recipient's inbox - they should receive the approval email!

## Email Types Your Platform Sends

Your platform now sends these emails:

1. **✅ Approval Confirmation Email**
   - Sent when admin approves an access request
   - Includes login button and account details
   - Beautiful HTML design with your brand colors

2. **🔑 Password Reset Email**
   - Sent when user clicks "Forgot Password"
   - Includes reset link (expires in 1 hour)
   - Security warnings included

3. **📧 Future Notifications** (Coming Soon)
   - Job assignments
   - Schedule updates
   - Equipment maintenance alerts
   - And more!

## Pricing

**Free Tier:**
- 3,000 emails per month
- 100 emails per day
- Perfect for getting started!

**Paid Plans:**
- $20/month for 50,000 emails
- $80/month for 250,000 emails
- Pay as you go: $1 per 1,000 emails over limit

## Troubleshooting

### Emails Not Sending?

1. **Check API Key**
   - Make sure it starts with `re_`
   - No spaces or quotes around it
   - Restart dev server after adding it

2. **Check Console Logs**
   - Look for `✅ Email sent successfully` message
   - If you see errors, read them carefully

3. **Check Resend Dashboard**
   - Go to [Logs](https://resend.com/logs)
   - See all sent emails and their status
   - Check for bounces or errors

4. **Emails Going to Spam?**
   - Add your own domain (see Step 4 Option B)
   - Set up proper DNS records (SPF, DKIM, DMARC)
   - Ask recipients to whitelist your email

### Need Help?

- **Resend Docs**: [https://resend.com/docs](https://resend.com/docs)
- **Resend Support**: [https://resend.com/support](https://resend.com/support)

## Security Notes

🔒 **IMPORTANT:**
- **NEVER** commit your API key to Git
- Keep it in `.env.local` only
- `.env.local` is in `.gitignore` by default
- For production, use environment variables in your hosting platform

## Next Steps

Once emails are working:

1. Test all email flows (approval, password reset)
2. Customize email templates if needed (`lib/email.ts`)
3. Add more notification types as your app grows
4. Monitor email deliverability in Resend dashboard
5. Set up a custom domain for better deliverability

---

**Need help?** Check the Resend documentation or contact support. The setup is very straightforward!
