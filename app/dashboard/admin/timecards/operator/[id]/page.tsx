'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { getCurrentUser, isAdmin, type User } from '@/lib/auth';
import {
  ArrowLeft, Clock, CheckCircle, Calendar, Download,
  ChevronLeft, ChevronRight, AlertTriangle, Moon, Factory,
  TrendingUp, Briefcase, ExternalLink, MapPin, Wifi, Smartphone, Radio,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';

// ── Types ──────────────────────────────────────────────────
interface TimecardWithUser {
  id: string;
  user_id: string;
  full_name: string;
  email: string;
  role: string;
  date: string;
  clock_in_time: string;
  clock_out_time: string | null;
  total_hours: number | null;
  clock_in_latitude: number | null;
  clock_in_longitude: number | null;
  clock_out_latitude: number | null;
  clock_out_longitude: number | null;
  is_approved: boolean;
  notes: string | null;
  is_shop_hours: boolean;
  is_night_shift: boolean;
  hour_type: string;
  clock_in_method: string | null;
  job_order_id: string | null;
  job_number: string | null;
  job_customer_name: string | null;
}

// ── Week helpers ──────────────────────────────────────────
function getWeekBounds(offset: number) {
  const now = new Date();
  const day = now.getDay(); // 0=Sun, 1=Mon...6=Sat
  const diff = day === 0 ? 6 : day - 1;
  const monday = new Date(now);
  monday.setDate(monday.getDate() - diff + offset * 7);
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(sunday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);
  return { monday, sunday };
}

function formatWeekRange(monday: Date, sunday: Date) {
  const s = monday.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const e = sunday.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  return `${s} – ${e}`;
}

// ── PDF Generation for single operator ──────────────────────
async function generateOperatorPDF(
  operatorName: string,
  operatorRole: string,
  timecards: TimecardWithUser[],
  monday: Date,
  sunday: Date,
  totals: { total: number; regular: number; weeklyOT: number; mandatoryOT: number; nightShift: number; shopHours: number },
) {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'letter' });

  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 12;
  let y = margin;

  const brandBlue = [37, 99, 235] as const;
  const brandRed = [220, 38, 38] as const;
  const brandDark = [30, 64, 175] as const;
  const slate800 = [30, 41, 59] as const;
  const gray500 = [107, 114, 128] as const;
  const white = [255, 255, 255] as const;
  const lightBg = [248, 250, 252] as const;

  // Header
  doc.setFillColor(...brandDark);
  doc.rect(0, 0, pageW, 26, 'F');
  doc.setFillColor(...brandRed);
  doc.rect(0, 26, pageW, 1.5, 'F');

  doc.setTextColor(...white);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('PONTIFEX INDUSTRIES', margin, 10);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(`Individual Timecard Report  |  ${operatorName}  |  ${operatorRole}`, margin, 17);

  const weekRange = formatWeekRange(monday, sunday);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text(`Pay Period: ${weekRange}`, pageW - margin, 10, { align: 'right' });

  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text(`Generated: ${new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}`, pageW - margin, 17, { align: 'right' });

  y = 34;

  // Summary row
  const boxW = (pageW - margin * 2 - 8 * 5) / 6;
  const boxH = 16;
  const summaryItems = [
    { label: 'TOTAL HOURS', value: totals.total.toFixed(1), color: brandBlue },
    { label: 'REGULAR', value: totals.regular.toFixed(1), color: [22, 163, 74] as const },
    { label: 'WEEKLY OT', value: totals.weeklyOT.toFixed(1), color: [234, 88, 12] as const },
    { label: 'MANDATORY OT', value: totals.mandatoryOT.toFixed(1), color: brandRed },
    { label: 'NIGHT SHIFT', value: totals.nightShift.toFixed(1), color: [79, 70, 229] as const },
    { label: 'SHOP HOURS', value: totals.shopHours.toFixed(1), color: [217, 119, 6] as const },
  ];

  summaryItems.forEach((item, i) => {
    const x = margin + i * (boxW + 8);
    doc.setDrawColor(...(item.color as [number, number, number]));
    doc.setLineWidth(0.5);
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(x, y, boxW, boxH, 1.5, 1.5, 'FD');
    doc.setFillColor(...(item.color as [number, number, number]));
    doc.rect(x, y, boxW, 2, 'F');
    doc.setTextColor(...(item.color as [number, number, number]));
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.text(item.value, x + boxW / 2, y + 9.5, { align: 'center' });
    doc.setTextColor(...gray500);
    doc.setFontSize(5.5);
    doc.setFont('helvetica', 'bold');
    doc.text(item.label, x + boxW / 2, y + 14, { align: 'center' });
  });

  y += boxH + 10;

  // Table
  const cols = [
    { label: 'DATE', x: margin + 2, w: 38 },
    { label: 'DAY', x: margin + 42, w: 18 },
    { label: 'CLOCK IN', x: margin + 62, w: 28 },
    { label: 'CLOCK OUT', x: margin + 92, w: 28 },
    { label: 'HOURS', x: margin + 122, w: 20 },
    { label: 'TYPE', x: margin + 144, w: 32 },
    { label: 'METHOD', x: margin + 178, w: 25 },
    { label: 'JOB', x: margin + 205, w: 30 },
    { label: 'STATUS', x: margin + 237, w: pageW - margin - 237 },
  ];

  doc.setFillColor(241, 245, 249);
  doc.rect(margin, y, pageW - margin * 2, 6, 'F');
  doc.setTextColor(...gray500);
  doc.setFontSize(6);
  doc.setFont('helvetica', 'bold');
  cols.forEach((c) => doc.text(c.label, c.x, y + 4.2));
  y += 8;

  const sortedEntries = [...timecards].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  sortedEntries.forEach((entry, rowIdx) => {
    if (y > pageH - 16) {
      doc.addPage();
      y = margin;
    }

    if (rowIdx % 2 === 0) {
      doc.setFillColor(...lightBg);
      doc.rect(margin, y - 1, pageW - margin * 2, 7, 'F');
    }

    doc.setTextColor(...slate800);
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'normal');

    const d = new Date(entry.date);
    doc.text(d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), cols[0].x, y + 3.5);
    doc.text(d.toLocaleDateString('en-US', { weekday: 'short' }), cols[1].x, y + 3.5);
    doc.text(new Date(entry.clock_in_time).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }), cols[2].x, y + 3.5);
    if (entry.clock_out_time) {
      doc.text(new Date(entry.clock_out_time).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }), cols[3].x, y + 3.5);
    } else {
      doc.setTextColor(22, 163, 74);
      doc.setFont('helvetica', 'bold');
      doc.text('ACTIVE', cols[3].x, y + 3.5);
      doc.setTextColor(...slate800);
      doc.setFont('helvetica', 'normal');
    }
    if (entry.total_hours !== null) {
      doc.text(`${entry.total_hours.toFixed(2)}`, cols[4].x, y + 3.5);
    } else {
      doc.text('-', cols[4].x, y + 3.5);
    }
    const hrType = entry.hour_type === 'mandatory_overtime' ? 'Wknd OT'
      : entry.is_night_shift ? 'Night'
      : entry.is_shop_hours ? 'Shop'
      : 'Regular';
    if (entry.hour_type === 'mandatory_overtime') {
      doc.setTextColor(...brandRed);
      doc.setFont('helvetica', 'bold');
    }
    doc.text(hrType, cols[5].x, y + 3.5);
    doc.setTextColor(...slate800);
    doc.setFont('helvetica', 'normal');
    doc.text(entry.clock_in_method || '-', cols[6].x, y + 3.5);
    doc.text(entry.job_number || '-', cols[7].x, y + 3.5);
    if (entry.is_approved) {
      doc.setTextColor(22, 163, 74);
      doc.setFont('helvetica', 'bold');
      doc.text('Approved', cols[8].x, y + 3.5);
    } else {
      doc.setTextColor(202, 138, 4);
      doc.text('Pending', cols[8].x, y + 3.5);
    }
    doc.setTextColor(...slate800);
    doc.setFont('helvetica', 'normal');

    y += 7;
  });

  // Footer
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setDrawColor(...brandDark);
    doc.setLineWidth(0.4);
    doc.line(margin, pageH - 10, pageW - margin, pageH - 10);
    doc.setFontSize(6.5);
    doc.setTextColor(...gray500);
    doc.setFont('helvetica', 'normal');
    doc.text(`Pontifex Industries  |  ${operatorName} Timecard  |  ${weekRange}`, margin, pageH - 6);
    doc.text(`Page ${p} of ${totalPages}`, pageW - margin, pageH - 6, { align: 'right' });
  }

  const filename = `Timecard_${operatorName.replace(/\s+/g, '_')}_${monday.toISOString().split('T')[0]}_to_${sunday.toISOString().split('T')[0]}.pdf`;
  doc.save(filename);
}

