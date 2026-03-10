'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  X, Calendar, MapPin, Wrench, CheckCircle, DollarSign,
  AlertTriangle, XCircle, Loader2, ArrowRight, CalendarDays
} from 'lucide-react';
import { CalendarPicker } from '@/components/ui/CalendarPicker';
import type { PendingJob } from './PendingQueueSidebar';

interface CapacityInfo {
  jobCount: number;
  maxSlots: number;
  warningThreshold: number;
  availableSlots: number;
  isFull: boolean;
  isWarning: boolean;
}

interface CapacitySummary {
  totalDays: number;
  fullDates: string[];
  warningDates: string[];
  hasContinuousAvailability: boolean;
  maxSlots: number;
  warningThreshold: number;
}

interface ApprovalModalProps {
  job: PendingJob;
  onConfirm: (data: { scheduledDate: string }) => void;
  onClose: () => void;
}

export default function ApprovalModal({ job, onConfirm, onClose }: ApprovalModalProps) {
  const [scheduledDate, setScheduledDate] = useState(job.scheduled_date || '');
  const [capacityLoading, setCapacityLoading] = useState(false);
  const [capacityData, setCapacityData] = useState<Record<string, CapacityInfo> | null>(null);
  const [capacitySummary, setCapacitySummary] = useState<CapacitySummary | null>(null);
  const [nextAvailable, setNextAvailable] = useState<{ date: string; jobCount: number; availableSlots: number } | null>(null);
  const [findingNext, setFindingNext] = useState(false);
  const [warningAcknowledged, setWarningAcknowledged] = useState(false);

  const isMultiDay = !!(job.end_date && job.scheduled_date && job.end_date !== job.scheduled_date);
  const endDate = job.end_date || scheduledDate;

  // Calculate number of days
  const dayCount = (() => {
    if (!scheduledDate || !endDate) return 1;
    const start = new Date(scheduledDate + 'T12:00:00');
    const end = new Date(endDate + 'T12:00:00');
    return Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1);
  })();

  // Check if selected date is a weekend
  const isWeekend = (() => {
    if (!scheduledDate) return false;
    const d = new Date(scheduledDate + 'T12:00:00');
    return d.getDay() === 0 || d.getDay() === 6;
  })();

  // ── Fetch capacity when date changes ──
  const checkCapacity = useCallback(async (startDate: string, eDate: string) => {
    if (!startDate) return;
    setCapacityLoading(true);
    setCapacityData(null);
    setCapacitySummary(null);
    setWarningAcknowledged(false);

    try {
      const token = await getToken();
      let url: string;
      if (eDate && eDate !== startDate) {
        url = `/api/admin/schedule-board/capacity?startDate=${startDate}&endDate=${eDate}`;
      } else {
        url = `/api/admin/schedule-board/capacity?date=${startDate}`;
      }

      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        const json = await res.json();
        setCapacityData(json.data);
        if (json.summary) setCapacitySummary(json.summary);
        else {
          // Single date — build summary
          const info = json.data[startDate];
          if (info) {
            setCapacitySummary({
              totalDays: 1,
              fullDates: info.isFull ? [startDate] : [],
              warningDates: info.isWarning && !info.isFull ? [startDate] : [],
              hasContinuousAvailability: !info.isFull,
              maxSlots: info.maxSlots,
              warningThreshold: info.warningThreshold,
            });
          }
        }
      }
    } catch (err) {
      console.error('Capacity check failed:', err);
    } finally {
      setCapacityLoading(false);
    }
  }, []);

  useEffect(() => {
    if (scheduledDate) {
      checkCapacity(scheduledDate, endDate);
    }
  }, [scheduledDate, endDate, checkCapacity]);

  // ── Find Next Available ──
  const handleFindNextAvailable = async () => {
    setFindingNext(true);
    try {
      const token = await getToken();
      const from = scheduledDate || new Date().toISOString().split('T')[0];
      const res = await fetch(`/api/admin/schedule-board/capacity?findNext=true&from=${from}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const json = await res.json();
        if (json.data?.nextAvailableDate) {
          setNextAvailable({
            date: json.data.nextAvailableDate,
            jobCount: json.data.jobCount,
            availableSlots: json.data.availableSlots,
          });
        }
      }
    } catch { /* ignore */ }
    setFindingNext(false);
  };

  // ── Capacity status ──
  const hasFullDates = (capacitySummary?.fullDates?.length ?? 0) > 0;
  const hasWarningDates = (capacitySummary?.warningDates?.length ?? 0) > 0;
  const canApprove = scheduledDate && !hasFullDates && (!hasWarningDates || warningAcknowledged);

  // Format date for display
  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr + 'T12:00:00');
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  };

  // Format currency
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[70]" onClick={onClose} />

      <div className="fixed inset-0 flex items-center justify-center z-[80] p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto animate-in zoom-in-95 duration-200">
          {/* Header */}
          <div className="bg-gradient-to-r from-green-500 to-emerald-600 p-5 rounded-t-2xl text-white">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold flex items-center gap-2">
                  <CheckCircle className="w-5 h-5" />
                  Approve Job
                </h2>
                <p className="text-green-100 text-sm">Review details and place on schedule</p>
              </div>
              <button onClick={onClose} className="p-2 hover:bg-white/20 rounded-xl transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          <div className="p-5 space-y-4">
            {/* ── Job Summary ── */}
            <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-bold text-gray-900 text-lg">{job.customer_name}</h3>
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-purple-100 text-purple-700 mt-1">
                    {job.job_type?.split(',')[0]?.trim()}
                  </span>
                </div>
                {job.estimated_cost && (
                  <div className="text-right">
                    <div className="text-[10px] font-bold text-gray-400 uppercase">Quoted</div>
                    <div className="text-lg font-bold text-green-600 flex items-center gap-1">
                      <DollarSign className="w-4 h-4" />
                      {formatCurrency(job.estimated_cost).replace('$', '')}
                    </div>
                  </div>
                )}
              </div>
              {job.location && (
                <p className="text-xs text-gray-500 flex items-center gap-1 mt-2">
                  <MapPin className="w-3.5 h-3.5" /> {job.location}
                </p>
              )}
              {job.equipment_needed.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {job.equipment_needed.map(eq => (
                    <span key={eq} className="px-2 py-0.5 bg-indigo-50 rounded text-xs text-indigo-600 font-medium">
                      <Wrench className="w-3 h-3 inline mr-0.5" />{eq}
                    </span>
                  ))}
                </div>
              )}
              {job.description && (
                <p className="text-xs text-gray-500 mt-2 italic line-clamp-2">&ldquo;{job.description}&rdquo;</p>
              )}
            </div>

            {/* ── Dates Display ── */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-blue-50 rounded-xl p-3 border border-blue-200">
                <div className="text-[10px] font-bold text-blue-500 uppercase mb-1">Start Date</div>
                <div className="text-sm font-bold text-gray-900">
                  {job.scheduled_date ? formatDate(job.scheduled_date) : 'Not set'}
                </div>
              </div>
              <div className="bg-blue-50 rounded-xl p-3 border border-blue-200">
                <div className="text-[10px] font-bold text-blue-500 uppercase mb-1">End Date</div>
                <div className="text-sm font-bold text-gray-900">
                  {job.end_date ? formatDate(job.end_date) : 'Same day'}
                </div>
                {isMultiDay && (
                  <div className="text-[10px] text-blue-600 font-semibold mt-0.5">{dayCount} day job</div>
                )}
              </div>
            </div>

            {/* Will Call note */}
            {job.is_will_call && (
              <div className="bg-amber-50 rounded-xl p-3 border border-amber-200">
                <p className="text-xs text-amber-700 font-semibold">
                  Will Call — Job will go to the Will Call folder until a slot opens.
                </p>
              </div>
            )}

            {/* ── Schedule Date Picker ── */}
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">
                <Calendar className="w-4 h-4 inline mr-1.5" />
                {job.is_will_call ? 'Tentative Start Date' : 'Confirm Start Date'}
              </label>
              <CalendarPicker
                value={scheduledDate}
                onChange={setScheduledDate}
                minDate={new Date().toISOString().split('T')[0]}
              />
              {isWeekend && (
                <p className="text-xs text-red-600 font-semibold mt-1.5 flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  Weekend date — most jobs don&apos;t allow weekend work
                </p>
              )}
            </div>

            {/* ── Capacity Status ── */}
            {capacityLoading && (
              <div className="flex items-center gap-2 text-gray-500 text-sm py-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                Checking schedule capacity...
              </div>
            )}

            {!capacityLoading && capacitySummary && (
              <div className="space-y-2">
                {/* Full dates — BLOCKED */}
                {hasFullDates && (
                  <div className="bg-red-50 rounded-xl p-4 border-2 border-red-200">
                    <div className="flex items-start gap-2">
                      <XCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-bold text-red-700">Schedule Full</p>
                        <p className="text-xs text-red-600 mt-1">
                          {capacitySummary.fullDates.length === 1
                            ? `${formatDate(capacitySummary.fullDates[0])} has ${capacitySummary.maxSlots}/${capacitySummary.maxSlots} slots filled.`
                            : `${capacitySummary.fullDates.length} dates are full: ${capacitySummary.fullDates.map(formatDate).join(', ')}`
                          }
                        </p>
                        {isMultiDay && !capacitySummary.hasContinuousAvailability && (
                          <p className="text-xs text-red-600 mt-1 font-semibold">
                            This {dayCount}-day job needs continuous availability across all dates.
                          </p>
                        )}
                        <button
                          onClick={handleFindNextAvailable}
                          disabled={findingNext}
                          className="mt-2 px-3 py-1.5 bg-red-100 hover:bg-red-200 text-red-700 rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5"
                        >
                          {findingNext ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CalendarDays className="w-3.5 h-3.5" />}
                          Find Next Available Date
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Warning dates — CAUTION */}
                {hasWarningDates && !hasFullDates && (
                  <div className="bg-amber-50 rounded-xl p-4 border-2 border-amber-200">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <p className="text-sm font-bold text-amber-700">Approaching Capacity</p>
                        <p className="text-xs text-amber-600 mt-1">
                          {capacitySummary.warningDates.map(d => {
                            const info = capacityData?.[d];
                            return `${formatDate(d)}: ${info?.jobCount}/${info?.maxSlots} slots`;
                          }).join(' | ')}
                        </p>
                        <div className="flex items-center gap-3 mt-2">
                          <label className="flex items-center gap-1.5 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={warningAcknowledged}
                              onChange={(e) => setWarningAcknowledged(e.target.checked)}
                              className="w-4 h-4 accent-amber-600 rounded"
                            />
                            <span className="text-xs text-amber-700 font-semibold">
                              Confirm: Schedule despite near capacity
                            </span>
                          </label>
                        </div>
                        <button
                          onClick={handleFindNextAvailable}
                          disabled={findingNext}
                          className="mt-2 px-3 py-1.5 bg-amber-100 hover:bg-amber-200 text-amber-700 rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5"
                        >
                          {findingNext ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CalendarDays className="w-3.5 h-3.5" />}
                          Or: Find Next Available Spot
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* All clear */}
                {!hasFullDates && !hasWarningDates && (
                  <div className="bg-green-50 rounded-xl p-3 border border-green-200">
                    <p className="text-xs text-green-700 font-semibold flex items-center gap-1.5">
                      <CheckCircle className="w-4 h-4" />
                      {isMultiDay
                        ? `All ${dayCount} days have availability — continuous scheduling confirmed`
                        : (() => {
                            const info = capacityData?.[scheduledDate];
                            return `Schedule has capacity: ${info?.jobCount ?? 0}/${info?.maxSlots ?? 10} slots filled (${info?.availableSlots ?? 10} available)`;
                          })()
                      }
                    </p>
                  </div>
                )}

                {/* Next available suggestion */}
                {nextAvailable && (
                  <div className="bg-purple-50 rounded-xl p-3 border border-purple-200">
                    <p className="text-xs text-purple-700 font-semibold">
                      Next available: <strong>{formatDate(nextAvailable.date)}</strong> ({nextAvailable.jobCount} jobs, {nextAvailable.availableSlots} slots open)
                    </p>
                    <button
                      onClick={() => { setScheduledDate(nextAvailable.date); setNextAvailable(null); }}
                      className="mt-1.5 px-3 py-1.5 bg-purple-100 hover:bg-purple-200 text-purple-700 rounded-lg text-xs font-bold transition-colors flex items-center gap-1"
                    >
                      <ArrowRight className="w-3.5 h-3.5" />
                      Use This Date
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* ── Info Note ── */}
            <div className="bg-blue-50 rounded-xl p-3 border border-blue-200">
              <p className="text-xs text-blue-700">
                <strong>Note:</strong> Operators will be assigned 2-3 days before the start date.
              </p>
            </div>

            {/* ── Actions ── */}
            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={onClose}
                className="flex-1 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-bold text-sm transition-all"
              >
                Cancel
              </button>
              <button
                onClick={() => onConfirm({ scheduledDate })}
                disabled={!canApprove || capacityLoading}
                className="flex-1 py-3 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white rounded-xl font-bold text-sm transition-all shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {capacityLoading ? (
                  <span className="flex items-center justify-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" /> Checking...
                  </span>
                ) : (
                  <>&#10003; {job.is_will_call ? 'Approve \u2192 Will Call' : 'Approve & Schedule'}</>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

// Helper — get Supabase token from client
async function getToken(): Promise<string> {
  try {
    const { supabase } = await import('@/lib/supabase');
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token || '';
  } catch {
    return '';
  }
}
