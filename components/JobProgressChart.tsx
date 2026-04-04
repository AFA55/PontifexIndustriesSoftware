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
import type { ScopeItem } from './JobScopePanel';

interface ProgressEntry {
  date: string;
  items: {
    work_type: string;
    quantity: number;
    linear_feet: number;
    cores: number;
  }[];
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

  // Build chart data: one row per date, keys per work type
  const workTypes = [
    ...new Set(
      entries.flatMap((e) => e.items.map((i) => i.work_type))
    ),
  ];

  const chartData = entries.map((entry) => {
    const row: Record<string, string | number> = {
      date: formatDate(entry.date),
    };
    for (const wt of workTypes) {
      const items = entry.items.filter((i) => i.work_type === wt);
      row[wt] = items.reduce((s, i) => s + (i.linear_feet || i.quantity || 0), 0);
    }
    return row;
  });

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
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
      <div className="flex items-center gap-2 mb-5">
        <Calendar className="w-5 h-5 text-blue-600" />
        <h2 className="text-base font-semibold text-gray-900">Daily Progress</h2>
      </div>

      {loading && (
        <div className="animate-pulse">
          <div className="h-48 bg-gray-100 rounded-lg" />
        </div>
      )}

      {!loading && error && (
        <p className="text-sm text-red-600 text-center py-8">{error}</p>
      )}

      {!loading && !error && chartData.length === 0 && (
        <div className="text-center py-10">
          <Calendar className="w-10 h-10 text-gray-200 mx-auto mb-3" />
          <p className="text-sm text-gray-500">No progress logged yet.</p>
        </div>
      )}

      {!loading && !error && chartData.length > 0 && (
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 11, fill: '#94a3b8' }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 11, fill: '#94a3b8' }}
              axisLine={false}
              tickLine={false}
              width={36}
            />
            <Tooltip
              contentStyle={{
                borderRadius: '10px',
                border: '1px solid #e2e8f0',
                fontSize: 12,
              }}
            />
            <Legend
              wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
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
