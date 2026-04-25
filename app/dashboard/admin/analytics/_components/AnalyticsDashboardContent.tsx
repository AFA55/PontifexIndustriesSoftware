'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import {
  ResponsiveGridLayout,
  useContainerWidth,
  Layout,
} from 'react-grid-layout';
import { supabase } from '@/lib/supabase';

import DashboardHeader from './DashboardHeader';
import KPIRow from './KPIRow';
import WidgetWrapper from './WidgetWrapper';
import DashboardSettingsPanel from './DashboardSettingsPanel';
import { LAYOUT_PRESETS, LayoutPreset } from './LayoutPresets';
import { WIDGET_REGISTRY, getDefaultLayout } from './WidgetRegistry';
import { TimeRange, WidgetProps } from './types';

import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';

// Dynamically import widget components to avoid SSR issues with Recharts
const RevenueOverviewWidget = dynamic(() => import('./widgets/RevenueOverviewWidget'), { ssr: false });
const JobStatusWidget = dynamic(() => import('./widgets/JobStatusWidget'), { ssr: false });
const SchedulePreviewWidget = dynamic(() => import('./widgets/SchedulePreviewWidget'), { ssr: false });
const ActiveCrewsWidget = dynamic(() => import('./widgets/ActiveCrewsWidget'), { ssr: false });
const FinancialSummaryWidget = dynamic(() => import('./widgets/FinancialSummaryWidget'), { ssr: false });
const TopOperatorsWidget = dynamic(() => import('./widgets/TopOperatorsWidget'), { ssr: false });
const CustomerOverviewWidget = dynamic(() => import('./widgets/CustomerOverviewWidget'), { ssr: false });
const SystemHealthWidget = dynamic(() => import('./widgets/SystemHealthWidget'), { ssr: false });
const RecentActivityWidget = dynamic(() => import('./widgets/RecentActivityWidget'), { ssr: false });
const CompletionRateWidget = dynamic(() => import('./widgets/CompletionRateWidget'), { ssr: false });
const CommissionWidget = dynamic(() => import('./widgets/CommissionWidget'), { ssr: false });
const MyJobsWidget = dynamic(() => import('./widgets/MyJobsWidget'), { ssr: false });
const PipelineWidget = dynamic(() => import('./widgets/PipelineWidget'), { ssr: false });
const InvoiceSummaryWidget = dynamic(() => import('./widgets/InvoiceSummaryWidget'), { ssr: false });
const QuickNotesWidget = dynamic(() => import('./widgets/QuickNotesWidget'), { ssr: false });
const MyTasksWidget = dynamic(() => import('./widgets/MyTasksWidget'), { ssr: false });
const TeamMessagesWidget = dynamic(() => import('./widgets/TeamMessagesWidget'), { ssr: false });
const MiniCalendarWidget = dynamic(() => import('./widgets/MiniCalendarWidget'), { ssr: false });
const NotificationsFeedWidget = dynamic(() => import('./widgets/NotificationsFeedWidget'), { ssr: false });
const CrewUtilizationWidget = dynamic(() => import('./widgets/CrewUtilizationWidget'), { ssr: false });

const WIDGET_COMPONENT_MAP: Record<string, React.ComponentType<WidgetProps>> = {
  revenue_overview: RevenueOverviewWidget as unknown as React.ComponentType<WidgetProps>,
  job_status: JobStatusWidget as unknown as React.ComponentType<WidgetProps>,
  schedule_preview: SchedulePreviewWidget as unknown as React.ComponentType<WidgetProps>,
  active_crews: ActiveCrewsWidget as unknown as React.ComponentType<WidgetProps>,
  financial_summary: FinancialSummaryWidget as unknown as React.ComponentType<WidgetProps>,
  top_operators: TopOperatorsWidget as unknown as React.ComponentType<WidgetProps>,
  customer_overview: CustomerOverviewWidget as unknown as React.ComponentType<WidgetProps>,
  system_health: SystemHealthWidget as unknown as React.ComponentType<WidgetProps>,
  recent_activity: RecentActivityWidget as unknown as React.ComponentType<WidgetProps>,
  completion_rate: CompletionRateWidget as unknown as React.ComponentType<WidgetProps>,
  commission: CommissionWidget as unknown as React.ComponentType<WidgetProps>,
  my_jobs: MyJobsWidget as unknown as React.ComponentType<WidgetProps>,
  pipeline: PipelineWidget as unknown as React.ComponentType<WidgetProps>,
  invoice_summary: InvoiceSummaryWidget as unknown as React.ComponentType<WidgetProps>,
  quick_notes: QuickNotesWidget as unknown as React.ComponentType<WidgetProps>,
  my_tasks: MyTasksWidget as unknown as React.ComponentType<WidgetProps>,
  team_messages: TeamMessagesWidget as unknown as React.ComponentType<WidgetProps>,
  mini_calendar: MiniCalendarWidget as unknown as React.ComponentType<WidgetProps>,
  notifications_feed: NotificationsFeedWidget as unknown as React.ComponentType<WidgetProps>,
  crew_utilization: CrewUtilizationWidget as unknown as React.ComponentType<WidgetProps>,
};

