# Job Orders Audit Trail System

## Overview
This system automatically tracks all changes made to job orders for documentation, compliance, and audit purposes.

## What Gets Tracked

Every time a job order is updated, the system records:
- ✅ **What changed**: Old value → New value for each field
- ✅ **Who changed it**: User name and role (admin/operator)
- ✅ **When it changed**: Exact timestamp
- ✅ **Complete snapshot**: Full job order state after the change

### Tracked Fields:
- Arrival time (job site)
- Shop arrival time
- Location name
- Full address
- Customer name
- Foreman/Contact name
- Foreman phone
- Equipment needed
- Job description

## Setup Instructions

### 1. Create the Audit History Table

Run this SQL in your Supabase SQL Editor:

```bash
# Open the file:
CREATE_JOB_AUDIT_HISTORY.sql
```

This creates:
- `job_orders_history` table to store all changes
- `job_orders_history_readable` view for human-readable summaries
- Proper indexes for fast queries
- Row-level security policies

### 2. The System is Already Active!

The API has been updated to automatically log changes. No additional code needed!

## How It Works

### Automatic Tracking

When you edit a job on the Schedule Board:

1. **Before Update**: System fetches current job data
2. **Compare**: Compares old vs new values for each field
3. **Log Changes**: Records only fields that actually changed
4. **Store Snapshot**: Saves complete job state

Example log entry:
```json
{
  "job_number": "JOB-2025-8039",
  "changed_by_name": "John Smith",
  "changed_by_role": "admin",
  "change_type": "updated",
  "changed_at": "2025-12-28T10:30:00Z",
  "changes": {
    "shop_arrival_time": {
      "old": "06:00:00",
      "new": "06:15:00"
    },
    "arrival_time": {
      "old": "07:00",
      "new": "07:30"
    }
  }
}
```

## Viewing Change History

### Via API

Fetch history for a specific job:

```typescript
GET /api/job-orders/[jobId]/history
Authorization: Bearer <token>

Response:
{
  "success": true,
  "jobOrderId": "...",
  "historyCount": 5,
  "history": [
    {
      "timestamp": "2025-12-28T10:30:00Z",
      "changedBy": "John Smith",
      "role": "admin",
      "changeType": "updated",
      "changeSummary": [
        "Shop Arrival Time: \"06:00:00\" → \"06:15:00\"",
        "Arrival Time: \"07:00\" → \"07:30\""
      ]
    }
  ]
}
```

### Via SQL (Direct Database Query)

**View all changes for a specific job:**
```sql
SELECT * FROM job_orders_history
WHERE job_order_id = 'your-job-id'
ORDER BY changed_at DESC;
```

**View readable summary:**
```sql
SELECT
  job_number,
  changed_at,
  changed_by_name,
  change_summary
FROM job_orders_history_readable
WHERE job_order_id = 'your-job-id'
ORDER BY changed_at DESC;
```

**View all changes made by a specific user:**
```sql
SELECT * FROM job_orders_history
WHERE changed_by_name = 'John Smith'
ORDER BY changed_at DESC;
```

**View all changes in the last 24 hours:**
```sql
SELECT * FROM job_orders_history
WHERE changed_at > NOW() - INTERVAL '24 hours'
ORDER BY changed_at DESC;
```

## Security & Access

- **Admins**: Can view all history for all jobs
- **Operators**: Can only view history for jobs assigned to them
- **Data Retention**: History is kept indefinitely
- **Cascade Delete**: If a job is deleted, its history is also deleted

## Benefits

1. **Compliance**: Complete audit trail for regulatory requirements
2. **Accountability**: Know exactly who changed what and when
3. **Troubleshooting**: Debug issues by reviewing change history
4. **Documentation**: Automatic record-keeping for all modifications
5. **Dispute Resolution**: Evidence for customer or internal disputes

## Future Enhancements

Possible additions:
- UI component to view history in the dashboard
- Export history to PDF/Excel
- Email notifications for critical changes
- Undo/Revert functionality
- Change approval workflow
- More detailed field tracking (status changes, assignments, etc.)

## Example Use Cases

### 1. Customer Dispute
Customer claims job was scheduled for 8:00 AM, but you show 7:00 AM in system.
- Check history to see if time was changed and by whom
- Prove original scheduled time with timestamp evidence

### 2. Quality Control
Review all changes made to a job to ensure proper procedures were followed.

### 3. Training
Identify patterns in operator mistakes by reviewing their change history.

### 4. Compliance Audit
Generate reports showing all modifications for regulatory compliance.

## Testing the System

1. **Run the SQL migration** (`CREATE_JOB_AUDIT_HISTORY.sql`)
2. **Edit a job** on the Schedule Board
3. **Check the history** using SQL:
   ```sql
   SELECT * FROM job_orders_history ORDER BY changed_at DESC LIMIT 5;
   ```
4. You should see a new entry with your changes!

---

**Status**: ✅ Fully Implemented and Active

All job order edits are now automatically tracked!
