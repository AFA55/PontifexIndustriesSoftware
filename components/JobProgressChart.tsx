'use client';

import { useEffect, useState, useCallback } from 'react';
import { Calendar } from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
  CartesianGrid,
} from 'recharts';
import { supabase } from '@/lib/supabase';
import { buildProgressChartData } from '@/lib/progress-chart-data';
import { useTheme } from '@/contexts/ThemeContext';
import { chartThemeColors } from '@/lib/chart-theme';
import type { ScopeItem } from './JobScopePanel';

/**
 * One row as /api/jobs/[id]/progress actually returns it: a FLAT list of work
 * entries, one per thing the operator logged.
 *
 * This component previously expected `{ date, items: [...] }` — a grouped shape
 * that route has never returned. It survived only because the endpoint read
 * `job_progress_entries`, a table nothing ever wrote, so `entries` was always
 * `[]` and `e.items.map(...)` was never reached. The moment progress started
 * being derived from real work items (Aug 2026), `entries` became non-empty for
 * the first time and this crashed every admin job page with
 * "cannot read properties of undefined (reading 'map')".
 *
 * The grouping now happens here, from the shape the API really sends.
 */
interface ProgressEntry {
  date: string | null;
  work_type: string | null;
  unit: string | null;
  quantity_completed: number | null;
  operator_name?: string | null;
}

interface JobProgressChartProps {
  jobId: string;
  scopeItems: ScopeItem[];
}

// Color palette per work type
const WORK_TYPE_COLORS: Record<string, string> = {
  wall_sawing: '#3b82f6',
  core_drilling: '#8b5cf6',
  wire_sawing: '#06b6d4',
  flat_sawing: '#10b981',
  cleanup: '#f59e0b',
  mobilization: '#6b7280',
  other: '#ec4899',
};

function getWorkTypeColor(workType: string, idx: number): string {
  return (
    WORK_TYPE_COLORS[workType] ||
    ['#3b82f6', '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#6b7280', '#ec4899'][idx % 7]
  );
}

async function getToken() {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token || '';
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function JobProgressChart({ jobId, scopeItems }: JobProgressChartProps) {
  const [entries, setEntries] = useState<ProgressEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Recharts styles its grid/ticks/tooltip inline, so `dark:` classes cannot
  // reach them — the palette is resolved from the theme instead.
  const { theme } = useTheme();
  const chartColors = chartThemeColors(theme);

  const fetchProgress = useCallback(async () => {
    try {
      setError(null);
      const { data: session } = await supabase.auth.getSession();
      const token = session.session?.access_token || '';
      const res = await fetch(`/api/jobs/${jobId}/progress`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to load progress');
      const json = await res.json();
      setEntries(json.data?.entries || []);
    } catch {
      setError('Could not load progress data.');
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => {
    fetchProgress();
  }, [fetchProgress]);

  // Grouping lives in lib/progress-chart-data.ts so it can be unit-tested
  // against the real API payload — see that file for why.
  const { workTypes, rows: chartData } = buildProgressChartData(entries, formatDate);

  const WORK_TYPE_LABELS: Record<string, string> = {
    wall_sawing: 'Wall Sawing',
    core_drilling: 'Core Drilling',
    wire_sawing: 'Wire Sawing',
    flat_sawing: 'Flat Sawing',
    cleanup: 'Cleanup',
    mobilization: 'Mobilization',
    other: 'Other',
  };

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-100 dark:border-white/10 shadow-sm p-6">
      <div className="flex items-center gap-2 mb-5">
        <Calendar className="w-5 h-5 text-blue-600 dark:text-blue-400" />
        <h2 className="text-base font-semibold text-gray-900 dark:text-white">Progress Chart</h2>
      </div>

      {loading && (
        <div className="animate-pulse">
          <div className="h-48 bg-gray-100 dark:bg-white/[0.06] rounded-lg" />
        </div>
      )}

      {!loading && error && (
        <p className="text-sm text-red-600 dark:text-red-400 text-center py-8">{error}</p>
      )}

      {!loading && !error && chartData.length === 0 && (
        <div className="text-center py-10">
          <Calendar className="w-10 h-10 text-gray-200 dark:text-white/15 mx-auto mb-3" />
          <p className="text-sm text-gray-500 dark:text-white/60">No progress logged yet.</p>
        </div>
      )}

      {!loading && !error && chartData.length > 0 && (
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 11, fill: chartColors.tick }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 11, fill: chartColors.tick }}
              axisLine={false}
              tickLine={false}
              width={36}
            />
            <Tooltip
              cursor={{ fill: chartColors.grid }}
              contentStyle={{
                borderRadius: '10px',
                border: `1px solid ${chartColors.tooltipBorder}`,
                background: chartColors.tooltipBg,
                color: chartColors.tooltipText,
                fontSize: 12,
              }}
              labelStyle={{ color: chartColors.tooltipText }}
            />
            <Legend
              wrapperStyle={{ fontSize: 12, paddingTop: 8, color: chartColors.legendText }}
              formatter={(value) => WORK_TYPE_LABELS[value] || value}
            />
            {workTypes.map((wt, idx) => (
              <Bar
                key={wt}
                dataKey={wt}
                name={wt}
                fill={getWorkTypeColor(wt, idx)}
                radius={[3, 3, 0, 0]}
                stackId="progress"
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
