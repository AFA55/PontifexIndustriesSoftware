-- Check what dates the operator's jobs are scheduled for
-- Run this to see the actual scheduled dates

SELECT
  job_number,
  title,
  scheduled_date,
  TO_CHAR(scheduled_date::timestamp, 'Day, Month DD, YYYY') as formatted_date,
  arrival_time,
  shop_arrival_time,
  status
FROM job_orders jo
JOIN auth.users au ON au.id = jo.assigned_to
WHERE au.email = 'quantumlearnr@gmail.com'
ORDER BY scheduled_date;
