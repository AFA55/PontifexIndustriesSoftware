# Standby Time Display in Work Performed

## Overview
Added standby time tracking display on the work-performed page to show operators the total standby time they logged during the job.

## What It Does

When an operator reaches the work-performed page, they will now see:
- ✅ All standby periods logged for this job
- ✅ Start and end time for each standby period
- ✅ Duration of each standby period (hours and minutes)
- ✅ Reason for standby (if provided)
- ✅ **Total standby time** accumulated for the job

## Implementation

### 1. Added State Variables
**File**: `app/dashboard/job-schedule/[id]/work-performed/page.tsx`

```typescript
const [standbyLogs, setStandbyLogs] = useState<any[]>([]);
const [totalStandbyMinutes, setTotalStandbyMinutes] = useState(0);
```

### 2. Fetch Standby Logs on Page Load
Added useEffect to fetch standby logs when the page loads:

```typescript
useEffect(() => {
  const fetchStandbyLogs = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const response = await fetch(`/api/standby?jobId=${params.id}`, {
        headers: {
          'Authorization': `Bearer ${session.access_token}`
        }
      });

      if (response.ok) {
        const result = await response.json();
        const logs = result.data || [];
        setStandbyLogs(logs);

        // Calculate total standby time
        const totalMinutes = logs.reduce((sum: number, log: any) => {
          if (log.ended_at) {
            const start = new Date(log.started_at).getTime();
            const end = new Date(log.ended_at).getTime();
            const minutes = Math.round((end - start) / 60000);
            return sum + minutes;
          }
          return sum;
        }, 0);
        setTotalStandbyMinutes(totalMinutes);
      }
    } catch (error) {
      console.error('Error fetching standby logs:', error);
    }
  };

  fetchStandbyLogs();
}, [params.id]);
```

### 3. Display Standby Time UI
Added a yellow-themed section showing standby time details above the selected work items:

```tsx
{standbyLogs.length > 0 && (
  <div className="mb-6 bg-yellow-50 border-2 border-yellow-300 rounded-xl p-4">
    {/* Clock icon */}
    {/* Individual standby log entries with start/end times and duration */}
    {/* Total standby time summary */}
  </div>
)}
```

## UI Features

### Visual Design
- **Yellow theme** to match standby warning colors used throughout the app
- **Clock icon** ⏱️ for quick visual identification
- **Card layout** for each standby period
- **Bold total** at the bottom for easy reference

### Information Displayed

For each standby period:
- **Start time**: "Jan 3, 2:30 PM"
- **End time**: "→ 3:45 PM"
- **Duration**: "1h 15m" (displayed prominently on the right)
- **Reason**: If operator provided a reason when starting standby

Total section:
- **Total Standby Time**: Large, bold display showing cumulative hours and minutes

### Example Display

```
⏱️ Standby Time Recorded

┌─────────────────────────────────────────┐
│ Jan 3, 2:30 PM → 3:45 PM     1h 15m     │
│ Reason: Waiting for contractor          │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│ Jan 3, 5:00 PM → 5:20 PM        20m     │
│ Reason: Equipment not ready             │
└─────────────────────────────────────────┘

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Total Standby Time:              1h 35m
```

## User Benefits

✅ **Transparency**: Operators can verify standby time before submitting
✅ **Accuracy**: See all standby periods logged during the job
✅ **Documentation**: Clear record of when and why standby occurred
✅ **Review**: Opportunity to catch any missing or incorrect standby entries before finalizing

## Technical Notes

### Time Calculations
- Duration calculated using JavaScript `Date` objects
- Rounded to nearest minute for clarity
- Displayed in "Xh Ym" format (hours and minutes)
- Hours only shown if > 0

### API Endpoint
Uses existing `/api/standby?jobId={id}` endpoint with GET request to fetch all standby logs for the job.

### Conditional Display
The standby time section only appears if:
```typescript
standbyLogs.length > 0
```

If no standby time was logged, the section is hidden entirely.

## Future Enhancements

Consider adding:
1. **Edit capability**: Allow operators to adjust standby times if they forgot to start/stop
2. **Add standby**: Quick button to add a missed standby period
3. **Delete standby**: Remove incorrectly logged standby periods
4. **Export**: Download standby log as CSV or PDF for records
5. **Billing indicator**: Show if standby time is billable to client

## Files Modified

1. `app/dashboard/job-schedule/[id]/work-performed/page.tsx`
   - Added standbyLogs and totalStandbyMinutes state
   - Added useEffect to fetch standby logs
   - Added standby time display UI section

## Testing

Test by:
1. Start a job workflow
2. Use "Start Standby" button on any workflow page
3. Wait a few minutes or adjust time
4. Use "Stop Standby" button
5. Continue to work-performed page
6. Verify standby time appears in yellow section with correct duration
7. Submit work performed and verify standby time is included in job record

## Related Features

- Standby tracking system (`components/QuickAccessButtons.tsx`)
- Standby API endpoints (`app/api/standby/route.ts`)
- Standby database table and RLS policies
- Job feedback system (also on work-performed page)
