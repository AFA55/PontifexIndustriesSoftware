# Standby Time Tracking & Auto-Fill Implementation

## Overview
Implemented standby time tracking and employee auto-fill functionality for the operator workflow, specifically for the silica exposure control plan page.

## Features Implemented

### ✅ 1. Standby Time Tracking (QuickAccessButtons Component)

**Location:** `components/QuickAccessButtons.tsx`

**New Functionality:**
- Added "Start Standby" / "End Standby" button next to View Location and Contact buttons
- Standby time tracking with start/end timestamps
- Reason field required when starting standby
- Visual warning banner when on standby (animated, pulsing yellow)
- Blocks "Contact On Site" button while on standby
- Automatic notification reminder to end standby before continuing work

**Key Features:**
1. **Start Standby:**
   - Requires reason text (e.g., "Contractor not ready", "Waiting for equipment")
   - Logs start time to `standby_logs` table
   - Shows persistent warning banner
   - Prevents workflow progression

2. **End Standby:**
   - Quick access from warning banner or standby button
   - Logs end time to complete the standby record
   - Calculates total standby duration
   - Removes warning banner

3. **Visual Indicators:**
   - **Warning Banner:** Animated yellow pulse when on standby
   - **Button States:**
     - Orange "Start Standby" when not on standby
     - Yellow "End Standby" when on standby
     - Disabled/grayed "Contact On Site" during standby
   - **Modal UI:** Different colors for start (orange) vs end (yellow) states

4. **Workflow Blocking:**
   - Component passes `onStandbyChange` callback to parent
   - Parent pages can block form submission/navigation while on standby
   - User must end standby before proceeding

**API Integration:**
```typescript
POST /api/standby
{
  jobId: string,
  action: 'start' | 'end',
  reason?: string,        // Required for 'start'
  standbyLogId?: string   // Required for 'end'
}
```

**Database:**
- Uses existing `standby_logs` table
- Fields: `id`, `job_order_id`, `operator_id`, `start_time`, `end_time`, `reason`

---

### 🔄 2. Employee Auto-Fill (Pending - Silica Exposure Page)

**Next Steps for Silica Exposure Page:**

1. **Auto-fill Employee Name:**
   - Fetch job order data including `assigned_to` field
   - Query `profiles` table to get operator full name
   - Auto-populate `employeeName` field