const ALLOWED_ROLES = ['admin', 'super_admin', 'operations_manager', 'salesman', 'supervisor'];

export default function AnalyticsDashboardContent({ embedded = false }: { embedded?: boolean }) {
  const router = useRouter();
  const [userRole, setUserRole] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState<TimeRange>('monthly');
  const [editMode, setEditMode] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [layoutItems, setLayoutItems] = useState<Layout>([]);
  const [density, setDensity] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('dashboard-density');
      return saved ? Number(saved) : 72;
    }
    return 72;
  });
  const [dashboardData, setDashboardData] = useState<Record<string, any>>({});
  const [isDataLoading, setIsDataLoading] = useState(true);
  const [token, setToken] = useState<string>('');
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refreshIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const { width, containerRef, mounted } = useContainerWidth({ initialWidth: 1200 });

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push('/login');
        return;
      }

      setToken(session.access_token);

      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', session.user.id)
        .single();

      const role = profile?.role || '';
      if (!ALLOWED_ROLES.includes(role)) {
        router.push('/dashboard');
        return;
      }

      setUserRole(role);
      setLoading(false);
    };

    checkAuth();
  }, [router]);

  useEffect(() => {
    if (!userRole || !token) return;

    const fetchLayout = async () => {
      try {
        const res = await fetch('/api/admin/dashboard-layout', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const json = await res.json();
          if (json.data?.layout?.lg?.length) {
            setLayoutItems(json.data.layout.lg);
            return;
          }
        }
      } catch {
        // Fall through to default
      }
      setLayoutItems(getDefaultLayout(userRole));
    };

    fetchLayout();
  }, [userRole, token]);

  const fetchStats = useCallback(async () => {
    if (!token) return;
    setIsDataLoading(true);
    try {
      const res = await fetch(`/api/admin/dashboard-stats?timeRange=${timeRange}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const json = await res.json();
        setDashboardData(json.data ?? {});
      }
    } catch {
      // Silently fail
    }
    setIsDataLoading(false);
  }, [token, timeRange]);

  useEffect(() => {
    if (!token) return;
    fetchStats();

    refreshIntervalRef.current = setInterval(fetchStats, 60_000);
    return () => {
      if (refreshIntervalRef.current) clearInterval(refreshIntervalRef.current);
    };
  }, [fetchStats, token]);

  const handleLayoutChange = useCallback(
    (currentLayout: Layout) => {
      setLayoutItems(currentLayout);

      if (!editMode || !token) return;

      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = setTimeout(async () => {
        try {
          await fetch('/api/admin/dashboard-layout', {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ layout: { lg: currentLayout } }),
          });
        } catch {
          // Silently fail
        }
      }, 1000);
    },
    [editMode, token]
  );

  const activeWidgetIds = useMemo(() => {
    return layoutItems.map((item) => item.i);
  }, [layoutItems]);


  const handleAddWidget = useCallback(
    (widgetId: string) => {
      const entry = WIDGET_REGISTRY[widgetId];
      if (!entry) return;

      const maxY = layoutItems.reduce((max, item) => Math.max(max, item.y + item.h), 0);
      const newItem = {
        i: widgetId,
        x: 0,
        y: maxY,
        w: entry.defaultSize.w,
        h: entry.defaultSize.h,
        minW: entry.minSize.w,
        minH: entry.minSize.h,
      };

      setLayoutItems((prev) => [...prev, newItem]);
    },
    [layoutItems]
  );

  const handleRemoveWidget = useCallback((widgetId: string) => {
    setLayoutItems((prev) => prev.filter((item) => item.i !== widgetId));
  }, []);

  const handleToggleWidget = useCallback(
    (widgetId: string, active: boolean) => {
      if (active) {
        handleAddWidget(widgetId);
      } else {
        handleRemoveWidget(widgetId);
      }
    },
    [handleAddWidget, handleRemoveWidget]
  );

  const handleApplyPreset = useCallback(
    (preset: LayoutPreset) => {
      const newLayout = preset.getLayout();
      setLayoutItems(newLayout);
      setShowSettings(false);

      // Save layout
      if (token) {
        fetch('/api/admin/dashboard-layout', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ layout: { lg: newLayout } }),
        }).catch(() => {});
      }
    },
    [token]
  );

  const handleDensityChange = useCallback((rowHeight: number) => {
    setDensity(rowHeight);
    localStorage.setItem('dashboard-density', String(rowHeight));
  }, []);

  if (loading) {
    return (
      <div className={`${embedded ? '' : 'min-h-screen bg-gradient-to-b from-slate-50 to-white dark:from-[#0b0618] dark:to-[#0e0720]'} flex items-center justify-center py-20`}>
        <div className="text-center">
          <div className="animate-spin w-12 h-12 border-4 border-purple-600 border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-white/60 font-medium">Loading analytics...</p>
        </div>
      </div>
    );
  }

  return (
    <div className={embedded ? '' : 'min-h-screen bg-gradient-to-b from-slate-50 to-white dark:from-[#0b0618] dark:to-[#0e0720]'}>

      {embedded ? (
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-bold text-gray-800 dark:text-white">Analytics Overview</h2>
            <div className="inline-flex bg-gray-100 dark:bg-white/10 rounded-lg p-0.5">
              {(['daily', 'weekly', 'monthly'] as const).map((range) => (
                <button
                  key={range}
                  onClick={() => setTimeRange(range)}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                    timeRange === range
                      ? 'bg-white text-blue-600 shadow-sm dark:bg-white/20 dark:text-white'
                      : 'text-gray-500 hover:text-gray-700 dark:text-white/50 dark:hover:text-white/80'
                  }`}
                >
                  {range.charAt(0).toUpperCase() + range.slice(1)}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={fetchStats}
              className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-all dark:text-white/50 dark:hover:text-white/80 dark:hover:bg-white/10"
              title="Refresh data"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
            <button
              onClick={() => setEditMode((prev) => !prev)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                editMode
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-white/5 dark:text-white/60 dark:hover:bg-white/10'
              }`}
            >
              {editMode ? 'Done' : 'Customize'}
            </button>
            <button
              onClick={() => setShowSettings(true)}
              className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-all dark:text-white/50 dark:hover:text-white/80 dark:hover:bg-white/10"
              title="Dashboard settings"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>
          </div>
        </div>
      ) : (
        <DashboardHeader
          timeRange={timeRange}
          onTimeRangeChange={setTimeRange}
          editMode={editMode}
          onToggleEdit={() => setEditMode((prev) => !prev)}
          onRefresh={fetchStats}
          onOpenSettings={() => setShowSettings(true)}
        />
      )}

      <div className={`${embedded ? '' : 'container mx-auto px-4 py-4'} max-w-7xl space-y-3 relative`}>
        <KPIRow
          data={dashboardData.kpi ?? null}
          isLoading={isDataLoading}
        />

        <div ref={containerRef}>
          {mounted && (
            <ResponsiveGridLayout
              width={width}
              layouts={{ lg: layoutItems }}
              breakpoints={{ lg: 1200, md: 996, sm: 768, xs: 480 }}
              cols={{ lg: 12, md: 8, sm: 4, xs: 2 }}
              rowHeight={density}
              margin={[12, 12]}
              dragConfig={{
                enabled: editMode,
                handle: '.drag-handle',
              }}
              resizeConfig={{
                enabled: editMode,
              }}
              onLayoutChange={handleLayoutChange}
            >
              {layoutItems.map((item) => {
                const widgetConfig = WIDGET_REGISTRY[item.i];
                const WidgetComponent = WIDGET_COMPONENT_MAP[item.i];

                if (!widgetConfig || !WidgetComponent) return <div key={item.i} />;

                return (
                  <div key={item.i}>
                    <WidgetWrapper
                      title={widgetConfig.title}
                      editMode={editMode}
                      onRemove={() => handleRemoveWidget(item.i)}
                    >
                      <WidgetComponent
                        data={dashboardData[widgetConfig.dataKey] ?? {}}
                        timeRange={timeRange}
                        isLoading={isDataLoading}
                      />
                    </WidgetWrapper>
                  </div>
                );
              })}
            </ResponsiveGridLayout>
          )}
        </div>

        {editMode && (
          <div className="text-center py-4">
            <p className="text-sm text-gray-500 dark:text-white/40">
              Drag widgets to rearrange. Resize by pulling edges. Click <strong className="dark:text-white/70">Done</strong> when finished.
            </p>
          </div>
        )}
      </div>

      <DashboardSettingsPanel
        open={showSettings}
        onClose={() => setShowSettings(false)}
        activeWidgetIds={activeWidgetIds}
        userRole={userRole}
        onToggleWidget={handleToggleWidget}
        onApplyPreset={handleApplyPreset}
        density={density}
        onDensityChange={handleDensityChange}
      />
    </div>
  );
}
