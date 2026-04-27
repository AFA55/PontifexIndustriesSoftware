'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Info, AlertTriangle, CheckCircle2, Send, ArrowLeft, Loader2 } from 'lucide-react';
import { getCurrentUser } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

type TimeOffType = 'vacation' | 'pto' | 'unpaid';

export default function RequestTimeOffPage() {
  const [token, setToken] = useState('');
  const [formData, setFormData] = useState({
    startDate: '',
    endDate: '',
    type: 'vacation' as TimeOffType,
    reason: '',
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [advanceError, setAdvanceError] = useState<{ message: string; earliestDate: string } | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setToken(data.session?.access_token ?? '');
    });
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (name === 'startDate') setAdvanceError(null);
  };

  const calculateDays = () => {
    if (!formData.startDate || !formData.endDate) return 0;
    const start = new Date(formData.startDate);
    const end = new Date(formData.endDate);
    return Math.ceil(Math.abs(end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  };

  const getEarliestEligibleDate = () => {
    const d = new Date();
    d.setDate(d.getDate() + 28);
    return d.toISOString().split('T')[0];
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdvanceError(null);

    if (!formData.startDate || !formData.endDate || !formData.reason.trim()) {
      setError('Please fill in all required fields');
      return;
    }

    if (new Date(formData.endDate) < new Date(formData.startDate)) {
      setError('End date must be after start date');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const user = getCurrentUser();
      if (!user) {
        setError('Not authenticated. Please log in again.');
        return;
      }

      const res = await fetch('/api/operator/time-off', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          startDate: formData.startDate,
          endDate: formData.endDate,
          type: formData.type,
          reason: formData.reason,
        }),
      });

      const json = await res.json();

      if (res.status === 422 && json.error_code === 'advance_notice_required') {
        const earliest = getEarliestEligibleDate();
        setAdvanceError({
          message: json.error ?? 'Request submitted less than 28 days in advance.',
          earliestDate: earliest,
        });
        return;
      }

      if (!res.ok) {
        setError(json.error ?? 'Failed to submit request');
        return;
      }

      setSuccess(true);
      setFormData({ startDate: '', endDate: '', type: 'vacation', reason: '' });
      setTimeout(() => setSuccess(false), 5000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setError(`Failed to submit request: ${msg}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const typeOptions: { value: TimeOffType; label: string; icon: string; description: string; color: string }[] = [
    { value: 'vacation', label: 'Vacation Time', icon: '🏖️', description: 'Use your accrued vacation days', color: 'from-blue-500 to-cyan-600' },
    { value: 'pto', label: 'PTO (Paid Time Off)', icon: '🎯', description: 'Use your paid time off balance', color: 'from-green-500 to-emerald-600' },
    { value: 'unpaid', label: 'Unpaid Time Off', icon: '📅', description: 'Request time off without pay', color: 'from-gray-500 to-gray-600' },
  ];

  const getTodayDate = () => new Date().toISOString().split('T')[0];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-purple-50">
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-purple-300 rounded-full opacity-10 blur-3xl animate-pulse" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-blue-300 rounded-full opacity-10 blur-3xl animate-pulse delay-1000" />
      </div>

      <div className="container mx-auto px-4 sm:px-6 py-8 relative">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <Link
            href="/dashboard"
            className="p-3 bg-white/70 backdrop-blur-xl rounded-xl border border-gray-200 text-gray-700 hover:bg-white transition-all shadow-sm"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-3xl sm:text-4xl font-bold bg-gradient-to-r from-purple-600 via-blue-600 to-indigo-600 bg-clip-text text-transparent">
              Request Time Off
            </h1>
            <p className="text-gray-600 font-medium mt-1">Submit your vacation and PTO requests</p>
          </div>
        </div>

        <div className="max-w-3xl mx-auto space-y-6">
          {/* 4-Week Advance Notice Banner */}
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex gap-3 items-start">
            <Info size={18} className="text-blue-500 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-blue-800">Plan Ahead — 4-Week Advance Notice Required</p>
              <p className="text-sm text-blue-600 mt-0.5">
                To keep our crews covered and customers happy, all time-off requests must be submitted
                at least <strong>4 weeks before your first day off</strong>. Requests submitted less than
                28 days in advance cannot be approved. The earlier you submit, the better your chances
                of approval!
              </p>
            </div>
          </div>

          {/* Advance Notice Error */}
          {advanceError && (
            <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 flex gap-3 items-start">
              <AlertTriangle size={18} className="text-rose-500 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-rose-800">Request Cannot Be Submitted</p>
                <p className="text-sm text-rose-600 mt-0.5">{advanceError.message}</p>
                <p className="text-sm text-rose-700 mt-2 font-medium">
                  Earliest date you can request off:{' '}
                  <strong className="text-rose-800">{formatDate(advanceError.earliestDate)}</strong>
                </p>
              </div>
            </div>
          )}

          {/* Success */}
          {success && (
            <div className="bg-green-50 rounded-2xl border-2 border-green-300 p-6 shadow-lg">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="w-8 h-8 text-green-600 flex-shrink-0" />
                <div>
                  <h3 className="text-gray-800 font-bold text-lg">Request Submitted!</h3>
                  <p className="text-gray-600 font-medium">Your time off request has been sent for approval.</p>
                </div>
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="bg-red-50 rounded-2xl border-2 border-red-200 p-4 flex items-center justify-between gap-3">
              <p className="text-red-800 font-medium text-sm">{error}</p>
              <button onClick={() => setError(null)} className="text-red-500 hover:text-red-700 text-sm font-semibold shrink-0">
                Dismiss
              </button>
            </div>
          )}

          {/* Main Form */}
          <form onSubmit={handleSubmit} className="bg-white/80 backdrop-blur-lg rounded-2xl border border-gray-200 p-8 shadow-lg space-y-8">
            {/* Date range */}
            <div>
              <label className="text-gray-800 font-bold text-lg mb-4 block">
                Select Dates <span className="text-red-600">*</span>
              </label>
              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <label className="text-gray-700 font-semibold text-sm mb-2 block">Start Date</label>
                  <input
                    type="date"
                    name="startDate"
                    value={formData.startDate}
                    onChange={handleInputChange}
                    min={getTodayDate()}
                    required
                    className="w-full px-4 py-4 bg-white border-2 border-gray-300 rounded-xl text-gray-800 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all shadow-sm min-h-[56px]"
                  />
                </div>
                <div>
                  <label className="text-gray-700 font-semibold text-sm mb-2 block">End Date</label>
                  <input
                    type="date"
                    name="endDate"
                    value={formData.endDate}
                    onChange={handleInputChange}
                    min={formData.startDate || getTodayDate()}
                    required
                    className="w-full px-4 py-4 bg-white border-2 border-gray-300 rounded-xl text-gray-800 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all shadow-sm min-h-[56px]"
                  />
                </div>
              </div>
              {formData.startDate && formData.endDate && (
                <div className="mt-4 bg-purple-50 border-2 border-purple-300 rounded-xl p-4 text-center">
                  <p className="text-purple-800 font-bold">
                    Total Days Requested: <span className="text-2xl">{calculateDays()}</span>
                  </p>
                </div>
              )}
            </div>

            {/* Type */}
            <div>
              <label className="text-gray-800 font-bold text-lg mb-4 block">
                Type of Time Off <span className="text-red-600">*</span>
              </label>
              <div className="grid md:grid-cols-3 gap-4">
                {typeOptions.map(({ value, label, icon, description, color }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setFormData((prev) => ({ ...prev, type: value }))}
                    className={`p-6 rounded-xl border-2 transition-all duration-300 text-left shadow-sm ${
                      formData.type === value
                        ? `bg-gradient-to-br ${color} border-transparent text-white shadow-lg`
                        : 'bg-white border-gray-200 hover:bg-gray-50 hover:border-gray-300'
                    }`}
                  >
                    <div className="text-4xl mb-3">{icon}</div>
                    <h4 className={`font-bold mb-2 ${formData.type === value ? 'text-white' : 'text-gray-800'}`}>{label}</h4>
                    <p className={`text-sm ${formData.type === value ? 'text-white/90' : 'text-gray-600'} font-medium`}>{description}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Reason */}
            <div>
              <label className="text-gray-800 font-bold text-lg mb-4 block">
                Reason for Request <span className="text-red-600">*</span>
              </label>
              <textarea
                name="reason"
                value={formData.reason}
                onChange={handleInputChange}
                placeholder="Please provide a brief reason for your time off request..."
                rows={5}
                required
                className="w-full px-4 py-4 bg-white border-2 border-gray-300 rounded-xl text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all resize-none shadow-sm"
              />
              <p className="text-gray-500 text-sm mt-2 font-medium">{formData.reason.length} characters</p>
            </div>

            {/* Submit */}
            <div className="flex gap-4">
              <button
                type="submit"
                disabled={isSubmitting || !formData.startDate || !formData.endDate || !formData.reason.trim()}
                className="flex-1 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 disabled:from-gray-400 disabled:to-gray-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-4 px-8 rounded-xl transition-all duration-300 shadow-lg hover:shadow-xl min-h-[56px] flex items-center justify-center gap-2"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>Submitting...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-5 h-5" />
                    <span>Submit Request</span>
                  </>
                )}
              </button>
              <Link
                href="/dashboard"
                className="px-8 py-4 bg-gray-100 hover:bg-gray-200 border-2 border-gray-300 text-gray-800 font-bold rounded-xl transition-all shadow-md min-h-[56px] flex items-center justify-center"
              >
                Cancel
              </Link>
            </div>
          </form>

          {/* Info card */}
          <div className="bg-blue-50 rounded-2xl border-2 border-blue-300 p-6 shadow-lg">
            <div className="flex items-start gap-3">
              <Info className="w-6 h-6 text-blue-600 flex-shrink-0 mt-1" />
              <div>
                <h4 className="text-gray-800 font-bold mb-2">Time Off Request Guidelines</h4>
                <ul className="text-gray-700 text-sm font-medium space-y-1">
                  <li>• <strong>Submit at least 4 weeks in advance</strong> — this is required, not a suggestion</li>
                  <li>• Choose the appropriate type: Vacation, PTO, or Unpaid</li>
                  <li>• Vacation time uses your accrued vacation balance</li>
                  <li>• PTO (Paid Time Off) uses your general PTO balance</li>
                  <li>• Unpaid time off does not use any accrued benefits</li>
                  <li>• You will receive a notification once your request is reviewed</li>
                  <li>• Contact your supervisor directly for urgent or emergency time off needs</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