2. **Auto-fill Employee Phone:**
   - Already partially implemented (fetches from current user's profile)
   - Should fetch from assigned operator's profile instead

3. **Remove Hardcoded Names:**
   - Remove the hardcoded `jobDetails` object (lines 44-56)
   - Remove hardcoded technician/foreman initialization
   - Fetch all data dynamically from job order

**Implementation Plan:**
```typescript
// In silica-exposure/page.tsx

// Fetch job order with assigned operator
useEffect(() => {
  const fetchJobAndOperator = async () => {
    // 1. Get job order
    const { data: { session } } = await supabase.auth.getSession();
    const response = await fetch(`/api/job-orders?id=${jobId}`, {
      headers: { 'Authorization': `Bearer ${session.access_token}` }
    });
    const jobData = await response.json();

    // 2. Get assigned operator profile
    if (jobData.data[0].assigned_to) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name, phone_number')
        .eq('id', jobData.data[0].assigned_to)
        .single();

      // 3. Auto-fill form
      setFormData(prev => ({
        ...prev,
        employeeName: profile.full_name || '',
        employeePhone: profile.phone_number || '',
        jobNumber: jobData.data[0].job_number || '',
        jobLocation: jobData.data[0].address || ''
      }));
    }
  };

  fetchJobAndOperator();
}, [jobId]);
```

---

## Usage in Silica Exposure Page

**Modified QuickAccessButtons Usage:**
```typescript
// In silica-exposure/page.tsx
const [isOnStandby, setIsOnStandby] = useState(false);

// In JSX:
<QuickAccessButtons
  jobId={jobId}
  onStandbyChange={(standbyStatus) => setIsOnStandby(standbyStatus)}
/>

// Block form submission while on standby:
const handleSubmit = () => {
  if (isOnStandby) {
    alert('Please end standby time before submitting the silica exposure plan');
    return;
  }

  // Continue with submission...
};
```

---

## Visual Design

### Standby Warning Banner (Active Standby)
```
┌─────────────────────────────────────────────────────────────┐
│ ⚠️  You are on standby time                                 │
│     End standby before proceeding with your work            │
│                                          [End Standby]      │
└─────────────────────────────────────────────────────────────┘
```
- Yellow background (`bg-yellow-50`)
- Yellow border (`border-yellow-400`)
- Animated pulse effect
- Prominent "End Standby" button

### Quick Access Buttons

**Normal State:**
```
┌─────────────┐  ┌─────────────┐  ┌─────────────┐
│ 📍 View     │  │ 📞 Contact  │  │ ⏰ Start    │
│ Location    │  │ On Site     │  │ Standby     │
└─────────────┘  └─────────────┘  └─────────────┘
  (Blue)           (Green)           (Orange)
```

**During Standby:**
```
┌─────────────┐  ┌─────────────┐  ┌─────────────┐
│ 📍 View     │  │ 📞 Contact  │  │ ⏰ End      │
│ Location    │  │ On Site     │  │ Standby     │
└─────────────┘  └─────────────┘  └─────────────┘
  (Blue)           (Grayed)          (Yellow)
```

### Start Standby Modal
```
┌─────────────────────────────────────────────────┐
│  ⏰ Start Standby Time                          │
│     Track time when contractor is not ready     │
├─────────────────────────────────────────────────┤
│                                                 │
│  Reason for Standby *                           │
│  ┌─────────────────────────────────────────┐   │
│  │ Contractor not ready...                 │   │
│  │                                         │   │
│  └─────────────────────────────────────────┘   │
│                                                 │
│  ⚠️ Remember: You cannot proceed with workflow │
│  steps while on standby time.                   │
│                                                 │
│  [Start Standby Time]         [Cancel]         │
└─────────────────────────────────────────────────┘
```

### End Standby Modal
```
┌─────────────────────────────────────────────────┐
│  ⏰ End Standby Time                            │
│     End standby to continue working             │
├─────────────────────────────────────────────────┤
│                                                 │
│  Currently on standby                           │
│  Started: 2/1/2026, 3:26 PM                    │
│                                                 │
│  Click "End Standby" to finish tracking        │
│  standby time and return to work.              │
│                                                 │
│  [End Standby Time]           [Cancel]         │
└─────────────────────────────────────────────────┘
```

---

## Benefits

### For Operations:
- ✅ Track exactly when operators are delayed waiting for contractors
- ✅ Distinguish productive time from waiting time
- ✅ Data for billing/accountability with contractors
- ✅ Total standby time can be added to work performed reports

### For Operators:
- ✅ Simple one-click to start/end standby
- ✅ Clear visual indication when on standby
- ✅ Can't accidentally proceed without ending standby
- ✅ Automatic reminder to end standby

### For Billing:
- ✅ Standby time tracked separately from work time
- ✅ Can bill contractors for delays
- ✅ Historical data on contractor reliability

---

## Testing Checklist

### Standby Functionality
- [ ] Open silica exposure page
- [ ] Verify 3 buttons visible: View Location, Contact On Site, Start Standby
- [ ] Click "Start Standby"
- [ ] Modal opens with reason field
- [ ] Try clicking "Start Standby Time" without entering reason
- [ ] Should show alert "Please enter a reason for standby time"
- [ ] Enter reason: "Contractor not ready"
- [ ] Click "Start Standby Time"
- [ ] Should see yellow warning banner appear
- [ ] Button should change to "End Standby"
- [ ] "Contact On Site" button should be grayed out
- [ ] Try clicking "Contact On Site" → Should open standby modal instead
- [ ] Click "End Standby" in warning banner
- [ ] Warning banner should disappear
- [ ] Buttons should return to normal state

### Employee Auto-Fill (After Implementation)
- [ ] Open silica exposure page for assigned job
- [ ] Employee name should be pre-filled from job assignment
- [ ] Employee phone should be pre-filled from operator profile
- [ ] Job number and location should be pre-filled
- [ ] No hardcoded data should be visible
- [ ] All fields should match actual job order data

---

## Files Modified

### ✅ Completed
1. `components/QuickAccessButtons.tsx`
   - Added standby state management
   - Added standby modal UI
   - Added warning banner
   - Added button state changes
   - Added API integration for start/end standby

### 🔄 Pending
2. `app/dashboard/job-schedule/[id]/silica-exposure/page.tsx`
   - Need to add `onStandbyChange` handler
   - Need to block form submission while on standby
   - Need to remove hardcoded `jobDetails`
   - Need to fetch job order and operator data
   - Need to auto-fill employee name and phone

---

## API Requirements

The `/api/standby` endpoint should support:

**Start Standby:**
```typescript
POST /api/standby
{
  "jobId": "uuid",
  "action": "start",
  "reason": "Contractor not ready"
}

Response:
{
  "success": true,
  "data": {
    "id": "standby-log-uuid",
    "job_order_id": "uuid",
    "operator_id": "uuid",
    "start_time": "2026-02-01T15:26:00Z",
    "end_time": null,
    "reason": "Contractor not ready"
  }
}
```

**End Standby:**
```typescript
POST /api/standby
{
  "jobId": "uuid",
  "action": "end",
  "standbyLogId": "standby-log-uuid"
}

Response:
{
  "success": true,
  "data": {
    "id": "standby-log-uuid",
    "job_order_id": "uuid",
    "operator_id": "uuid",
    "start_time": "2026-02-01T15:26:00Z",
    "end_time": "2026-02-01T16:45:00Z",
    "duration_minutes": 79,
    "reason": "Contractor not ready"
  }
}
```

---

## Database Schema

The existing `standby_logs` table has:
```sql
CREATE TABLE standby_logs (
  id UUID PRIMARY KEY,
  job_order_id UUID REFERENCES job_orders(id),
  operator_id UUID REFERENCES profiles(id),
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ,
  reason TEXT,
  client_representative_name TEXT,
  operator_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Queries Needed:**
- Check for active standby: `WHERE job_order_id = ? AND operator_id = ? AND end_time IS NULL`
- Get total standby for job: `SELECT SUM(EXTRACT(EPOCH FROM (end_time - start_time))/60) FROM standby_logs WHERE job_order_id = ?`

---

## Next Steps

1. ✅ **QuickAccessButtons component** - COMPLETE
2. 🔄 **Silica exposure page** - Needs modification to:
   - Use standby callback to block submission
   - Remove hardcoded job data
   - Auto-fill from job order assigned_to
   - Auto-fill phone from operator profile

3. 📊 **Work Performed page** - Future enhancement:
   - Display total standby time in report
   - Format: "Total Standby Time: 1h 19m"
   - Breakdown by reason if multiple standby periods

---

**Status: Standby tracking COMPLETE. Auto-fill pending implementation in silica exposure page.**
