import { WidgetConfig } from './types';

// Lazy-loaded widget components — imported dynamically in the page
// This file stores config metadata only (no React imports needed)

export type WidgetCategory = 'financial' | 'operations' | 'communication' | 'personal';

export interface WidgetRegistryEntry {
  id: string;
  title: string;
  description: string;
  icon: string; // lucide icon name for AddWidgetModal
  category: WidgetCategory;
  defaultSize: { w: number; h: number };
  minSize: { w: number; h: number };
  roles: string[];
  dataKey: string;
}

export const WIDGET_REGISTRY: Record<string, WidgetRegistryEntry> = {
  revenue_overview: {
    id: 'revenue_overview',
    title: 'Revenue Overview',
    description: 'KPIs and trend line for total revenue, outstanding, and paid amounts.',
    icon: 'DollarSign',
    category: 'financial',
    defaultSize: { w: 6, h: 4 },
    minSize: { w: 4, h: 3 },
    roles: ['super_admin', 'admin', 'operations_manager'],
    dataKey: 'revenue',
  },
  job_status: {
    id: 'job_status',
    title: 'Job Status',
    description: 'Donut chart of job counts by status.',
    icon: 'PieChart',
    category: 'operations',
    defaultSize: { w: 3, h: 3 },
    minSize: { w: 3, h: 3 },
    roles: ['super_admin', 'admin', 'operations_manager'],
    dataKey: 'job_status',
  },
  schedule_preview: {
    id: 'schedule_preview',
    title: "Today's Schedule",
    description: "Mini table of today's scheduled jobs.",
    icon: 'Calendar',
    category: 'operations',
    defaultSize: { w: 6, h: 3 },
    minSize: { w: 4, h: 3 },
    roles: ['super_admin', 'admin', 'operations_manager', 'salesman'],
    dataKey: 'schedule',
  },
  active_crews: {
    id: 'active_crews',
    title: 'Active Crews',
    description: 'Real-time crew status: clocked in, en route, on site.',
    icon: 'Users',
    category: 'operations',
    defaultSize: { w: 3, h: 3 },
    minSize: { w: 3, h: 3 },
    roles: ['super_admin', 'admin', 'operations_manager'],
    dataKey: 'crews',
  },
  financial_summary: {
    id: 'financial_summary',
    title: 'Financial Summary',
    description: 'Monthly revenue bar chart for the last 6-12 months.',
    icon: 'BarChart3',
    category: 'financial',
    defaultSize: { w: 6, h: 3 },
    minSize: { w: 4, h: 3 },
    roles: ['super_admin', 'admin', 'operations_manager'],
    dataKey: 'financial',
  },
  top_operators: {
    id: 'top_operators',
    title: 'Top Operators',
    description: 'Leaderboard of operators by jobs completed and revenue.',
    icon: 'TrendingUp',
    category: 'operations',
    defaultSize: { w: 6, h: 4 },
    minSize: { w: 4, h: 3 },
    roles: ['super_admin', 'admin', 'operations_manager'],
    dataKey: 'operators',
  },
  customer_overview: {
    id: 'customer_overview',
    title: 'Top Customers',
    description: 'Horizontal bar chart of top customers by revenue.',
    icon: 'Users',
    category: 'financial',
    defaultSize: { w: 6, h: 4 },
    minSize: { w: 4, h: 3 },
    roles: ['super_admin', 'admin', 'operations_manager'],
    dataKey: 'customers',
  },
  system_health: {
    id: 'system_health',
    title: 'System Health',
    description: 'Status of database, auth, and storage services.',
    icon: 'Shield',
    category: 'operations',
    defaultSize: { w: 3, h: 3 },
    minSize: { w: 3, h: 2 },
    roles: ['super_admin'],
    dataKey: 'health',
  },
  recent_activity: {
    id: 'recent_activity',
    title: 'Recent Activity',
    description: 'Timeline of recent system events.',
    icon: 'Activity',
    category: 'communication',
    defaultSize: { w: 3, h: 4 },
    minSize: { w: 3, h: 3 },
    roles: ['super_admin', 'admin', 'operations_manager'],
    dataKey: 'activity',
  },
  completion_rate: {
    id: 'completion_rate',
    title: 'Completion Rate',
    description: 'Donut chart of completed vs cancelled jobs.',
    icon: 'Target',
    category: 'operations',
    defaultSize: { w: 3, h: 3 },
    minSize: { w: 3, h: 3 },
    roles: ['super_admin', 'admin', 'operations_manager'],
    dataKey: 'completion',
  },
  commission: {
    id: 'commission',
    title: 'My Commission',
    description: 'Commission KPIs and monthly trend chart.',
    icon: 'DollarSign',
    category: 'financial',
    defaultSize: { w: 6, h: 4 },
    minSize: { w: 4, h: 3 },
    roles: ['salesman'],
    dataKey: 'commission',
  },
  my_jobs: {
    id: 'my_jobs',
    title: 'My Jobs',
    description: 'Your job statuses, revenue, and recent activity.',
    icon: 'Briefcase',
    category: 'operations',
    defaultSize: { w: 6, h: 4 },
    minSize: { w: 4, h: 3 },
    roles: ['salesman'],
    dataKey: 'my_jobs',
  },
  pipeline: {
    id: 'pipeline',
    title: 'Pipeline',
    description: 'Stacked bar of jobs in each pipeline stage.',
    icon: 'TrendingUp',
    category: 'financial',
    defaultSize: { w: 6, h: 2 },
    minSize: { w: 4, h: 2 },
    roles: ['salesman'],
    dataKey: 'pipeline',
  },
  invoice_summary: {
    id: 'invoice_summary',
    title: 'Invoice Summary',
    description: 'Invoice status breakdown and outstanding amounts.',
    icon: 'Receipt',
    category: 'financial',
    defaultSize: { w: 6, h: 4 },
    minSize: { w: 4, h: 3 },
    roles: ['super_admin', 'admin', 'operations_manager'],
    dataKey: 'invoices',
  },
  quick_notes: {
    id: 'quick_notes',
    title: 'Quick Notes',
    description: 'Personal sticky notes with color coding and pinning.',
    icon: 'StickyNote',
    category: 'personal',
    defaultSize: { w: 3, h: 4 },
    minSize: { w: 2, h: 3 },
    roles: ['super_admin', 'admin', 'operations_manager', 'salesman'],
    dataKey: 'notes',
  },
  my_tasks: {
    id: 'my_tasks',
    title: 'My Tasks',
    description: 'Personal todo checklist with priorities and due dates.',
    icon: 'CheckSquare',
    category: 'personal',
    defaultSize: { w: 3, h: 4 },
    minSize: { w: 2, h: 3 },
    roles: ['super_admin', 'admin', 'operations_manager', 'salesman'],
    dataKey: 'tasks',
  },
  team_messages: {
    id: 'team_messages',
    title: 'Team Messages',
    description: 'Internal team chat with channel filtering.',
    icon: 'MessageSquare',
    category: 'communication',
    defaultSize: { w: 4, h: 5 },
    minSize: { w: 3, h: 4 },
    roles: ['super_admin', 'admin', 'operations_manager', 'salesman'],
    dataKey: 'messages',
  },
  mini_calendar: {
    id: 'mini_calendar',
    title: 'Calendar',
    description: 'Monthly calendar view with job schedule dots.',
    icon: 'CalendarDays',
    category: 'operations',
    defaultSize: { w: 4, h: 4 },
    minSize: { w: 3, h: 3 },
    roles: ['super_admin', 'admin', 'operations_manager', 'salesman'],
    dataKey: 'calendar',
  },
  notifications_feed: {
    id: 'notifications_feed',
    title: 'Notifications',
    description: 'Recent alerts, approvals, and schedule updates.',
    icon: 'Bell',
    category: 'communication',
    defaultSize: { w: 3, h: 4 },
    minSize: { w: 3, h: 3 },
    roles: ['super_admin', 'admin', 'operations_manager', 'salesman'],
    dataKey: 'notifications',
  },
  crew_utilization: {
    id: 'crew_utilization',
    title: 'Crew Utilization',
    description: 'Hours scheduled vs available with utilization percentage.',
    icon: 'Clock',
    category: 'operations',
    defaultSize: { w: 4, h: 3 },
    minSize: { w: 3, h: 3 },
    roles: ['super_admin', 'admin', 'operations_manager'],
    dataKey: 'crew_utilization',
  },
};

