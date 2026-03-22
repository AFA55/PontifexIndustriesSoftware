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

import DashboardHeader from './_components/DashboardHeader';
import KPIRow from './_components/KPIRow';
import WidgetWrapper from './_components/WidgetWrapper';
import AddWidgetModal from './_components/AddWidgetModal';
import { WIDGET_REGISTRY, getDefaultLayout } from './_components/WidgetRegistry';
import { TimeRange, WidgetProps } from './_components/types';

import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';

// Dynamically import widget components to avoid SSR issues with Recharts
const RevenueOverviewWidget = dynamic(() => import('./_components/widgets/RevenueOverviewWidget'), { ssr: false });
const JobStatusWidget = dynamic(() => import('./_components/widgets/JobStatusWidget'), { ssr: false });
const SchedulePreviewWidget = dynamic(() => import('./_components/widgets/SchedulePreviewWidget'), { ssr: false });
const ActiveCrewsWidget = dynamic(() => import('./_components/widgets/ActiveCrewsWidget'), { ssr: false });
const FinancialSummaryWidget = dynamic(() => import('./_components/widgets/FinancialSummaryWidget'), { ssr: false });
const TopOperatorsWidget = dynamic(() => import('./_components/widgets/TopOperatorsWidget'), { ssr: false });
const CustomerOverviewWidget = dynamic(() => import('./_components/widgets/CustomerOverviewWidget'), { ssr: false });
const SystemHealthWidget = dynamic(() => import('./_components/widgets/SystemHealthWidget'), { ssr: false });
const RecentActivityWidget = dynamic(() => import('./_components/widgets/RecentActivityWidget'), { ssr: false });
const CompletionRateWidget = dynamic(() => import('./_components/widgets/CompletionRateWidget'), { ssr: false });
const CommissionWidget = dynamic(() => import('./_components/widgets/CommissionWidget'), { ssr: false });
const MyJobsWidget = dynamic(() => import('./_components/widgets/MyJobsWidget'), { ssr: false });
const PipelineWidget = dynamic(() => import('./_components/widgets/PipelineWidget'), { ssr: false });
const InvoiceSummaryWidget = dynamic(() => import('./_components/widgets/InvoiceSummaryWidget'), { ssr: false });

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
};

const ALLOWED_ROLES = ['admin', 'super_admin', 'operations_manager', 'salesman', 'supervisor'];

export default function AnalyticsPage() {
  const router = useRouter();
  const [userRole, setUserRole] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState<TimeRange>('monthly');
  const [editMode, setEditMode] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [layoutItems, setLayoutItems] = useState<Layout>([]);
  const [dashboardData, setDashboardData] = useState<Record<string, any>>({});
  const [isDataLoading, setIsDataLoading] = useState(true);
  const [token, setToken] = useState<string>('');
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refreshIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Container width measurement
  const { width, containerRef, mounted } = useContainerWidth({ initialWidth: 1200 });

  // Auth check
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

  // Fetch layout
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
      // Use default layout
      setLayoutItems(getDefaultLayout(userRole));
    };

    fetchLayout();
  }, [userRole, token]);

  // Fetch stats
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

  // Handle layout change from grid
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

  // Available widgets for add modal
  const activeWidgetIds = useMemo(() => {
    return layoutItems.map((item) => item.i);
  }, [layoutItems]);

  const availableWidgets = useMemo(() => {
    return Object.values(WIDGET_REGISTRY)
      .filter((w) => w.roles.includes(userRole) && !activeWidgetIds.includes(w.id))
      .map((w) => ({ id: w.id, title: w.title, description: w.description, icon: w.icon }));
  }, [userRole, activeWidgetIds]);

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

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin w-12 h-12 border-4 border-purple-600 border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-gray-600 font-medium">Loading analytics...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
      {/* Animated Background Elements */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-gradient-to-br from-blue-400 to-indigo-500 rounded-full opacity-10 blur-3xl animate-pulse"></div>
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-gradient-to-br from-purple-400 to-pink-500 rounded-full opacity-10 blur-3xl animate-pulse"></div>
      </div>

      <DashboardHeader
        timeRange={timeRange}
        onTimeRangeChange={setTimeRange}
        editMode={editMode}
        onToggleEdit={() => setEditMode((prev) => !prev)}
        onRefresh={fetchStats}
        onAddWidget={editMode ? () => setShowAddModal(true) : undefined}
      />

      <div className="container mx-auto px-4 py-8 max-w-7xl space-y-6 relative">
        {/* KPI Row */}
        <KPIRow
          data={dashboardData.kpi ?? null}
          isLoading={isDataLoading}
        />

        {/* Widget Grid */}
        <div ref={containerRef}>
          {mounted && (
            <ResponsiveGridLayout
              width={width}
              layouts={{ lg: layoutItems }}
              breakpoints={{ lg: 1200, md: 996, sm: 768, xs: 480 }}
              cols={{ lg: 12, md: 8, sm: 4, xs: 2 }}
              rowHeight={100}
              margin={[16, 16]}
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

        {/* Edit mode hint */}
        {editMode && (
          <div className="text-center py-4">
            <p className="text-sm text-gray-500">
              Drag widgets to rearrange. Resize by pulling edges. Click <strong>Done</strong> when finished.
            </p>
          </div>
        )}
      </div>

      <AddWidgetModal
        open={showAddModal}
        onClose={() => setShowAddModal(false)}
        availableWidgets={availableWidgets}
        onAdd={handleAddWidget}
      />
    </div>
  );
}
