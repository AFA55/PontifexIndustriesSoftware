export interface LayoutPreset {
  id: string;
  name: string;
  description: string;
  icon: string; // lucide icon name
  roles: string[];
  widgets: string[];
  getLayout: () => Array<{ i: string; x: number; y: number; w: number; h: number; minW: number; minH: number }>;
}

export const LAYOUT_PRESETS: LayoutPreset[] = [
  {
    id: 'operations',
    name: 'Operations Manager',
    description: 'Job tracking, crew status, schedule overview',
    icon: 'Briefcase',
    roles: ['super_admin', 'operations_manager', 'admin'],
    widgets: ['revenue_overview', 'job_status', 'active_crews', 'schedule_preview', 'completion_rate', 'recent_activity'],
    getLayout: () => [
      { i: 'revenue_overview', x: 0, y: 0, w: 6, h: 4, minW: 4, minH: 3 },
      { i: 'job_status', x: 6, y: 0, w: 3, h: 3, minW: 3, minH: 3 },
      { i: 'active_crews', x: 9, y: 0, w: 3, h: 3, minW: 3, minH: 3 },
      { i: 'schedule_preview', x: 0, y: 4, w: 6, h: 3, minW: 4, minH: 3 },
      { i: 'completion_rate', x: 6, y: 3, w: 3, h: 3, minW: 3, minH: 3 },
      { i: 'recent_activity', x: 9, y: 3, w: 3, h: 4, minW: 3, minH: 3 },
    ],
  },
  {
    id: 'salesman',
    name: 'Salesman',
    description: 'Commission tracking, pipeline, personal tasks',
    icon: 'DollarSign',
    roles: ['super_admin', 'salesman'],
    widgets: ['commission', 'my_jobs', 'pipeline', 'schedule_preview'],
    getLayout: () => [
      { i: 'commission', x: 0, y: 0, w: 6, h: 4, minW: 4, minH: 3 },
      { i: 'my_jobs', x: 6, y: 0, w: 6, h: 4, minW: 4, minH: 3 },
      { i: 'pipeline', x: 0, y: 4, w: 6, h: 2, minW: 4, minH: 2 },
      { i: 'schedule_preview', x: 6, y: 4, w: 6, h: 3, minW: 4, minH: 3 },
    ],
  },
  {
    id: 'billing',
    name: 'Billing & Finance',
    description: 'Revenue, invoices, customer overview',
    icon: 'Receipt',
    roles: ['super_admin', 'operations_manager', 'admin'],
    widgets: ['revenue_overview', 'financial_summary', 'invoice_summary', 'customer_overview', 'top_operators'],
    getLayout: () => [
      { i: 'revenue_overview', x: 0, y: 0, w: 6, h: 4, minW: 4, minH: 3 },
      { i: 'financial_summary', x: 6, y: 0, w: 6, h: 3, minW: 4, minH: 3 },
      { i: 'invoice_summary', x: 0, y: 4, w: 6, h: 4, minW: 4, minH: 3 },
      { i: 'customer_overview', x: 6, y: 3, w: 6, h: 4, minW: 4, minH: 3 },
      { i: 'top_operators', x: 0, y: 8, w: 6, h: 4, minW: 4, minH: 3 },
    ],
  },
];
