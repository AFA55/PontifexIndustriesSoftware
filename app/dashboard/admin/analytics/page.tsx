'use client';

import AnalyticsDashboardContent from './_components/AnalyticsDashboardContent';
import { ModuleGuard } from '@/components/ModuleGuard';

export default function AnalyticsPage() {
  return (
    <ModuleGuard moduleKey="analytics">
      <AnalyticsDashboardContent embedded={false} />
    </ModuleGuard>
  );
}
