# ⏰ Time Tracking with Geolocation - Setup Guide

## 🎯 Feature Overview

Operators can only clock in/out when physically at the shop location. GPS coordinates are verified and stored for audit purposes.

---

## 📋 Setup Instructions

### **STEP 1: Run Database Migration**

Go to Supabase Dashboard → SQL Editor and run:

```sql
-- This will be in: CREATE_TIMECARDS_TABLE.sql
```

Copy and paste the entire contents of `CREATE_TIMECARDS_TABLE.sql` into the SQL editor and click "Run".

✅ **Expected Result**: "Success. No rows returned"

---

### **STEP 2: Configure Shop Location**

Open `lib/geolocation.ts` and update lines 8-11 with your shop's coordinates:

```typescript
export const SHOP_LOCATION = {
  latitude: 34.0522,  // ⚠️ REPLACE with your shop's latitude
  longitude: -118.2437, // ⚠️ REPLACE with your shop's longitude
  name: 'Pontifex Industries Shop',
};
```

**How to get your coordinates:**
1. Go to [Google Maps](https://maps.google.com)
2. Right-click on your shop location
3. Click "What's here?"
4. Copy the coordinates (e.g., `34.0522, -118.2437`)
5. Paste them into `lib/geolocation.ts`

**Optional: Adjust allowed radius** (line 15):
```typescript
export const ALLOWED_RADIUS_METERS = 100; // Default: 100m (~328 feet)
```

---

### **STEP 3: Ensure HTTPS or Localhost**

Geolocation API only works on:
- ✅ `localhost` (development)
- ✅ `https://` (production)
- ❌ NOT on `http://` (insecure)

Your Next.js dev server (`localhost:3000`) is perfect for testing!

---

## 🧪 Testing the Feature

### **Test 1: Clock In Success**
1. Run `npm run dev`
2. Login as an operator
3. Go to `/dashboard`
4. Click "Clock In" button
5. **Allow location access** when browser prompts
6. ✅ **Expected**: Success message showing you clocked in
7. ✅ **Expected**: Button changes to "Clock Out"
8. ✅ **Expected**: Hours counter starts at 0.0

### **Test 2: Location Too Far**
1. Temporarily change `ALLOWED_RADIUS_METERS` to `1` (1 meter)
2. Try to clock in
3. ✅ **Expected**: Error message saying you're too far from shop
4. ✅ **Expected**: Shows distance (e.g., "You are 523m away")
5. Change `ALLOWED_RADIUS_METERS` back to `100`

### **Test 3: Clock Out**
1. While clocked in, wait a few minutes
2. Click "Clock Out"
3. ✅ **Expected**: Success message with total hours
4. ✅ **Expected**: Button changes back to "Clock In"
5. ✅ **Expected**: Hours counter resets to 0.0

### **Test 4: Can't Clock In Twice**
1. Clock in successfully
2. Try to clock in again (without clocking out)
3. ✅ **Expected**: Error "You are already clocked in"

### **Test 5: Can't Clock Out Without Clocking In**
1. Make sure you're clocked out
2. Try calling the clock-out API directly
3. ✅ **Expected**: Error "No active clock-in found"

### **Test 6: Verify Database**
1. Go to Supabase Dashboard → Table Editor → `timecards`
2. Find your timecard entry
3. ✅ **Expected**: See your clock in time
4. ✅ **Expected**: See GPS coordinates (latitude/longitude)
5. ✅ **Expected**: See accuracy (GPS precision in meters)
6. Clock out, then refresh the table
7. ✅ **Expected**: See clock out time
8. ✅ **Expected**: See `total_hours` calculated automatically

---

## 📁 Files Created

### **Database:**
- `CREATE_TIMECARDS_TABLE.sql` - Database schema with RLS policies

### **Backend (API Routes):**
- `app/api/timecard/clock-in/route.ts` - Clock in with location verification
- `app/api/timecard/clock-out/route.ts` - Clock out with location verification
- `app/api/timecard/current/route.ts` - Get current active timecard
- `app/api/timecard/history/route.ts` - Get timecard history
- `app/api/admin/timecards/route.ts` - Admin view of all timecards

### **Frontend:**
- `lib/geolocation.ts` - Geolocation utilities and distance calculation
- `app/dashboard/page.tsx` - Updated with clock in/out functionality

---

## 🔧 How It Works

### **1. User Clicks "Clock In"**
```
User clicks button
  ↓
Browser requests location permission
  ↓
Get GPS coordinates (latitude, longitude, accuracy)
  ↓
Calculate distance from shop using Haversine formula
  ↓
If distance ≤ 100m → Allow clock in
If distance > 100m → Show error with distance
  ↓
Store timecard in database with:
  - user_id
  - clock_in_time
  - clock_in_latitude
  - clock_in_longitude  - clock_in_accuracy
  - date
```

### **2. User Clicks "Clock Out"**
```
User clicks button
  ↓
Verify location again (must be at shop)
  ↓
Calculate total hours (clock_out - clock_in)
  ↓
Update timecard with:
  - clock_out_time
  - clock_out_latitude
  - clock_out_longitude
  - clock_out_accuracy
  - total_hours (calculated)
```

### **3. Security Features**
- ✅ Row Level Security (RLS) - Users can only see their own timecards
- ✅ Admin bypass - Admins can view all timecards
- ✅ Location verification - Can't clock in remotely
- ✅ GPS coordinates stored - Audit trail for verification
- ✅ Auto-calculate hours - No manual entry needed
- ✅ Can't clock in twice - Prevents duplicate entries
- ✅ Can't clock out without clock in - Data integrity

---

## 🎨 UI Features

### **Operator Dashboard:**
- Real-time hours counter (updates every minute)
- Dynamic button (green "Clock In" / red "Clock Out")
- Success/error messages with auto-dismiss
- Shows clock in time when clocked in
- Loading state during location verification
- Quick action button in footer

### **Visual States:**
- **Not Clocked In**: Green button, "Start Your Day"
- **Clocked In**: Red button, shows hours worked
- **Loading**: Spinner, "Verifying Location..."
- **Success**: Green message, auto-dismiss after 5s
- **Error**: Red message, shows reason (too far, no permission, etc.)

---

## 🚀 Next Steps

### **Recommended: Add Admin Timecard Management**
Create a page for admins to:
- View all employee timecards
- Filter by date range or employee
- Approve/reject timecards
- Export to CSV for payroll
- View location data on map

### **Optional Enhancements:**
1. **Break Time Tracking** - Allow operators to clock out for lunch
2. **Overtime Calculation** - Auto-flag timecards > 8 hours
3. **Weekly Reports** - Email summaries to admins
4. **Mobile App** - Better GPS accuracy on phones
5. **Geofencing Zones** - Different locations for job sites

---

## ❓ Troubleshooting

### **"Location permission denied"**
- User needs to allow location access in browser settings
- Chrome: Settings → Privacy → Site Settings → Location
- Safari: Preferences → Websites → Location

### **"Location information unavailable"**
- GPS is disabled on device
- Weak GPS signal (try going outdoors)
- Browser doesn't support Geolocation API

### **"You are X km away from shop"**
- Verify shop coordinates are correct
- Increase `ALLOWED_RADIUS_METERS` if needed
- Check GPS accuracy (should be < 50m for best results)

### **Timecard not showing in database**
- Check browser console for errors
- Verify SQL migration ran successfully
- Check RLS policies are enabled

---

## 📞 Support

If you encounter issues, check:
1. Browser console (F12 → Console tab)
2. Network tab (F12 → Network tab)
3. Supabase logs (Supabase Dashboard → Logs)

Look for error messages and GPS coordinates in console.