type LayoutItem = { i: string; x: number; y: number; w: number; h: number; minW: number; minH: number };

export function getDefaultLayout(role: string): LayoutItem[] {
  let widgetIds: string[];

  if (role === 'super_admin') {
    widgetIds = [
      'revenue_overview', 'job_status', 'active_crews', 'schedule_preview',
      'financial_summary', 'completion_rate', 'top_operators', 'customer_overview',
      'invoice_summary', 'recent_activity', 'system_health',
    ];
  } else if (role === 'admin' || role === 'operations_manager') {
    widgetIds = [
      'revenue_overview', 'job_status', 'active_crews', 'schedule_preview',
      'financial_summary', 'completion_rate', 'top_operators', 'customer_overview',
      'invoice_summary',
    ];
  } else if (role === 'salesman') {
    widgetIds = ['commission', 'my_jobs', 'pipeline', 'schedule_preview'];
  } else {
    widgetIds = ['schedule_preview', 'job_status'];
  }

  const layout: LayoutItem[] = [];
  let currentY = 0;
  let currentX = 0;
  const maxCols = 12;

  for (const id of widgetIds) {
    const entry = WIDGET_REGISTRY[id];
    if (!entry) continue;

    // If widget doesn't fit on current row, move to next row
    if (currentX + entry.defaultSize.w > maxCols) {
      currentX = 0;
      currentY += 4; // default row advance
    }

    layout.push({
      i: id,
      x: currentX,
      y: currentY,
      w: entry.defaultSize.w,
      h: entry.defaultSize.h,
      minW: entry.minSize.w,
      minH: entry.minSize.h,
    });

    currentX += entry.defaultSize.w;
    if (currentX >= maxCols) {
      currentX = 0;
      currentY += entry.defaultSize.h;
    }
  }

  return layout;
}
