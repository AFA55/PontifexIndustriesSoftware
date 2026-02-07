# 🗺️ Google Maps API Setup - Quick Fix

## ❌ Current Error:
```
ApiNotActivatedMapError
The Google Maps JavaScript API has not been enabled for this API key
```

## ✅ Solution (5 minutes):

### Step 1: Go to Google Cloud Console
Open: https://console.cloud.google.com/

### Step 2: Select Your Project
- Click the project dropdown at the top
- Select your project (or create one if needed)

### Step 3: Enable Required APIs
Click these links to enable each API:

1. **Maps JavaScript API** (Required for autocomplete)
   - https://console.cloud.google.com/apis/library/maps-backend.googleapis.com

2. **Places API** (Required for address suggestions)
   - https://console.cloud.google.com/apis/library/places-backend.googleapis.com

3. **Distance Matrix API** (Required for drive time)
   - https://console.cloud.google.com/apis/library/distance-matrix-backend.googleapis.com

4. **Geocoding API** (Optional but recommended)
   - https://console.cloud.google.com/apis/library/geocoding-backend.googleapis.com

For each API:
- Click "ENABLE"
- Wait for it to activate (~30 seconds)

### Step 4: Verify Your API Key
1. Go to: https://console.cloud.google.com/apis/credentials
2. Find your API key: `AIzaSyB4kgVNVxWQwecBE-S4kx_VFORXgpo1K6Y`
3. Click "Edit API key" (pencil icon)
4. Under "API restrictions":
   - Select "Restrict key"
   - Check the boxes for:
     - ✅ Maps JavaScript API
     - ✅ Places API
     - ✅ Distance Matrix API
     - ✅ Geocoding API
5. Click "Save"

### Step 5: Test It
After enabling the APIs:
1. Wait 1-2 minutes for propagation
2. Go to: http://localhost:3000/dashboard/admin/dispatch-scheduling
3. Create new job → Step 3 (Location)
4. Type an address → See autocomplete! ✨

---

## 💰 Pricing (Don't Worry!)

Google gives you **$200 free credit per month**. Here's what you'll use:

| API | Cost per Request | Free Tier |
|-----|------------------|-----------|
| Places Autocomplete | $0.017 | ~11,764 requests |
| Distance Matrix | $0.005 | ~40,000 requests |
| Maps JavaScript | $0.007/load | ~28,571 loads |

**Example Monthly Usage:**
- 200 job orders/month
- 2 address lookups per order = 400 requests
- Cost: 400 × $0.017 = **$6.80/month**
- With $200 credit: **FREE** ✅

You'd need to create **1,000+ job orders per month** to exceed the free tier!

---

## 🔒 Security (Recommended)

### Restrict API Key to Your Domain:
1. Go to API key settings
2. Under "Application restrictions":
   - Select "HTTP referrers"
   - Add:
     - `http://localhost:3000/*` (for development)
     - `https://yourdomain.com/*` (for production)
3. Click "Save"

This prevents others from stealing and using your API key.

---

## ✅ Quick Checklist

- [x] Enable Maps JavaScript API ✅
- [x] Enable Places API ✅
- [x] Enable Distance Matrix API ✅
- [ ] Enable Geocoding API (optional)
- [x] Wait 1-2 minutes ✅
- [ ] Refresh browser
- [ ] Test address autocomplete at http://localhost:3001/dashboard/admin/dispatch-scheduling

---

## 🆘 Still Not Working?

1. **Check billing is enabled:**
   - Go to: https://console.cloud.google.com/billing
   - You need a payment method on file (won't be charged with free tier)

2. **Clear browser cache:**
   ```bash
   # In Chrome
   Cmd + Shift + Delete → Clear cache
   ```

3. **Wait longer:**
   - Sometimes takes up to 5 minutes for APIs to activate

4. **Verify in browser console:**
   - Open DevTools (F12)
   - Look for different error message
   - Share with me if still failing

---

**Need Help?** Just let me know what error you see after enabling the APIs!
