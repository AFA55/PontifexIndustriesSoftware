# 🚀 Pontifex Industries - Setup Guide

## Quick Setup Checklist

### 1. ✅ Twilio SMS Setup

You have a Twilio account! Here's how to configure it:

#### Step 1: Get Your Credentials
1. Go to [https://console.twilio.com](https://console.twilio.com)
2. Find your **Account SID** and **Auth Token** on the dashboard
3. Get your **Twilio Phone Number** from the Phone Numbers section

#### Step 2: Update `.env.local`
Replace these values in your `.env.local` file:

```bash
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxx  # From Twilio Console
TWILIO_AUTH_TOKEN=your_auth_token_here            # From Twilio Console
TWILIO_PHONE_NUMBER=+1XXXXXXXXXX                   # Your Twilio number
```

#### Step 3: Test It!
```bash
curl -X POST http://localhost:3002/api/sms/test \
  -H "Content-Type: application/json" \
  -d '{"to": "+1234567890", "message": "Test from Pontifex!"}'
```

---

### 2. 🗺️ Google Maps API Setup

#### Step 1: Create API Key
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project (or select existing)
3. Enable these APIs:
   - **Places API**
   - **Maps JavaScript API**
   - **Geocoding API**
   - **Distance Matrix API**

#### Step 2: Get API Key
1. Go to **Credentials** → **Create Credentials** → **API Key**
2. Copy the API key
3. (Optional) Restrict the key to your domain

#### Step 3: Update `.env.local`
```bash
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=AIzaSyXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
```

#### Billing Note
Google Maps offers **$200 free credit per month**. For your use case:
- Address autocomplete: ~$0.017 per request
- Distance calculations: ~$0.005 per request
- You'd need to do ~11,000 lookups/month to exceed free tier

---

### 3. 💾 Database - Already Done! ✅

The following tables have been created:
- ✅ `contractors` - Customer/contractor profiles
- ✅ `contractor_jobs` - Links contractors to jobs
- ✅ `standby_logs` - Tracks standby time events
- ✅ `standby_policies` - Legal policy documents

---

### 4. 📄 Legal Document - Ready to Review

The standby policy has been drafted at:
```
/lib/legal/standby-policy.ts
```

**Action Required:**
- Review the policy
- Update placeholders:
  - `[YOUR STATE]` → Your state name
  - `[YOUR COUNTY]` → Your county name
  - `[YOUR PHONE NUMBER]` → Your business phone
  - `[YOUR BUSINESS ADDRESS]` → Your address
- **Have a lawyer review** before using

---

## What's Been Built

### ✅ Completed
1. **Database Schema** - Contractors, jobs, standby tracking
2. **Legal Policy** - Comprehensive standby terms ($189/hr)
3. **SMS System** - Twilio integration with 4 notification types:
   - In Route notification
   - 15-minute warning
   - Arrived on-site
   - Standby time notice

### 🚧 In Progress
1. **Google Maps Autocomplete** - For address fields
2. **Smart Drive Time Calculator** - Auto-calculates arrival times
3. **Contractor Profile UI** - Manage customer relationships
4. **Dispatch Card Fixes** - Mobile responsiveness
5. **Standby Workflow** - Operator buttons and client acknowledgment

---

## Next Steps

### Immediate (You Need To Do)
1. **Add Twilio credentials** to `.env.local`
2. **Get Google Maps API key** and add to `.env.local`
3. **Review legal policy** and update placeholders
4. **Restart dev server**: `npm run dev`

### Testing
1. **Test SMS**: Try sending a test message
2. **Test Address Autocomplete**: Once Google key is added
3. **Review Standby Policy**: Check `/legal/standby-policy` page

---

## Cost Summary

### Twilio SMS
- **Pay-as-you-go**: ~$0.0079 per SMS
- **Example**: 100 messages/month = $0.79
- **Phone number**: $1-$2/month

### Google Maps
- **Free tier**: $200/month credit
- **Your usage**: Probably $5-20/month
- **Net cost**: $0 (within free tier)

### Supabase
- **Demo environment**: FREE
- **Patriot Concrete**: FREE
- **Total**: $0/month

**Total Expected Monthly Cost: $1-$2** (just Twilio phone number)

---

## Support

If you need help:
1. Check the README.md
2. Review code comments in `/lib/sms.ts` and `/lib/legal/standby-policy.ts`
3. Test endpoints at `/api/sms/*`

---

**Last Updated:** January 26, 2026
**Version:** 1.0
