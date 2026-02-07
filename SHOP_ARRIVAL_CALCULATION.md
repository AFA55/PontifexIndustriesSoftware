# Shop Arrival Time Calculation

## Overview
The shop arrival time is automatically calculated based on:
1. **Job Site Arrival Time** - When the operator should arrive at the job site
2. **Buffer Time** - Extra time before job (30, 45, or 60 minutes)
3. **Drive Time** - Travel time from shop to job site (from Step 3)

## Formula
```
Shop Arrival Time = Job Site Arrival Time - Buffer Time - Drive Time
```

## Example Scenarios

### Scenario 1: Basic Calculation
**Step 3 - Location Info:**
- Drive Time: 1 hour 30 minutes

**Step 4 - Schedule Info:**
- Job Site Arrival Time: 10:00 AM
- User clicks: "30 min buffer"

**Calculation:**
```
Shop Arrival = 10:00 AM - 30 min - 1h 30m
Shop Arrival = 10:00 AM - 2h 00m
Shop Arrival = 08:00 AM
```

**Result:** Shop arrival time automatically set to `08:00`

---

### Scenario 2: Short Drive
**Step 3 - Location Info:**
- Drive Time: 0 hours 30 minutes

**Step 4 - Schedule Info:**
- Job Site Arrival Time: 08:00 AM
- User clicks: "45 min buffer"

**Calculation:**
```
Shop Arrival = 08:00 AM - 45 min - 30 min
Shop Arrival = 08:00 AM - 1h 15m
Shop Arrival = 06:45 AM
```

**Result:** Shop arrival time automatically set to `06:45`

---

### Scenario 3: Long Drive
**Step 3 - Location Info:**
- Drive Time: 2 hours 15 minutes

**Step 4 - Schedule Info:**
- Job Site Arrival Time: 12:00 PM
- User clicks: "1 hr buffer"

**Calculation:**
```
Shop Arrival = 12:00 PM - 1h 00m - 2h 15m
Shop Arrival = 12:00 PM - 3h 15m
Shop Arrival = 08:45 AM
```

**Result:** Shop arrival time automatically set to `08:45`

---

### Scenario 4: Early Morning Job (Wraps to Previous Day)
**Step 3 - Location Info:**
- Drive Time: 1 hour 0 minutes

**Step 4 - Schedule Info:**
- Job Site Arrival Time: 06:00 AM
- User clicks: "1 hr buffer"

**Calculation:**
```
Shop Arrival = 06:00 AM - 1h 00m - 1h 00m
Shop Arrival = 06:00 AM - 2h 00m
Shop Arrival = 04:00 AM
```

**Result:** Shop arrival time automatically set to `04:00`

---

### Scenario 5: Very Early (Extreme Case)
**Step 3 - Location Info:**
- Drive Time: 3 hours 0 minutes

**Step 4 - Schedule Info:**
- Job Site Arrival Time: 07:00 AM
- User clicks: "1 hr buffer"

**Calculation:**
```
Shop Arrival = 07:00 AM - 1h 00m - 3h 00m
Shop Arrival = 07:00 AM - 4h 00m
Shop Arrival = 03:00 AM
```

**Result:** Shop arrival time automatically set to `03:00`

---

### Scenario 6: No Drive Time
**Step 3 - Location Info:**
- Drive Time: 0 hours 0 minutes (local job)

**Step 4 - Schedule Info:**
- Job Site Arrival Time: 09:00 AM
- User clicks: "30 min buffer"

**Calculation:**
```
Shop Arrival = 09:00 AM - 30 min - 0 min
Shop Arrival = 09:00 AM - 30 min
Shop Arrival = 08:30 AM
```

**Result:** Shop arrival time automatically set to `08:30`

---

## UI Enhancements

### Drive Time Display
When drive time is entered in Step 3, Step 4 now shows:

```
┌─────────────────────────────────────────────────┐
│ 📍 Drive time: 1h 30m                           │
│ Shop arrival = Job arrival - buffer - drive time│
└─────────────────────────────────────────────────┘
```

This helps users understand how the calculation works.

### Button Labels
Changed button labels from:
- ❌ "30 min before"
- ❌ "45 min before"
- ❌ "1 hr before"

To:
- ✅ "30 min buffer"
- ✅ "45 min buffer"
- ✅ "1 hr buffer"

This clarifies that the buffer time is **in addition to** the drive time.

---

## Code Changes

### Updated Function
```typescript
const calculateShopArrival = (minutesBefore: number) => {
  if (!formData.arrivalTime) {
    alert('Please set the job arrival time first');
    return;
  }

  // Convert arrival time to minutes
  const [hours, minutes] = formData.arrivalTime.split(':').map(Number);
  const arrivalTimeInMinutes = hours * 60 + minutes;

  // Calculate drive time in minutes
  const driveTimeInMinutes = (formData.estimatedDriveHours * 60) + formData.estimatedDriveMinutes;

  // Calculate shop arrival: arrival time - buffer time - drive time
  const totalMinutesToSubtract = minutesBefore + driveTimeInMinutes;
  const shopArrivalInMinutes = arrivalTimeInMinutes - totalMinutesToSubtract;

  // Handle negative times (wrap to previous day if needed)
  const adjustedMinutes = (shopArrivalInMinutes + 1440) % 1440;
  const shopHours = Math.floor(adjustedMinutes / 60);
  const shopMinutes = adjustedMinutes % 60;

  const shopArrivalTime = `${String(shopHours).padStart(2, '0')}:${String(shopMinutes).padStart(2, '0')}`;
  handleInputChange('shopArrivalTime', shopArrivalTime);
};
```

### Key Changes
1. **Added drive time calculation**: `driveTimeInMinutes = (hours * 60) + minutes`
2. **Combined buffer + drive**: `totalMinutesToSubtract = buffer + driveTime`
3. **Improved clarity**: Better variable names and comments

---

## Testing Checklist

### Basic Tests
- [ ] **Test 1**: Drive time 1h, buffer 30min, arrival 10:00 → Shop: 08:30 ✓
- [ ] **Test 2**: Drive time 1h 30m, buffer 30min, arrival 10:00 → Shop: 08:00 ✓
- [ ] **Test 3**: Drive time 0h 45m, buffer 45min, arrival 09:00 → Shop: 07:30 ✓
- [ ] **Test 4**: Drive time 2h, buffer 1hr, arrival 14:00 → Shop: 11:00 ✓

### Edge Cases
- [ ] **Test 5**: No drive time (0h 0m) → Should only subtract buffer
- [ ] **Test 6**: Very early morning (wraps correctly, no negative times)
- [ ] **Test 7**: Change drive time after setting shop arrival → Old shop arrival remains
- [ ] **Test 8**: Click buffer button without setting arrival time → Shows alert

### UI Tests
- [ ] **Test 9**: Drive time info box appears when drive time > 0
- [ ] **Test 10**: Drive time info box shows correct values
- [ ] **Test 11**: Button labels say "buffer" not "before"
- [ ] **Test 12**: Shop arrival field updates immediately when clicking buffer button

---

## User Workflow

### Happy Path
```
Step 1: Basic Info
  ↓
Step 2: Work Details
  ↓
Step 3: Location Info
  ├─ Enter address: "123 Main St, Austin, TX"
  └─ Enter drive time: 1h 30m
  ↓
  [Auto-save triggered]
  ↓
Step 4: Schedule Info
  ├─ Enter start date: 2026-02-15
  ├─ Enter arrival time: 10:00
  ├─ See drive time info box: "📍 Drive time: 1h 30m"
  ├─ Click "30 min buffer"
  └─ Shop arrival auto-fills: 08:00
  ↓
Continue to remaining steps...
```

