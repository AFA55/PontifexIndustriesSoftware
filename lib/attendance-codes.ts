/**
 * Attendance codes — Patriot's paper-tracker set, verbatim (docs/plans/
 * PATRIOT_REPORTS_PLAN.md). The single source of truth shared by the
 * attendance API (validation), the calendar UI (picker + colors), and the
 * annual report (column labels). Tenant-custom codes come later; text column
 * in attendance_events already allows it.
 */
export interface AttendanceCode {
  code: string;
  label: string;
  /** Tailwind-free hex so canvas/print surfaces can use it too. */
  color: string;
}

export const ATTENDANCE_CODES: AttendanceCode[] = [
  { code: 'EA', label: 'Excused Absence / called in sick (Dr.’s note)', color: '#d97706' },
  { code: 'UA', label: 'Unexcused Absence / called in sick (no note)', color: '#dc2626' },
  { code: 'NCNS', label: 'No Call / No Show', color: '#991b1b' },
  { code: 'STO', label: 'Scheduled Time Off (unpaid)', color: '#7c3aed' },
  { code: 'ML', label: 'Medical Leave of Absence', color: '#db2777' },
  { code: 'FL', label: 'Family Leave of Absence', color: '#c026d3' },
  { code: 'S', label: 'Suspension', color: '#b91c1c' },
  { code: 'LE', label: 'Leave Early', color: '#ea580c' },
  { code: 'T', label: 'Tardy', color: '#f59e0b' },
  { code: 'V', label: 'Vacation', color: '#0284c7' },
  { code: 'W', label: 'Weather', color: '#64748b' },
  { code: 'NW', label: 'No Work', color: '#94a3b8' },
  { code: 'H', label: 'Holiday', color: '#16a34a' },
  { code: 'GD', label: 'Guard Duty', color: '#4f46e5' },
  { code: 'WH', label: 'Work From Home', color: '#0891b2' },
];

export const ATTENDANCE_CODE_SET = new Set(ATTENDANCE_CODES.map((c) => c.code));
export const attendanceCodeColor = (code: string) =>
  ATTENDANCE_CODES.find((c) => c.code === code)?.color ?? '#64748b';
