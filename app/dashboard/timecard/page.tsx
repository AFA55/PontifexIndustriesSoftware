'use client';

import { useState } from 'react';
import Link from 'next/link';
import { getCurrentUser } from '@/lib/auth';

// Mock timecard data - In production, this would come from your database
interface TimecardEntry {
  id: string;
  date: string;
  clockIn: string;
  clockOut: string | null;
  regularHours: number;
  overtimeHours: number;
  totalHours: number;
  lunchDeducted: boolean; // Track if lunch was automatically deducted
}

export default function TimecardPage() {
  const user = getCurrentUser();

  // Mock data for demonstration
  // Note: If total hours > 8, automatically deduct 45 mins (0.75 hours) for lunch
  const [weeklyData, setWeeklyData] = useState<TimecardEntry[]>([
    {
      id: '1',
      date: '2025-10-20',
      clockIn: '07:00 AM',
      clockOut: '05:15 PM', // 10.25 hours raw, -0.75 lunch = 9.5 hours
      regularHours: 8,
      overtimeHours: 1.5,
      totalHours: 9.5,
      lunchDeducted: true
    },
    {
      id: '2',
      date: '2025-10-21',
      clockIn: '07:15 AM',
      clockOut: '04:30 PM', // 9.25 hours raw, -0.75 lunch = 8.5 hours
      regularHours: 8,
      overtimeHours: 0.5,
      totalHours: 8.5,
      lunchDeducted: true
    },
    {
      id: '3',
      date: '2025-10-22',
      clockIn: '07:00 AM',
      clockOut: '05:45 PM', // 10.75 hours raw, -0.75 lunch = 10 hours
      regularHours: 8,
      overtimeHours: 2,
      totalHours: 10,
      lunchDeducted: true
    },
    {
      id: '4',
      date: '2025-10-23',
      clockIn: '07:30 AM',
      clockOut: '04:45 PM', // 9.25 hours raw, -0.75 lunch = 8.5 hours
      regularHours: 8,
      overtimeHours: 0.5,
      totalHours: 8.5,
      lunchDeducted: true
    },
    {
      id: '5',
      date: '2025-10-24',
      clockIn: '07:00 AM',
      clockOut: '03:30 PM', // 8.5 hours raw, -0.75 lunch = 7.75 hours (but let's make it > 8 for demo)
      regularHours: 8,
      overtimeHours: 0.5,
      totalHours: 8.5,
      lunchDeducted: true
    },
  ]);

  // Calculate totals
  const totalRegularHours = weeklyData.reduce((sum, entry) => sum + entry.regularHours, 0);
  const totalOvertimeHours = weeklyData.reduce((sum, entry) => sum + entry.overtimeHours, 0);
  const totalHours = weeklyData.reduce((sum, entry) => sum + entry.totalHours, 0);
  const daysWithLunchDeducted = weeklyData.filter(entry => entry.lunchDeducted).length;
  const totalLunchDeducted = daysWithLunchDeducted * 0.75; // 45 mins = 0.75 hours

  const getDayName = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { weekday: 'long' });
  };

  const getFormattedDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50">
      {/* Animated Background Elements */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-indigo-300 rounded-full opacity-10 blur-3xl animate-pulse"></div>
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
              <h1 className="text-4xl font-bold bg-gradient-to-r from-indigo-600 via-purple-600 to-blue-600 bg-clip-text text-transparent">
                My Timecard
              </h1>
              <p className="text-gray-600 font-medium mt-1">Weekly hours and attendance tracking</p>
            </div>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          {/* Total Hours Card */}
          <div className="bg-white/80 backdrop-blur-lg rounded-2xl border border-gray-200 p-6 shadow-lg">
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center shadow-lg">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>
            <p className="text-gray-600 font-semibold text-sm mb-1">Total Hours</p>
            <p className="text-4xl font-bold text-gray-800">{totalHours.toFixed(1)}</p>
            <p className="text-gray-500 text-sm font-medium mt-2">This week</p>
          </div>

          {/* Regular Hours Card */}
          <div className="bg-white/80 backdrop-blur-lg rounded-2xl border border-gray-200 p-6 shadow-lg">
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 bg-gradient-to-br from-green-500 to-emerald-600 rounded-xl flex items-center justify-center shadow-lg">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>
            <p className="text-gray-600 font-semibold text-sm mb-1">Regular Hours</p>
            <p className="text-4xl font-bold text-gray-800">{totalRegularHours.toFixed(1)}</p>
            <p className="text-gray-500 text-sm font-medium mt-2">Standard time</p>
          </div>

          {/* Overtime Hours Card */}
          <div className="bg-white/80 backdrop-blur-lg rounded-2xl border border-gray-200 p-6 shadow-lg">
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 bg-gradient-to-br from-orange-500 to-red-600 rounded-xl flex items-center justify-center shadow-lg">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
            </div>
            <p className="text-gray-600 font-semibold text-sm mb-1">Overtime Hours</p>
            <p className="text-4xl font-bold text-gray-800">{totalOvertimeHours.toFixed(1)}</p>
            <p className="text-gray-500 text-sm font-medium mt-2">Extra time</p>
          </div>
        </div>

        {/* Weekly Schedule Table */}
        <div className="bg-white/80 backdrop-blur-lg rounded-2xl border border-gray-200 shadow-lg overflow-hidden">
          <div className="p-6 border-b border-gray-200 bg-gradient-to-r from-indigo-50 to-purple-50">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-2xl font-bold text-gray-800">Weekly Schedule</h2>
                <p className="text-gray-600 font-medium mt-1">October 20 - October 24, 2025</p>
              </div>
              {daysWithLunchDeducted > 0 && (
                <div className="bg-blue-100 border-2 border-blue-300 rounded-xl px-4 py-2">
                  <p className="text-blue-800 font-bold text-sm">Lunch Deductions</p>
                  <p className="text-blue-700 font-semibold text-xs mt-1">
                    {daysWithLunchDeducted} day{daysWithLunchDeducted > 1 ? 's' : ''} × 45 min = {totalLunchDeducted.toFixed(2)} hrs
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Desktop Table View */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">
                    Date
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">
                    Clock In
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">
                    Clock Out
                  </th>
                  <th className="px-6 py-4 text-center text-xs font-bold text-gray-600 uppercase tracking-wider">
                    Regular Hours
                  </th>
                  <th className="px-6 py-4 text-center text-xs font-bold text-gray-600 uppercase tracking-wider">
                    Overtime
                  </th>
                  <th className="px-6 py-4 text-center text-xs font-bold text-gray-600 uppercase tracking-wider">
                    Total
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {weeklyData.map((entry, index) => (
                  <tr key={entry.id} className="hover:bg-indigo-50/50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div>
                        <p className="text-gray-800 font-bold">{getDayName(entry.date)}</p>
                        <p className="text-gray-500 text-sm font-medium">{getFormattedDate(entry.date)}</p>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center space-x-2">
                        <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                        <span className="text-gray-800 font-semibold">{entry.clockIn}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center space-x-2">
                        <div className="w-2 h-2 bg-red-500 rounded-full"></div>
                        <span className="text-gray-800 font-semibold">{entry.clockOut || 'In Progress'}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm font-bold border border-green-300">
                        {entry.regularHours.toFixed(1)} hrs
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      <span className={`px-3 py-1 rounded-full text-sm font-bold border ${
                        entry.overtimeHours > 0
                          ? 'bg-orange-100 text-orange-700 border-orange-300'
                          : 'bg-gray-100 text-gray-500 border-gray-300'
                      }`}>
                        {entry.overtimeHours.toFixed(1)} hrs
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      <div className="flex items-center justify-center space-x-2">
                        <span className="text-gray-800 font-bold text-lg">{entry.totalHours.toFixed(1)} hrs</span>
                        {entry.lunchDeducted && (
                          <div className="group relative">
                            <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block w-48 bg-gray-900 text-white text-xs rounded-lg py-2 px-3 z-10">
                              45 min lunch deducted (worked &gt;8 hrs)
                              <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 border-4 border-transparent border-t-gray-900"></div>
                            </div>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-indigo-50 border-t-2 border-indigo-300">
                <tr>
                  <td colSpan={3} className="px-6 py-4">
                    <p className="text-gray-800 font-bold text-lg">Week Total</p>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <span className="px-4 py-2 bg-green-500 text-white rounded-full text-sm font-bold shadow-md">
                      {totalRegularHours.toFixed(1)} hrs
                    </span>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <span className="px-4 py-2 bg-orange-500 text-white rounded-full text-sm font-bold shadow-md">
                      {totalOvertimeHours.toFixed(1)} hrs
                    </span>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <span className="text-gray-800 font-bold text-xl">{totalHours.toFixed(1)} hrs</span>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Mobile Card View */}
          <div className="md:hidden p-4 space-y-4">
            {weeklyData.map((entry) => (
              <div key={entry.id} className="bg-gray-50 rounded-xl p-4 border border-gray-200">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="text-gray-800 font-bold">{getDayName(entry.date)}</p>
                    <p className="text-gray-500 text-sm font-medium">{getFormattedDate(entry.date)}</p>
                  </div>
                  <div className="flex items-center space-x-2">
                    <span className="text-gray-800 font-bold text-lg">{entry.totalHours.toFixed(1)} hrs</span>
                    {entry.lunchDeducted && (
                      <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" title="45 min lunch deducted">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div className="bg-white rounded-lg p-3 border border-gray-200">
                    <p className="text-gray-600 text-xs font-semibold mb-1">Clock In</p>
                    <p className="text-gray-800 font-bold">{entry.clockIn}</p>
                  </div>
                  <div className="bg-white rounded-lg p-3 border border-gray-200">
                    <p className="text-gray-600 text-xs font-semibold mb-1">Clock Out</p>
                    <p className="text-gray-800 font-bold">{entry.clockOut || 'In Progress'}</p>
                  </div>
                </div>

                <div className="flex space-x-2">
                  <span className="flex-1 px-3 py-2 bg-green-100 text-green-700 rounded-lg text-xs font-bold text-center border border-green-300">
                    Regular: {entry.regularHours.toFixed(1)} hrs
                  </span>
                  <span className={`flex-1 px-3 py-2 rounded-lg text-xs font-bold text-center border ${
                    entry.overtimeHours > 0
                      ? 'bg-orange-100 text-orange-700 border-orange-300'
                      : 'bg-gray-100 text-gray-500 border-gray-300'
                  }`}>
                    OT: {entry.overtimeHours.toFixed(1)} hrs
                  </span>
                </div>
              </div>
            ))}

            {/* Mobile Totals */}
            <div className="bg-indigo-50 rounded-xl p-4 border-2 border-indigo-300">
              <p className="text-gray-800 font-bold text-lg mb-3">Week Total</p>
              <div className="grid grid-cols-3 gap-3">
                <div className="text-center">
                  <p className="text-gray-600 text-xs font-semibold mb-1">Total</p>
                  <p className="text-gray-800 font-bold text-lg">{totalHours.toFixed(1)}</p>
                </div>
                <div className="text-center">
                  <p className="text-gray-600 text-xs font-semibold mb-1">Regular</p>
                  <p className="text-green-700 font-bold text-lg">{totalRegularHours.toFixed(1)}</p>
                </div>
                <div className="text-center">
                  <p className="text-gray-600 text-xs font-semibold mb-1">Overtime</p>
                  <p className="text-orange-700 font-bold text-lg">{totalOvertimeHours.toFixed(1)}</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Info Section */}
        <div className="mt-8 bg-blue-50 rounded-2xl border-2 border-blue-300 p-6 shadow-lg">
          <div className="flex items-start space-x-3">
            <svg className="w-6 h-6 text-blue-600 flex-shrink-0 mt-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <h4 className="text-gray-800 font-bold mb-2">How Time Tracking Works</h4>
              <ul className="text-gray-700 text-sm font-medium space-y-1">
                <li>• Clock in automatically when you click "On Route" for a job</li>
                <li>• Click "Mark Day as Finished" on the dashboard to clock out</li>
                <li>• Regular hours: First 8 hours of your shift</li>
                <li>• Overtime: Any hours worked beyond 8 hours in a day</li>
                <li>• <strong className="text-blue-700">Automatic lunch deduction:</strong> 45 minutes deducted when working more than 8 hours</li>
                <li>• Blue info icon (ℹ️) indicates days with automatic lunch deduction</li>
                <li>• Your timecard updates automatically throughout the week</li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      <style jsx>{`
        .delay-1000 {
          animation-delay: 1s;
        }
      `}</style>
    </div>
  );
}
