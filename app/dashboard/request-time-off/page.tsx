'use client';

import { useState } from 'react';
import Link from 'next/link';
import { getCurrentUser } from '@/lib/auth';

type TimeOffType = 'vacation' | 'pto' | 'unpaid';

interface TimeOffRequest {
  id: string;
  startDate: string;
  endDate: string;
  type: TimeOffType;
  reason: string;
  requestedBy: string;
  requestDate: string;
  status: 'pending' | 'approved' | 'denied';
}

export default function RequestTimeOffPage() {
  const user = getCurrentUser();

  const [formData, setFormData] = useState({
    startDate: '',
    endDate: '',
    type: 'vacation' as TimeOffType,
    reason: ''
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAdvanceNoticeWarning, setShowAdvanceNoticeWarning] = useState(false);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));

    // Check if date is within 1 week
    if (name === 'startDate' && value) {
      checkAdvanceNotice(value);
    }
  };

  const checkAdvanceNotice = (startDate: string) => {
    const start = new Date(startDate);
    const today = new Date();
    const oneWeekFromNow = new Date(today);
    oneWeekFromNow.setDate(today.getDate() + 7);

    if (start < oneWeekFromNow) {
      setShowAdvanceNoticeWarning(true);
    } else {
      setShowAdvanceNoticeWarning(false);
    }
  };

  const calculateDays = () => {
    if (!formData.startDate || !formData.endDate) return 0;

    const start = new Date(formData.startDate);
    const end = new Date(formData.endDate);
    const diffTime = Math.abs(end.getTime() - start.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1; // +1 to include both start and end day
    return diffDays;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.startDate || !formData.endDate || !formData.reason.trim()) {
      setError('Please fill in all required fields');
      return;
    }

    // Validate end date is after start date
    if (new Date(formData.endDate) < new Date(formData.startDate)) {
      setError('End date must be after start date');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      // Mock API call
      console.log('Time Off Request:', {
        ...formData,
        requestedBy: user?.name || 'Demo Operator',
        requestDate: new Date().toISOString(),
        days: calculateDays()
      });

      // Simulate API delay
      await new Promise(resolve => setTimeout(resolve, 1500));

      setSuccess(true);

      // Reset form after 3 seconds
      setTimeout(() => {
        setFormData({
          startDate: '',
          endDate: '',
          type: 'vacation',
          reason: ''
        });
        setSuccess(false);
        setShowAdvanceNoticeWarning(false);
      }, 3000);

    } catch (err: any) {
      console.error('Error submitting time off request:', err);
      setError(`Failed to submit request: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const getTypeConfig = (type: TimeOffType) => {
    switch (type) {
      case 'vacation':
        return {
          label: 'Vacation Time',
          icon: '🏖️',
          color: 'from-blue-500 to-cyan-600',
          description: 'Use your accrued vacation days'
        };
      case 'pto':
        return {
          label: 'PTO (Paid Time Off)',
          icon: '🎯',
          color: 'from-green-500 to-emerald-600',
          description: 'Use your paid time off balance'
        };
      case 'unpaid':
        return {
          label: 'Unpaid Time Off',
          icon: '📅',
          color: 'from-gray-500 to-gray-600',
          description: 'Request time off without pay'
        };
    }
  };

  const getTodayDate = () => {
    return new Date().toISOString().split('T')[0];
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-purple-50">
      {/* Animated Background Elements */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-purple-300 rounded-full opacity-10 blur-3xl animate-pulse"></div>
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-blue-300 rounded-full opacity-10 blur-3xl animate-pulse delay-1000"></div>
      </div>

      <div className="container mx-auto px-6 py-8 relative">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center space-x-4">
            <Link
              href="/dashboard"
              className="group p-3 bg-white/70 backdrop-blur-xl rounded-xl border border-gray-200 text-gray-700 hover:bg-white transition-all duration-300 hover:scale-105 shadow-sm"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </Link>
            <div>
              <h1 className="text-4xl font-bold bg-gradient-to-r from-purple-600 via-blue-600 to-indigo-600 bg-clip-text text-transparent">
                Request Time Off
              </h1>
              <p className="text-gray-600 font-medium mt-1">Submit your vacation and PTO requests</p>
            </div>
          </div>
        </div>

        <div className="max-w-3xl mx-auto">
          {/* Success Message */}
          {success && (
            <div className="mb-6 bg-green-50 rounded-2xl border-2 border-green-300 p-6 shadow-lg animate-fade-in">
              <div className="flex items-center space-x-3">
                <div className="w-12 h-12 bg-green-200 rounded-full flex items-center justify-center">
                  <svg className="w-6 h-6 text-green-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-gray-800 font-bold text-lg">Request Submitted Successfully!</h3>
                  <p className="text-gray-600 font-medium">Your time off request has been sent for approval.</p>
                </div>
              </div>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="mb-6 bg-red-50 rounded-2xl border-2 border-red-200 p-6 shadow-lg">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <svg className="w-6 h-6 text-red-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p className="text-red-800 font-medium">{error}</p>
                </div>
                <button
                  onClick={() => setError(null)}
                  className="text-red-600 hover:text-red-700 font-semibold text-sm"
                >
                  Dismiss
                </button>
              </div>
            </div>
          )}

          {/* Advance Notice Warning */}
          {showAdvanceNoticeWarning && (
            <div className="mb-6 bg-yellow-50 rounded-2xl border-2 border-yellow-300 p-6 shadow-lg animate-fade-in">
              <div className="flex items-start space-x-3">
                <svg className="w-6 h-6 text-yellow-600 flex-shrink-0 mt-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <div>
                  <h3 className="text-yellow-800 font-bold">Short Notice Request</h3>
                  <p className="text-yellow-700 text-sm font-medium mt-1">
                    Please note: Time off requests should be submitted at least 1 week in advance.
                    Requests with shorter notice may require additional approval.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Main Form */}
          <form onSubmit={handleSubmit} className="bg-white/80 backdrop-blur-lg rounded-2xl border border-gray-200 p-8 shadow-lg">
            {/* Date Range */}
            <div className="mb-8">
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

              {/* Days Counter */}
              {formData.startDate && formData.endDate && (
                <div className="mt-4 bg-purple-50 border-2 border-purple-300 rounded-xl p-4">
                  <p className="text-purple-800 font-bold text-center">
                    Total Days Requested: <span className="text-2xl">{calculateDays()}</span>
                  </p>
                </div>
              )}
            </div>

            {/* Time Off Type */}
            <div className="mb-8">
              <label className="text-gray-800 font-bold text-lg mb-4 block">
                Type of Time Off <span className="text-red-600">*</span>
              </label>

              <div className="grid md:grid-cols-3 gap-4">
                {(['vacation', 'pto', 'unpaid'] as TimeOffType[]).map((type) => {
                  const config = getTypeConfig(type);
                  return (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setFormData(prev => ({ ...prev, type }))}
                      className={`p-6 rounded-xl border-2 transition-all duration-300 hover:scale-105 shadow-sm text-left ${
                        formData.type === type
                          ? 'bg-gradient-to-br ' + config.color + ' border-transparent text-white shadow-lg'
                          : 'bg-white border-gray-200 hover:bg-gray-50 hover:border-gray-300'
                      }`}
                    >
                      <div className="text-4xl mb-3">{config.icon}</div>
                      <h4 className={`font-bold mb-2 ${formData.type === type ? 'text-white' : 'text-gray-800'}`}>
                        {config.label}
                      </h4>
                      <p className={`text-sm ${formData.type === type ? 'text-white/90' : 'text-gray-600'} font-medium`}>
                        {config.description}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Reason */}
            <div className="mb-8">
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

            {/* Submit Button */}
            <div className="flex space-x-4">
              <button
                type="submit"
                disabled={isSubmitting || !formData.startDate || !formData.endDate || !formData.reason.trim()}
                className="flex-1 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 disabled:from-gray-400 disabled:to-gray-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-4 px-8 rounded-xl transition-all duration-300 hover:scale-105 shadow-lg hover:shadow-xl min-h-[56px] flex items-center justify-center space-x-2"
              >
                {isSubmitting ? (
                  <>
                    <svg className="animate-spin h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <span>Submitting Request...</span>
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                    </svg>
                    <span>Submit Request</span>
                  </>
                )}
              </button>

              <Link
                href="/dashboard"
                className="px-8 py-4 bg-gray-100 hover:bg-gray-200 border-2 border-gray-300 text-gray-800 font-bold rounded-xl transition-all duration-300 hover:scale-105 shadow-md min-h-[56px] flex items-center justify-center"
              >
                Cancel
              </Link>
            </div>
          </form>

          {/* Info Section */}
          <div className="mt-8 bg-blue-50 rounded-2xl border-2 border-blue-300 p-6 shadow-lg">
            <div className="flex items-start space-x-3">
              <svg className="w-6 h-6 text-blue-600 flex-shrink-0 mt-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div>
                <h4 className="text-gray-800 font-bold mb-2">Time Off Request Guidelines</h4>
                <ul className="text-gray-700 text-sm font-medium space-y-1">
                  <li>• <strong>Submit at least 1 week in advance</strong> for best approval chances</li>
                  <li>• Choose the appropriate type: Vacation, PTO, or Unpaid</li>
                  <li>• Vacation time uses your accrued vacation balance</li>
                  <li>• PTO (Paid Time Off) uses your general PTO balance</li>
                  <li>• Unpaid time off does not use any accrued benefits</li>
                  <li>• You will receive an email notification once your request is reviewed</li>
                  <li>• Contact your supervisor for urgent time off needs</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>

      <style jsx>{`
        @keyframes fade-in {
          from {
            opacity: 0;
            transform: translateY(-10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .animate-fade-in {
          animation: fade-in 0.5s ease-out;
        }

        .delay-1000 {
          animation-delay: 1s;
        }
      `}</style>
    </div>
  );
}
