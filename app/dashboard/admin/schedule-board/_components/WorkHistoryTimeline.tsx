'use client';

import { useState, useEffect } from 'react';
import { Clock, FileText, Loader2, CalendarDays, Wrench, MessageSquare } from 'lucide-react';

interface DayLog {
  id: string;
  day_number: number;
  log_date: string;
  work_performed: any;
  hours_worked: number | null;
  route_started_at: string | null;
  work_started_at: string | null;
  work_completed_at: string | null;
  done_for_day_at: string | null;
  notes: string | null;
  operator_signature: string | null;
  customer_signature: string | null;
}

interface WorkItem {
  id: string;
  description: string;
  quantity: number | null;
  unit: string | null;
  created_at: string;
}

interface WorkHistoryTimelineProps {
  jobOrderId: string;
}

function formatTime(iso: string | null): string {
  if (!iso) return '--';
  try {
    return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  } catch {
    return '--';
  }
}

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

export default function WorkHistoryTimeline({ jobOrderId }: WorkHistoryTimelineProps) {
  const [logs, setLogs] = useState<DayLog[]>([]);
  const [workItems, setWorkItems] = useState<WorkItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function fetchData() {
      setLoading(true);
      try {
        const { supabase } = await import('@/lib/supabase');
        const { data: session } = await supabase.auth.getSession();
        const token = session.session?.access_token || '';

        const res = await fetch(`/api/job-orders/${jobOrderId}/work-history`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (res.ok && !cancelled) {
          const json = await res.json();
          if (json.success) {
            setLogs(json.data.logs || []);
            setWorkItems(json.data.work_items || []);
          }
        }
      } catch (err) {
        console.error('Failed to fetch work history:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchData();
    return () => { cancelled = true; };
  }, [jobOrderId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-5 h-5 animate-spin text-purple-500" />
        <span className="ml-2 text-sm text-gray-500">Loading work history...</span>
      </div>
    );
  }

  if (logs.length === 0 && workItems.length === 0) {
    return (
      <div className="text-center py-8">
        <CalendarDays className="w-8 h-8 text-gray-300 mx-auto mb-2" />
        <p className="text-sm text-gray-500 font-medium">No work history recorded yet</p>
        <p className="text-xs text-gray-400 mt-1">History will appear once operator starts work</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Day-by-day timeline */}
      {logs.map((log, idx) => {
        const workPerformed = log.work_performed;
        const workList: { description: string; quantity?: number; unit?: string }[] = [];

        if (Array.isArray(workPerformed)) {
          workPerformed.forEach((item: any) => {
            if (typeof item === 'string') {
              workList.push({ description: item });
            } else if (item && typeof item === 'object') {
              workList.push({
                description: item.description || item.task || item.item || JSON.stringify(item),
                quantity: item.quantity,
                unit: item.unit,
              });
            }
          });
        } else if (workPerformed && typeof workPerformed === 'object') {
          Object.entries(workPerformed).forEach(([key, val]) => {
            workList.push({ description: `${key}: ${val}` });
          });
        }

        return (
          <div key={log.id} className="relative">
            {/* Timeline connector */}
            {idx < logs.length - 1 && (
              <div className="absolute left-5 top-12 bottom-0 w-0.5 bg-gray-200" />
            )}

            <div className="flex gap-3">
              {/* Day marker */}
              <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center">
                <span className="text-sm font-bold text-purple-700">{log.day_number}</span>
              </div>

              {/* Day content */}
              <div className="flex-1 bg-gray-50 rounded-xl border border-gray-200 p-3">
                {/* Header */}
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-gray-900">
                      Day {log.day_number}
                    </span>
                    <span className="text-xs text-gray-500">
                      {log.log_date ? formatDate(log.log_date) : '--'}
                    </span>
                  </div>
                  {log.hours_worked && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full text-xs font-bold">
                      <Clock className="w-3 h-3" />
                      {log.hours_worked}h
                    </span>
                  )}
                </div>

                {/* Timestamps */}
                <div className="flex flex-wrap gap-2 mb-2">
                  {log.route_started_at && (
                    <span className="text-[10px] px-2 py-0.5 bg-blue-50 rounded text-blue-600 font-medium">
                      Route: {formatTime(log.route_started_at)}
                    </span>
                  )}
                  {log.work_started_at && (
                    <span className="text-[10px] px-2 py-0.5 bg-orange-50 rounded text-orange-600 font-medium">
                      Start: {formatTime(log.work_started_at)}
                    </span>
                  )}
                  {log.work_completed_at && (
                    <span className="text-[10px] px-2 py-0.5 bg-green-50 rounded text-green-600 font-medium">
                      Done: {formatTime(log.work_completed_at)}
                    </span>
                  )}
                  {log.done_for_day_at && !log.work_completed_at && (
                    <span className="text-[10px] px-2 py-0.5 bg-emerald-50 rounded text-emerald-600 font-medium">
                      Done for Day: {formatTime(log.done_for_day_at)}
                    </span>
                  )}
                </div>

                {/* Work performed */}
                {workList.length > 0 && (
                  <div className="mb-2">
                    <div className="text-[10px] font-bold text-gray-400 uppercase mb-1 flex items-center gap-1">
                      <Wrench className="w-3 h-3" /> Work Performed
                    </div>
                    <ul className="space-y-0.5 pl-4">
                      {workList.map((item, i) => (
                        <li key={i} className="text-xs text-gray-700 list-disc">
                          {item.description}
                          {item.quantity && item.unit && (
                            <span className="text-gray-400 ml-1">({item.quantity} {item.unit})</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Notes */}
                {log.notes && (
                  <div className="flex items-start gap-1.5 mt-2 px-2 py-1.5 bg-white rounded-lg border border-gray-100">
                    <MessageSquare className="w-3 h-3 text-gray-400 mt-0.5 flex-shrink-0" />
                    <p className="text-xs text-gray-600">{log.notes}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}

      {/* Work items (if any, separate from daily logs) */}
      {workItems.length > 0 && logs.length === 0 && (
        <div className="bg-gray-50 rounded-xl border border-gray-200 p-3">
          <div className="text-[10px] font-bold text-gray-400 uppercase mb-2 flex items-center gap-1">
            <FileText className="w-3 h-3" /> Work Items
          </div>
          <ul className="space-y-1 pl-4">
            {workItems.map((item) => (
              <li key={item.id} className="text-xs text-gray-700 list-disc">
                {item.description}
                {item.quantity && item.unit && (
                  <span className="text-gray-400 ml-1">({item.quantity} {item.unit})</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
