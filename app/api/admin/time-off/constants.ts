// Shared time-off constants. These live OUTSIDE route.ts because Next.js 15
// App Router forbids a route file from exporting anything other than route
// handlers + reserved config (`dynamic`, `maxDuration`, …). Exporting
// VALID_TYPES/CALLOUT_TYPES from the route tripped the generated `.next/types`
// validator (Jul 23).

export const VALID_TYPES = [
  'pto', 'unpaid', 'worked_last_night', 'sick', 'callout',
  'vacation', 'bereavement', 'personal', 'other',
  'unavailable', 'personal_day', 'no_show',
] as const;

// Which types are paid by default
export const PAID_BY_DEFAULT: string[] = ['pto', 'vacation', 'bereavement'];

// Which types count as callouts/attendance incidents
export const CALLOUT_TYPES: string[] = ['sick', 'callout', 'no_show', 'personal_day'];