// ══════════════════════════════════════════════════════════════
// COMPONENT
// ══════════════════════════════════════════════════════════════
export default function OperatorTimecardPage() {
  const params = useParams();
  const operatorId = params.id as string;
  const router = useRouter();
  const isRedirecting = useRef(false);

  const [user, setUser] = useState<User | null>(null);
  const [timecards, setTimecards] = useState<TimecardWithUser[]>([]);
  const [weekOffset, setWeekOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [pdfLoading, setPdfLoading] = useState(false);

  const redirectToLogin = useCallback(() => {
    if (isRedirecting.current) return;
    isRedirecting.current = true;
    window.location.href = '/login';
  }, []);

  useEffect(() => {
    const currentUser = getCurrentUser();
    if (!currentUser || !isAdmin()) {
      router.push('/dashboard');
      return;
    }
    setUser(currentUser);
  }, [router]);

  const { monday, sunday } = useMemo(() => getWeekBounds(weekOffset), [weekOffset]);

  const fetchTimecards = useCallback(async () => {
    if (isRedirecting.current) return;
    try {
      setLoading(true);
      let session;
      try {
        const { data, error } = await supabase.auth.getSession();
        if (error || !data.session) { redirectToLogin(); return; }
        session = data.session;
      } catch {
        redirectToLogin();
        return;
      }

      const startDate = monday.toISOString().split('T')[0];
      const endDate = sunday.toISOString().split('T')[0];

      const response = await fetch(
        `/api/admin/timecards?userId=${operatorId}&startDate=${startDate}&endDate=${endDate}&limit=1000`,
        { headers: { 'Authorization': `Bearer ${session.access_token}` } }
      );

      if (response.status === 401) { redirectToLogin(); return; }

      const result = await response.json();
      if (result.success) {
        setTimecards(result.data.timecards || []);
      }
    } catch (error) {
      console.error('Error fetching timecards:', error);
    } finally {
      setLoading(false);
    }
  }, [monday, sunday, operatorId, redirectToLogin]);

  useEffect(() => {
    if (user) fetchTimecards();
  }, [user, fetchTimecards]);

  // ── Operator info from first timecard ────────────────────
  const operatorName = timecards[0]?.full_name || 'Operator';
  const operatorEmail = timecards[0]?.email || '';
  const operatorRole = timecards[0]?.role || '';

  // ── Calculated stats ──────────────────────────────────────
  const totalHours = timecards.reduce((sum, tc) => sum + (tc.total_hours || 0), 0);

  const mandatoryOTTotal = timecards
    .filter(tc => tc.hour_type === 'mandatory_overtime')
    .reduce((sum, tc) => sum + (tc.total_hours || 0), 0);

  const weekdayHours = timecards
    .filter(tc => tc.hour_type !== 'mandatory_overtime')
    .reduce((sum, tc) => sum + (tc.total_hours || 0), 0);

  const weeklyOTHours = Math.max(0, weekdayHours - 40);
  const regularHours = Math.min(weekdayHours, 40);
  const shopHoursTotal = timecards.filter(tc => tc.is_shop_hours).reduce((sum, tc) => sum + (tc.total_hours || 0), 0);
  const nightShiftTotal = timecards.filter(tc => tc.is_night_shift).reduce((sum, tc) => sum + (tc.total_hours || 0), 0);
  const pendingCount = timecards.filter(tc => !tc.is_approved).length;

  // ── Day groupings for grid ──────────────────────────────
  const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
  const weekDates: Date[] = useMemo(() => {
    const dates: Date[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(d.getDate() + i);
      dates.push(d);
    }
    return dates;
  }, [monday]);

  const dayEntries = useMemo(() => {
    return weekDates.map(date => {
      const dateStr = date.toISOString().split('T')[0];
      return timecards.filter(tc => tc.date === dateStr);
    });
  }, [timecards, weekDates]);

  // ── PDF Export ──────────────────────────────────────────
  const handleExportPDF = async () => {
    setPdfLoading(true);
    try {
      await generateOperatorPDF(operatorName, operatorRole, timecards, monday, sunday, {
        total: totalHours,
        regular: regularHours,
        weeklyOT: weeklyOTHours,
        mandatoryOT: mandatoryOTTotal,
        nightShift: nightShiftTotal,
        shopHours: shopHoursTotal,
      });
    } catch (err) {
      console.error('PDF generation failed:', err);
      alert('Failed to generate PDF. Please try again.');
    } finally {
      setPdfLoading(false);
    }
  };

  // ── Helpers ──────────────────────────────────────────────
  const formatTime = (dateString: string) =>
    new Date(dateString).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });

  const getMethodIcon = (method: string | null) => {
    switch (method) {
      case 'nfc': return <Smartphone size={10} className="text-violet-500" />;
      case 'gps': return <MapPin size={10} className="text-emerald-500" />;
      case 'remote': return <Wifi size={10} className="text-amber-500" />;
      default: return <Radio size={10} className="text-slate-400" />;
    }
  };

  const getMethodLabel = (method: string | null) => {
    switch (method) {
      case 'nfc': return 'NFC';
      case 'gps': return 'GPS';
      case 'remote': return 'Remote';
      default: return 'Manual';
    }
  };

  // ── Loading state ──────────────────────────────────────
  if (!user) {
    return (
      <div className="min-h-screen bg-[#f8fafc] flex items-center justify-center">
        <div className="text-center">
          <div className="w-14 h-14 mx-auto mb-4 relative">
            <div className="absolute inset-0 rounded-full border-4 border-blue-100"></div>
            <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-blue-600 animate-spin"></div>
          </div>
          <p className="text-slate-500 text-sm font-medium">Loading timecard...</p>
        </div>
      </div>
    );
  }

  // ── Max bar width for weekly totals ──────────────────────
  const maxBarHours = Math.max(totalHours, 50);

  return (
    <div className="min-h-screen bg-[#f8fafc]">
      {/* ── Header ─────────────────────────────────────── */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-xl border-b border-slate-200/60 shadow-sm">
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              href="/dashboard/admin/timecards"
              className="flex items-center gap-2 px-3 py-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-all text-sm font-medium"
            >
              <ArrowLeft size={16} />
              <span className="hidden sm:inline">Timecards</span>
            </Link>
            <div className="h-6 w-px bg-slate-200" />
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full flex items-center justify-center text-white font-bold text-sm shadow-sm">
                {operatorName?.charAt(0) || '?'}
              </div>
              <div>
                <h1 className="text-base sm:text-lg font-bold text-slate-900 leading-tight">
                  {loading && timecards.length === 0 ? 'Loading...' : `${operatorName}'s Timecard`}
                </h1>
                {operatorRole && (
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-600 border border-blue-200 capitalize">
                    {operatorRole.replace('_', ' ')}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleExportPDF}
              disabled={pdfLoading || timecards.length === 0}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                pdfLoading || timecards.length === 0
                  ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                  : 'bg-gradient-to-r from-blue-600 to-red-600 hover:from-blue-700 hover:to-red-700 text-white shadow-md hover:shadow-lg'
              }`}
            >
              {pdfLoading ? (
                <>
                  <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                  <span className="hidden sm:inline">Generating...</span>
                </>
              ) : (
                <>
                  <Download size={15} />
                  <span className="hidden sm:inline">Export PDF</span>
                </>
              )}
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-[1440px] mx-auto px-4 sm:px-6 py-6">
        {/* ── Week Navigation ───────────────────────────── */}
        <div className="mb-5 flex items-center justify-between gap-2">
          <button
            onClick={() => setWeekOffset(weekOffset - 1)}
            className="flex items-center gap-1.5 px-4 py-3 sm:px-3.5 sm:py-2 bg-white hover:bg-slate-50 text-slate-600 rounded-lg transition-all text-sm font-medium border border-slate-200 shadow-sm hover:shadow min-h-[44px]"
          >
            <ChevronLeft size={16} />
            <span className="hidden sm:inline">Prev</span>
          </button>

          <div className="text-center flex-1">
            <p className="text-sm sm:text-base font-bold text-slate-900">{formatWeekRange(monday, sunday)}</p>
            <p className="text-xs text-slate-400 mt-0.5">
              {weekOffset === 0 ? 'Current Week' : `${Math.abs(weekOffset)} ${Math.abs(weekOffset) === 1 ? 'week' : 'weeks'} ${weekOffset < 0 ? 'ago' : 'ahead'}`}
            </p>
          </div>

          <button
            onClick={() => setWeekOffset(weekOffset + 1)}
            disabled={weekOffset >= 0}
            className={`flex items-center gap-1.5 px-4 py-3 sm:px-3.5 sm:py-2 rounded-lg transition-all text-sm font-medium border shadow-sm min-h-[44px] ${
              weekOffset >= 0
                ? 'bg-slate-50 text-slate-300 border-slate-100 cursor-not-allowed'
                : 'bg-white hover:bg-slate-50 text-slate-600 border-slate-200 hover:shadow'
            }`}
          >
            <span className="hidden sm:inline">Next</span>
            <ChevronRight size={16} />
          </button>
        </div>

        {/* ── Summary Cards ─────────────────────────────── */}
        <div className="grid grid-cols-2 lg:grid-cols-6 gap-4 mb-5">
          {/* Total Hours - hero card */}
          <div className="col-span-2 lg:col-span-1 bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-800 rounded-xl p-5 text-white shadow-lg relative overflow-hidden">
            <div className="absolute top-0 right-0 w-24 h-24 bg-white/5 rounded-full -translate-y-6 translate-x-6" />
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp size={15} className="text-blue-200" />
              <span className="text-[10px] font-semibold text-blue-200 uppercase tracking-wider">Total Hours</span>
            </div>
            <p className="text-3xl font-bold tracking-tight">{totalHours.toFixed(1)}</p>
            <p className="text-[10px] text-blue-300 mt-1">{timecards.length} entries</p>
          </div>

          {/* Regular Hours */}
          <div className="bg-white rounded-xl p-4 border border-slate-200/60 shadow-sm hover:shadow transition-shadow">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Regular</span>
              <div className="w-7 h-7 rounded-lg bg-emerald-50 flex items-center justify-center">
                <CheckCircle size={14} className="text-emerald-600" />
              </div>
            </div>
            <p className="text-2xl font-bold text-emerald-600">{regularHours.toFixed(1)}</p>
            {/* Progress toward 40 */}
            <div className="mt-2 h-1.5 bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-500 rounded-full transition-all duration-700"
                style={{ width: `${Math.min((regularHours / 40) * 100, 100)}%` }}
              />
            </div>
            <p className="text-[10px] text-slate-400 mt-1">{(40 - regularHours).toFixed(1)} to 40hr threshold</p>
          </div>

          {/* Weekly OT */}
          <div className="bg-white rounded-xl p-4 border border-slate-200/60 shadow-sm hover:shadow transition-shadow">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Weekly OT</span>
              <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${weeklyOTHours > 0 ? 'bg-orange-50' : 'bg-slate-50'}`}>
                <TrendingUp size={14} className={weeklyOTHours > 0 ? 'text-orange-600' : 'text-slate-400'} />
              </div>
            </div>
            <p className={`text-2xl font-bold ${weeklyOTHours > 0 ? 'text-orange-600' : 'text-slate-300'}`}>{weeklyOTHours.toFixed(1)}</p>
            <p className="text-[10px] text-slate-400 mt-1">Mon-Fri hours over 40</p>
          </div>

          {/* Mandatory OT */}
          <div className="bg-white rounded-xl p-4 border border-slate-200/60 shadow-sm hover:shadow transition-shadow">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Mandatory OT</span>
              <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${mandatoryOTTotal > 0 ? 'bg-red-50' : 'bg-slate-50'}`}>
                <Briefcase size={14} className={mandatoryOTTotal > 0 ? 'text-red-600' : 'text-slate-400'} />
              </div>
            </div>
            <p className={`text-2xl font-bold ${mandatoryOTTotal > 0 ? 'text-red-600' : 'text-slate-300'}`}>{mandatoryOTTotal.toFixed(1)}</p>
            <p className="text-[10px] text-slate-400 mt-1">Sat/Sun hours</p>
          </div>

          {/* Night Shift */}
          <div className="bg-white rounded-xl p-4 border border-slate-200/60 shadow-sm hover:shadow transition-shadow">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Night Shift</span>
              <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${nightShiftTotal > 0 ? 'bg-indigo-50' : 'bg-slate-50'}`}>
                <Moon size={14} className={nightShiftTotal > 0 ? 'text-indigo-600' : 'text-slate-400'} />
              </div>
            </div>
            <p className={`text-2xl font-bold ${nightShiftTotal > 0 ? 'text-indigo-600' : 'text-slate-300'}`}>{nightShiftTotal.toFixed(1)}</p>
            <p className="text-[10px] text-slate-400 mt-1">Clock-in after 3 PM</p>
          </div>

          {/* Shop Hours */}
          <div className="bg-white rounded-xl p-4 border border-slate-200/60 shadow-sm hover:shadow transition-shadow">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Shop Hours</span>
              <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${shopHoursTotal > 0 ? 'bg-amber-50' : 'bg-slate-50'}`}>
                <Factory size={14} className={shopHoursTotal > 0 ? 'text-amber-600' : 'text-slate-400'} />
              </div>
            </div>
            <p className={`text-2xl font-bold ${shopHoursTotal > 0 ? 'text-amber-600' : 'text-slate-300'}`}>{shopHoursTotal.toFixed(1)}</p>
            <p className="text-[10px] text-slate-400 mt-1">In-shop work</p>
          </div>
        </div>

        {/* ── Weekly Totals Bar ────────────────────────── */}
        {totalHours > 0 && (
          <div className="bg-white rounded-xl border border-slate-200/60 shadow-sm p-5 mb-5">
            <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-3">Weekly Hours Breakdown</h3>
            <div className="relative h-8 bg-slate-100 rounded-full overflow-hidden">
              {/* Regular segment */}
              {regularHours > 0 && (
                <div
                  className="absolute top-0 left-0 h-full bg-emerald-500 transition-all duration-700"
                  style={{ width: `${(regularHours / maxBarHours) * 100}%` }}
                  title={`Regular: ${regularHours.toFixed(1)} hrs`}
                />
              )}
              {/* Weekly OT segment */}
              {weeklyOTHours > 0 && (
                <div
                  className="absolute top-0 h-full bg-orange-500 transition-all duration-700"
                  style={{
                    left: `${(regularHours / maxBarHours) * 100}%`,
                    width: `${(weeklyOTHours / maxBarHours) * 100}%`,
                  }}
                  title={`Weekly OT: ${weeklyOTHours.toFixed(1)} hrs`}
                />
              )}
              {/* Mandatory OT segment */}
              {mandatoryOTTotal > 0 && (
                <div
                  className="absolute top-0 h-full bg-red-500 transition-all duration-700"
                  style={{
                    left: `${((regularHours + weeklyOTHours) / maxBarHours) * 100}%`,
                    width: `${(mandatoryOTTotal / maxBarHours) * 100}%`,
                  }}
                  title={`Mandatory OT: ${mandatoryOTTotal.toFixed(1)} hrs`}
                />
              )}
              {/* 40-hour threshold line */}
              <div
                className="absolute top-0 h-full w-0.5 bg-slate-800 z-10"
                style={{ left: `${(40 / maxBarHours) * 100}%` }}
              />
              <div
                className="absolute -top-5 text-[9px] font-bold text-slate-600 z-10"
                style={{ left: `${(40 / maxBarHours) * 100}%`, transform: 'translateX(-50%)' }}
              >
                40hr OT
              </div>
            </div>
            <div className="flex flex-wrap gap-4 mt-3 text-[11px]">
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 bg-emerald-500 rounded-sm" />
                <span className="text-slate-600">Regular: <span className="font-bold">{regularHours.toFixed(1)}</span></span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 bg-orange-500 rounded-sm" />
                <span className="text-slate-600">Weekly OT: <span className="font-bold">{weeklyOTHours.toFixed(1)}</span></span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 bg-red-500 rounded-sm" />
                <span className="text-slate-600">Mandatory OT: <span className="font-bold">{mandatoryOTTotal.toFixed(1)}</span></span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 bg-indigo-500 rounded-sm" />
                <span className="text-slate-600">Night: <span className="font-bold">{nightShiftTotal.toFixed(1)}</span></span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 bg-amber-500 rounded-sm" />
                <span className="text-slate-600">Shop: <span className="font-bold">{shopHoursTotal.toFixed(1)}</span></span>
              </span>
            </div>
          </div>
        )}

        {/* ── Daily Breakdown Grid ──────────────────────── */}
        <div className="bg-white rounded-xl border border-slate-200/60 shadow-sm overflow-hidden mb-5">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-slate-800">Daily Breakdown</h2>
              <p className="text-xs text-slate-400 mt-0.5">{formatWeekRange(monday, sunday)}</p>
            </div>
            {pendingCount > 0 && (
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-bold bg-amber-50 text-amber-600 border border-amber-200">
                <AlertTriangle size={10} />
                {pendingCount} pending approval
              </span>
            )}
          </div>

          {loading ? (
            <div className="p-16 text-center">
              <div className="w-10 h-10 mx-auto mb-3 relative">
                <div className="absolute inset-0 rounded-full border-[3px] border-slate-100"></div>
                <div className="absolute inset-0 rounded-full border-[3px] border-transparent border-t-blue-600 animate-spin"></div>
              </div>
              <p className="text-slate-400 text-sm">Loading timecards...</p>
            </div>
          ) : timecards.length === 0 ? (
            <div className="p-16 text-center">
              <div className="w-16 h-16 bg-slate-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Clock className="text-slate-300" size={28} />
              </div>
              <p className="text-slate-600 font-semibold">No time entries for this week</p>
              <p className="text-slate-400 text-sm mt-1">Try navigating to a different week</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 divide-x divide-slate-100">
              {weekDates.map((date, i) => {
                const entries = dayEntries[i];
                const dayOfWeek = date.getDay();
                const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
                const dayTotal = entries.reduce((s, e) => s + (e.total_hours || 0), 0);
                const isToday = date.toISOString().split('T')[0] === new Date().toISOString().split('T')[0];

                return (
                  <div
                    key={i}
                    className={`p-3 min-h-[180px] ${isWeekend ? 'bg-red-50/30' : ''} ${isToday ? 'ring-2 ring-blue-400 ring-inset' : ''}`}
                  >
                    {/* Day header */}
                    <div className="text-center mb-3 pb-2 border-b border-slate-100">
                      <p className={`text-xs font-bold uppercase ${isWeekend ? 'text-red-500' : 'text-slate-500'}`}>
                        {dayNames[i]}
                      </p>
                      <p className="text-[10px] text-slate-400">
                        {date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </p>
                      {isToday && (
                        <span className="inline-flex items-center px-1.5 py-0.5 mt-1 rounded-full text-[8px] font-bold bg-blue-100 text-blue-600">
                          Today
                        </span>
                      )}
                    </div>

                    {entries.length === 0 ? (
                      <div className="text-center py-4">
                        <span className="text-xs text-slate-200 font-medium">--</span>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {entries.map((entry, entryIdx) => {
                          const isMandOT = entry.hour_type === 'mandatory_overtime';
                          const isNight = entry.is_night_shift;
                          const isShop = entry.is_shop_hours;
                          const isActive = !entry.clock_out_time;

                          return (
                            <div
                              key={entryIdx}
                              className={`rounded-lg border p-2 text-[10px] space-y-1 ${
                                isMandOT ? 'border-red-200 bg-red-50/50' :
                                isNight ? 'border-indigo-200 bg-indigo-50/50' :
                                isShop ? 'border-amber-200 bg-amber-50/50' :
                                'border-slate-100 bg-slate-50/50'
                              }`}
                            >
                              {/* Clock times */}
                              <div className="flex items-center justify-between">
                                <span className="font-semibold text-slate-700 tabular-nums">
                                  {formatTime(entry.clock_in_time)}
                                </span>
                                <span className="text-slate-300">-</span>
                                {isActive ? (
                                  <span className="inline-flex items-center gap-0.5 px-1 rounded text-[8px] font-bold bg-emerald-50 text-emerald-600 border border-emerald-200">
                                    <span className="w-1 h-1 bg-emerald-500 rounded-full animate-pulse" />
                                    Active
                                  </span>
                                ) : (
                                  <span className="font-semibold text-slate-700 tabular-nums">
                                    {formatTime(entry.clock_out_time!)}
                                  </span>
                                )}
                              </div>

                              {/* Hours */}
                              <div className="flex items-center justify-between">
                                <span className={`font-bold tabular-nums ${
                                  isMandOT ? 'text-red-600' : isNight ? 'text-indigo-600' : 'text-slate-800'
                                }`}>
                                  {entry.total_hours !== null ? `${entry.total_hours.toFixed(1)} hrs` : '--'}
                                </span>
                                {/* Hour type color indicator */}
                                <span className={`w-2 h-2 rounded-full ${
                                  isMandOT ? 'bg-red-500' : isNight ? 'bg-indigo-500' : isShop ? 'bg-amber-500' : 'bg-emerald-500'
                                }`} />
                              </div>

                              {/* Method badge */}
                              <div className="flex items-center gap-1">
                                {getMethodIcon(entry.clock_in_method)}
                                <span className="text-slate-500 font-medium">{getMethodLabel(entry.clock_in_method)}</span>
                              </div>

                              {/* Job linkage */}
                              {entry.job_order_id && (
                                <a
                                  href={`/dashboard/admin/job-pnl/${entry.job_order_id}`}
                                  className="flex items-center gap-1 text-blue-600 hover:text-blue-800 hover:underline font-semibold truncate"
                                >
                                  <ExternalLink size={8} />
                                  <span className="truncate">{entry.job_number || 'Job'}</span>
                                </a>
                              )}
                              {entry.job_customer_name && (
                                <p className="text-slate-400 truncate" title={entry.job_customer_name}>
                                  {entry.job_customer_name}
                                </p>
                              )}

                              {/* Approval status */}
                              <div className="pt-0.5">
                                {entry.is_approved ? (
                                  <span className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded text-[8px] font-bold bg-emerald-50 text-emerald-600 border border-emerald-200">
                                    <CheckCircle size={8} />
                                    Approved
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded text-[8px] font-bold bg-amber-50 text-amber-600 border border-amber-200">
                                    <Clock size={8} />
                                    Pending
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })}

                        {/* Day total */}
                        {entries.length > 0 && (
                          <div className="text-center pt-1 border-t border-slate-100">
                            <span className="text-xs font-bold text-slate-700 tabular-nums">
                              {dayTotal.toFixed(1)} hrs
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Legend ──────────────────────────────────────── */}
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 px-2 py-3 text-[11px] text-slate-500">
          {[
            { color: 'bg-emerald-500', label: 'Regular (up to 40 hrs/wk)' },
            { color: 'bg-orange-500', label: 'Weekly OT (over 40 hrs)' },
            { color: 'bg-red-500', label: 'Mandatory OT (Sat/Sun)' },
            { color: 'bg-indigo-500', label: 'Night Shift (clock-in after 3 PM)' },
            { color: 'bg-amber-500', label: 'Shop Hours (in-shop work)' },
          ].map(({ color, label }) => (
            <div key={label} className="flex items-center gap-1.5">
              <span className={`w-2 h-2 ${color} rounded-full`} />
              <span>{label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