### Manual Override
Users can still manually edit the shop arrival time if the auto-calculation doesn't fit their needs:
```
Step 4: Schedule Info
  ├─ Click "30 min buffer" → Shop arrival: 08:00
  ├─ Decide they need more time
  └─ Manually change to: 07:30
```

---

## Benefits

### For Users
- ✅ **Automatic calculation** - No mental math required
- ✅ **Visual feedback** - See drive time and formula
- ✅ **Quick buttons** - One-click common scenarios
- ✅ **Manual override** - Still has full control
- ✅ **Clear labels** - "Buffer" is more intuitive than "before"

### For Operations
- ✅ **Accurate scheduling** - Less human error
- ✅ **Consistent buffer times** - Standardized across jobs
- ✅ **Accounts for travel** - Operators arrive on time
- ✅ **Realistic timelines** - Better resource planning

---

## Example Walkthrough

### Real-World Scenario: Downtown Core Drilling

**Step 3 - Location:**
```
Address: 500 Congress Ave, Austin, TX 78701
Drive Time: 0 hours 45 minutes
```

**Step 4 - Schedule:**
```
Start Date: 2026-02-20
Job Site Arrival: 08:00
```

**User clicks "45 min buffer":**
```
Calculation:
  Job Arrival: 08:00 (480 minutes)
  Buffer Time: 45 minutes
  Drive Time: 45 minutes

  Shop Arrival = 480 - 45 - 45
  Shop Arrival = 390 minutes
  Shop Arrival = 06:30 (6h 30m)
```

**Result:**
- Shop Arrival Time field shows: `06:30`
- Operator knows to be at shop by 6:30 AM
- Leaves shop by ~6:30 AM
- 45 min drive
- Arrives ~7:15 AM
- 45 min buffer for equipment prep, traffic, etc.
- Ready to start work at 8:00 AM

---

## Troubleshooting

### Issue: Shop arrival time is wrong
**Check:**
1. Did you enter the correct drive time in Step 3?
2. Did you set the job arrival time before clicking a buffer button?
3. Did you click the correct buffer button?

### Issue: Drive time info box doesn't appear
**Reason:** Drive time is 0h 0m
**Solution:** Enter drive time in Step 3 (hours and/or minutes)

### Issue: Alert says "Please set the job arrival time first"
**Reason:** Job arrival time field is empty
**Solution:** Fill in the "Job Site Arrival Time" field first, then click buffer button

### Issue: Shop arrival shows strange time (like 23:45)
**Reason:** Calculation resulted in negative time, wrapped to previous day
**Example:**
- Arrival: 01:00 AM
- Buffer: 1 hr
- Drive: 1 hr
- Result: -1:00 → wraps to 23:00 (11 PM previous day)

**Solution:** This is correct behavior for very early morning jobs. Operator needs to arrive at shop the night before.

---

## Future Enhancements

### Potential Improvements
1. **Smart defaults**: Suggest buffer time based on job type
2. **Traffic integration**: Adjust drive time based on time of day
3. **Weather warnings**: Alert if early morning ice/weather concerns
4. **Operator notifications**: Auto-send shop arrival time to operator
5. **Route optimization**: Calculate drive time via Google Maps API
6. **Multiple stops**: Handle multi-location jobs
7. **Equipment prep time**: Add extra time for complex equipment
8. **Custom buffers**: Allow custom buffer times (not just 30/45/60)

---

## Summary

The shop arrival time calculation now properly accounts for:
- ✅ Job site arrival time (user input)
- ✅ Buffer time (30, 45, or 60 minutes)
- ✅ **Drive time from Step 3** (NEW!)

This ensures operators know exactly when to arrive at the shop to allow enough time for:
- Driving to the job site
- Setting up equipment
- Any delays or unexpected issues
- Arriving ready to work at the scheduled time

**The workflow is now flawless!** 🎯
