'use client';

import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getCurrentUser, isAdmin, type User } from '@/lib/auth';
import {
  ArrowLeft, Clock, MapPin, CheckCircle, XCircle, Calendar,
  User as UserIcon, ExternalLink, Edit, FileText, Download,
  ChevronLeft, ChevronRight, AlertTriangle, Moon, Factory, Briefcase,
  Search, TrendingUp, Users, ChevronDown, ChevronUp,
  MessageSquare, Loader2, Shield, X, Zap, StickyNote
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { getGoogleMapsLink } from '@/lib/geolocation';

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
}

interface EmployeeGroup {
  userId: string;
  name: string;
  email: string;
  role: string;
  entries: TimecardWithUser[];
  totalHours: number;
  regularHours: number;
  weeklyOT: number;
  mandatoryOT: number;
  nightShift: number;
  shopHours: number;
  pendingCount: number;
  approvedCount: number;
  status: 'all_approved' | 'has_pending' | 'has_active';
}

// ── Week helpers ──────────────────────────────────────────────
function getWeekBounds(offset: number) {
  const now = new Date();
  const day = now.getDay();
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

// ── PDF generation (QuickBooks-ready) ─────────────────────────
async function generateWeeklyPDF(
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

  doc.setFillColor(...brandDark);
  doc.rect(0, 0, pageW, 26, 'F');
  doc.setFillColor(...brandRed);
  doc.rect(0, 26, pageW, 1.5, 'F');

  doc.setTextColor(...white);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('PATRIOT CONCRETE CUTTING', margin, 10);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text('Weekly Timecard Report  |  QuickBooks Payroll', margin, 17);

  const weekRange = formatWeekRange(monday, sunday);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text(`Pay Period: ${weekRange}`, pageW - margin, 10, { align: 'right' });

  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text(`Generated: ${new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}`, pageW - margin, 17, { align: 'right' });

  y = 34;

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

  y += boxH + 8;

  const grouped: Record<string, TimecardWithUser[]> = {};
  timecards.forEach((tc) => {
    const key = tc.full_name || tc.email;
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(tc);
  });

  const employees = Object.entries(grouped);

  const cols = [
    { label: 'DATE', x: margin + 2, w: 38 },
    { label: 'DAY', x: margin + 42, w: 18 },
    { label: 'CLOCK IN', x: margin + 62, w: 28 },
    { label: 'CLOCK OUT', x: margin + 92, w: 28 },
    { label: 'HOURS', x: margin + 122, w: 20 },
    { label: 'TYPE', x: margin + 144, w: 32 },
    { label: 'CATEGORY', x: margin + 178, w: 30 },
    { label: 'STATUS', x: margin + 210, w: 22 },
    { label: 'NOTES', x: margin + 234, w: pageW - margin - 234 },
  ];

  employees.forEach(([name, entries]) => {
    if (y > pageH - 55) { doc.addPage(); y = margin; }

    doc.setFillColor(...brandDark);
    doc.roundedRect(margin, y, pageW - margin * 2, 8, 1.5, 1.5, 'F');
    doc.setTextColor(...white);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text(name.toUpperCase(), margin + 4, y + 5.5);

    const empTotal = entries.reduce((s, e) => s + (e.total_hours || 0), 0);
    const empWeekday = entries.filter(e => e.hour_type !== 'mandatory_overtime').reduce((s, e) => s + (e.total_hours || 0), 0);
    const empMandOT = entries.filter(e => e.hour_type === 'mandatory_overtime').reduce((s, e) => s + (e.total_hours || 0), 0);
    const empRegular = Math.min(empWeekday, 40);
    const empOT = Math.max(0, empWeekday - 40);
    doc.setFontSize(8);
    doc.text(`Total: ${empTotal.toFixed(1)} hrs  |  Regular: ${empRegular.toFixed(1)}  |  Weekly OT: ${empOT.toFixed(1)}  |  Mand OT: ${empMandOT.toFixed(1)}`, pageW - margin - 4, y + 5.5, { align: 'right' });

    y += 11;

    doc.setFillColor(241, 245, 249);
    doc.rect(margin, y, pageW - margin * 2, 6, 'F');
    doc.setTextColor(...gray500);
    doc.setFontSize(6);
    doc.setFont('helvetica', 'bold');
    cols.forEach((c) => doc.text(c.label, c.x, y + 4.2));
    y += 8;

    const sortedEntries = [...entries].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    sortedEntries.forEach((entry, rowIdx) => {
      if (y > pageH - 16) { doc.addPage(); y = margin; }
      if (rowIdx % 2 === 0) { doc.setFillColor(...lightBg); doc.rect(margin, y - 1, pageW - margin * 2, 7, 'F'); }

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
      if (entry.total_hours !== null) { doc.text(`${entry.total_hours.toFixed(2)}`, cols[4].x, y + 3.5); }
      else { doc.text('-', cols[4].x, y + 3.5); }

      const hrType = entry.hour_type === 'mandatory_overtime' ? 'Wknd OT'
        : entry.hour_type === 'night_shift' ? 'Night' : 'Regular';
      if (entry.hour_type === 'mandatory_overtime') { doc.setTextColor(...brandRed); doc.setFont('helvetica', 'bold'); }
      doc.text(hrType, cols[5].x, y + 3.5);
      doc.setTextColor(...slate800);
      doc.setFont('helvetica', 'normal');

      const cats: string[] = [];
      if (entry.is_shop_hours) cats.push('Shop');
      if (entry.is_night_shift) cats.push('Night');
      if (entry.hour_type === 'mandatory_overtime') cats.push('Wknd OT');
      doc.text(cats.length ? cats.join(', ') : '-', cols[6].x, y + 3.5);

      if (entry.is_approved) { doc.setTextColor(22, 163, 74); doc.setFont('helvetica', 'bold'); doc.text('Approved', cols[7].x, y + 3.5); }
      else { doc.setTextColor(202, 138, 4); doc.text('Pending', cols[7].x, y + 3.5); }
      doc.setTextColor(...slate800);
      doc.setFont('helvetica', 'normal');

      if (entry.notes) { const n = entry.notes.length > 35 ? entry.notes.slice(0, 32) + '...' : entry.notes; doc.text(n, cols[8].x, y + 3.5); }

      y += 7;
    });

    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.3);
    doc.line(margin, y, pageW - margin, y);
    y += 3;
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...brandDark);
    doc.text(`Subtotal: ${empTotal.toFixed(2)} hours  (${sortedEntries.length} entries)`, cols[4].x - 10, y + 1);

    const unapproved = entries.filter(e => !e.is_approved).length;
    if (unapproved > 0) { doc.setTextColor(...brandRed); doc.text(`${unapproved} pending approval`, pageW - margin - 4, y + 1, { align: 'right' }); }
    y += 10;
  });

  // Signature section
  if (y > pageH - 50) { doc.addPage(); y = margin; }
  y += 5;
  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.2);
  doc.line(margin, y, pageW - margin, y);
  y += 8;

  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...slate800);
  doc.text('APPROVAL & SIGNATURES', margin, y);
  y += 8;

  const colW = (pageW - margin * 2 - 20) / 2;
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...gray500);

  doc.text('Prepared By:', margin, y);
  doc.line(margin + 25, y + 1, margin + colW, y + 1);
  doc.text('Date:', margin, y + 10);
  doc.line(margin + 25, y + 11, margin + colW, y + 11);

  const rightX = margin + colW + 20;
  doc.text('Approved By:', rightX, y);
  doc.line(rightX + 25, y + 1, rightX + colW, y + 1);
  doc.text('Date:', rightX, y + 10);
  doc.line(rightX + 25, y + 11, rightX + colW, y + 11);

  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setDrawColor(...brandDark);
    doc.setLineWidth(0.4);
    doc.line(margin, pageH - 10, pageW - margin, pageH - 10);
    doc.setFontSize(6.5);
    doc.setTextColor(...gray500);
    doc.setFont('helvetica', 'normal');
    doc.text(`Patriot Concrete Cutting  |  Timecard Report  |  ${weekRange}  |  For QuickBooks Payroll`, margin, pageH - 6);
    doc.text(`Page ${p} of ${totalPages}`, pageW - margin, pageH - 6, { align: 'right' });
  }

  const filename = `Timecards_${monday.toISOString().split('T')[0]}_to_${sunday.toISOString().split('T')[0]}.pdf`;
  doc.save(filename);
}

// ══════════════════════════════════════════════════════════════
// COMPONENT
// ══════════════════════════════════════════════════════════════

export default function AdminTimecardsPage() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [timecards, setTimecards] = useState<TimecardWithUser[]>([]);
  const [selectedTimecard, setSelectedTimecard] = useState<TimecardWithUser | null>(null);
  const [showMapModal, setShowMapModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editFormData, setEditFormData] = useState({ clock_in_time: '', clock_out_time: '', notes: '' });
  const [weekOffset, setWeekOffset] = useState(0);
  const [filterStatus, setFilterStatus] = useState<'all' | 'pending' | 'approved'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [pdfLoading, setPdfLoading] = useState(false);
  const [expandedEmployees, setExpandedEmployees] = useState<Set<string>>(new Set());
  const [bulkApproving, setBulkApproving] = useState<string | null>(null);
  const [adminNotes, setAdminNotes] = useState<Record<string, string>>({});
  const [showNotesModal, setShowNotesModal] = useState<string | null>(null);
  const [noteText, setNoteText] = useState('');
  const router = useRouter();
  const isRedirecting = useRef(false);

  const redirectToLogin = useCallback(() => {
    if (isRedirecting.current) return;
    isRedirecting.current = true;
    window.location.href = '/login';
  }, []);

  useEffect(() => {
    const currentUser = getCurrentUser();
    if (!currentUser || !isAdmin()) { router.push('/dashboard'); return; }
    setUser(currentUser);
  }, [router]);

  const { monday, sunday } = useMemo(() => getWeekBounds(weekOffset), [weekOffset]);

  const fetchTimecards = useCallback(async () => {
    if (isRedirecting.current) return;
    try {
      setLoading(true);
      const { data, error } = await supabase.auth.getSession();
      if (error || !data.session) { redirectToLogin(); return; }
      const session = data.session;

      const startDate = monday.toISOString().split('T')[0];
      const endDate = sunday.toISOString().split('T')[0];

      let url = `/api/admin/timecards?limit=200&startDate=${startDate}&endDate=${endDate}`;
      if (filterStatus === 'pending') url += '&pending=true';

      const response = await fetch(url, {
        headers: { 'Authorization': `Bearer ${session.access_token}` }
      });

      if (response.status === 401) { redirectToLogin(); return; }
      const result = await response.json();

      if (result.success) {
        let cards = result.data.timecards;
        if (filterStatus === 'approved') cards = cards.filter((tc: TimecardWithUser) => tc.is_approved);
        else if (filterStatus === 'pending') cards = cards.filter((tc: TimecardWithUser) => !tc.is_approved);
        setTimecards(cards);
      }
    } catch (error) {
      console.error('Error fetching timecards:', error);
    } finally {
      setLoading(false);
    }
  }, [monday, sunday, filterStatus, redirectToLogin]);

  useEffect(() => {
    if (user) fetchTimecards();
  }, [user, fetchTimecards]);

  // ── Actions ──────────────────────────────────────────
  const getSessionToken = async (): Promise<string | null> => {
    if (isRedirecting.current) return null;
    try {
      const { data, error } = await supabase.auth.getSession();
      if (error || !data.session) { redirectToLogin(); return null; }
      return data.session.access_token;
    } catch { redirectToLogin(); return null; }
  };

  const handleApprove = async (timecardId: string) => {
    try {
      const token = await getSessionToken();
      if (!token) return;
      const response = await fetch(`/api/admin/timecards/${timecardId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }
      });
      if (response.status === 401) { redirectToLogin(); return; }
      if (response.ok) fetchTimecards();
    } catch (error) {
      console.error('Error approving timecard:', error);
    }
  };

  const handleBulkApprove = async (userId: string) => {
    setBulkApproving(userId);
    try {
      const token = await getSessionToken();
      if (!token) return;
      const userTimecards = timecards.filter(tc => tc.user_id === userId && !tc.is_approved);
      for (const tc of userTimecards) {
        await fetch(`/api/admin/timecards/${tc.id}/approve`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }
        });
      }
      fetchTimecards();
    } catch (error) {
      console.error('Error bulk approving:', error);
    } finally {
      setBulkApproving(null);
    }
  };

  const openEditModal = (timecard: TimecardWithUser) => {
    setSelectedTimecard(timecard);
    setEditFormData({
      clock_in_time: timecard.clock_in_time,
      clock_out_time: timecard.clock_out_time || '',
      notes: timecard.notes || ''
    });
    setShowEditModal(true);
  };

  const handleUpdateTimecard = async () => {
    if (!selectedTimecard) return;
    try {
      const token = await getSessionToken();
      if (!token) return;
      const response = await fetch(`/api/admin/timecards/${selectedTimecard.id}/update`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(editFormData)
      });
      if (response.status === 401) { redirectToLogin(); return; }
      if (response.ok) { setShowEditModal(false); fetchTimecards(); }
      else { const error = await response.json(); alert(`Error: ${error.error}`); }
    } catch (error) {
      console.error('Error updating timecard:', error);
    }
  };

  const handleExportPDF = async () => {
    setPdfLoading(true);
    try {
      const totals = { total: totalHours, regular: weekdayHours - weeklyOTHours, weeklyOT: weeklyOTHours, mandatoryOT: mandatoryOTTotal, nightShift: nightShiftTotal, shopHours: shopHoursTotal };
      await generateWeeklyPDF(timecards, monday, sunday, totals);
    } catch (err) {
      console.error('PDF generation failed:', err);
    } finally {
      setPdfLoading(false);
    }
  };

  // ── Toggle expand ──────────────────────────────────
  const toggleEmployee = (userId: string) => {
    setExpandedEmployees(prev => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  };

  // ── Helpers ──────────────────────────────────────────
  const formatDate = (dateString: string) =>
    new Date(dateString).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

  const formatTime = (dateString: string) =>
    new Date(dateString).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

  // ── Calculated stats ──────────────────────────────────
  const filteredTimecards = searchQuery
    ? timecards.filter(tc =>
        tc.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        tc.email.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : timecards;

  const totalHours = timecards.reduce((sum, tc) => sum + (tc.total_hours || 0), 0);
  const pendingCount = timecards.filter(tc => !tc.is_approved).length;

  const mandatoryOTTotal = timecards
    .filter(tc => tc.hour_type === 'mandatory_overtime')
    .reduce((sum, tc) => sum + (tc.total_hours || 0), 0);

  const perEmployeeStats = useMemo(() => {
    const byUser: Record<string, { weekdayHours: number }> = {};
    timecards.forEach(tc => {
      if (!byUser[tc.user_id]) byUser[tc.user_id] = { weekdayHours: 0 };
      if (tc.hour_type !== 'mandatory_overtime') byUser[tc.user_id].weekdayHours += tc.total_hours || 0;
    });
    let totalWeekdayHours = 0;
    let totalWeeklyOT = 0;
    Object.values(byUser).forEach(({ weekdayHours: wh }) => {
      totalWeekdayHours += wh;
      totalWeeklyOT += Math.max(0, wh - 40);
    });
    return { totalWeekdayHours, totalWeeklyOT };
  }, [timecards]);

  const weekdayHours = perEmployeeStats.totalWeekdayHours;
  const weeklyOTHours = perEmployeeStats.totalWeeklyOT;
  const shopHoursTotal = timecards.filter(tc => tc.is_shop_hours).reduce((sum, tc) => sum + (tc.total_hours || 0), 0);
  const nightShiftTotal = timecards.filter(tc => tc.is_night_shift).reduce((sum, tc) => sum + (tc.total_hours || 0), 0);
  const uniqueEmployees = new Set(timecards.map(tc => tc.user_id)).size;
  const approvedCount = timecards.filter(tc => tc.is_approved).length;
  const activeClockIns = timecards.filter(tc => !tc.clock_out_time).length;

  // ── Group by employee ─────────────────────────────
  const employeeGroups: EmployeeGroup[] = useMemo(() => {
    const grouped: Record<string, TimecardWithUser[]> = {};
    filteredTimecards.forEach(tc => {
      if (!grouped[tc.user_id]) grouped[tc.user_id] = [];
      grouped[tc.user_id].push(tc);
    });

    return Object.entries(grouped).map(([userId, entries]) => {
      const weekdayHrs = entries.filter(e => e.hour_type !== 'mandatory_overtime').reduce((s, e) => s + (e.total_hours || 0), 0);
      const mandOT = entries.filter(e => e.hour_type === 'mandatory_overtime').reduce((s, e) => s + (e.total_hours || 0), 0);
      const nightHrs = entries.filter(e => e.is_night_shift).reduce((s, e) => s + (e.total_hours || 0), 0);
      const shopHrs = entries.filter(e => e.is_shop_hours).reduce((s, e) => s + (e.total_hours || 0), 0);
      const pending = entries.filter(e => !e.is_approved).length;
      const approved = entries.filter(e => e.is_approved).length;
      const hasActive = entries.some(e => !e.clock_out_time);

      return {
        userId,
        name: entries[0].full_name,
        email: entries[0].email,
        role: entries[0].role,
        entries: entries.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()),
        totalHours: entries.reduce((s, e) => s + (e.total_hours || 0), 0),
        regularHours: Math.min(weekdayHrs, 40),
        weeklyOT: Math.max(0, weekdayHrs - 40),
        mandatoryOT: mandOT,
        nightShift: nightHrs,
        shopHours: shopHrs,
        pendingCount: pending,
        approvedCount: approved,
        status: hasActive ? 'has_active' as const : pending > 0 ? 'has_pending' as const : 'all_approved' as const,
      };
    }).sort((a, b) => b.totalHours - a.totalHours);
  }, [filteredTimecards]);

  const getEntryBadges = (entry: TimecardWithUser) => {
    const badges: { label: string; color: string; icon: React.ReactNode }[] = [];
    if (entry.is_shop_hours) badges.push({ label: 'Shop', color: 'bg-amber-50 text-amber-700 border-amber-200', icon: <Factory size={10} /> });
    if (entry.is_night_shift) badges.push({ label: 'Night', color: 'bg-indigo-50 text-indigo-700 border-indigo-200', icon: <Moon size={10} /> });
    if (entry.hour_type === 'mandatory_overtime') badges.push({ label: 'Wknd OT', color: 'bg-red-50 text-red-700 border-red-200', icon: <AlertTriangle size={10} /> });
    return badges;
  };

  // ── Loading state ──────────────────────────────────
  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-14 h-14 mx-auto mb-4 relative">
            <div className="absolute inset-0 rounded-full border-4 border-blue-100"></div>
            <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-blue-600 animate-spin"></div>
          </div>
          <p className="text-slate-500 text-sm font-medium">Loading timecards...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f8fafc]">
      {/* ── Header ─────────────────────────────────────── */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-xl border-b border-slate-200/60 shadow-sm">
        <div className="max-w-[1440px] mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              href="/dashboard/admin"
              className="flex items-center gap-2 px-3 py-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-all text-sm font-medium"
            >
              <ArrowLeft size={16} />
              <span className="hidden sm:inline">Admin</span>
            </Link>
            <div className="h-6 w-px bg-slate-200" />
            <h1 className="text-lg font-bold text-slate-900 flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-600 to-blue-700 flex items-center justify-center shadow-sm">
                <Clock size={16} className="text-white" />
              </div>
              Timecard Management
            </h1>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                const mondayStr = monday.toISOString().split('T')[0];
                window.open(`/api/admin/timecards/export?weekStart=${mondayStr}&format=csv`, '_blank');
              }}
              disabled={timecards.length === 0}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold transition-all ${
                timecards.length === 0
                  ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                  : 'bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 shadow-sm hover:shadow'
              }`}
              title="Export CSV"
            >
              <FileText size={15} />
              <span className="hidden sm:inline">CSV</span>
            </button>

            <button
              onClick={() => {
                const mondayStr = monday.toISOString().split('T')[0];
                window.open(`/api/admin/timecards/export?weekStart=${mondayStr}&format=pdf`, '_blank');
              }}
              disabled={timecards.length === 0}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold transition-all ${
                timecards.length === 0
                  ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                  : 'bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 shadow-sm hover:shadow'
              }`}
              title="Export All PDF"
            >
              <Download size={15} />
              <span className="hidden sm:inline">PDF</span>
            </button>

            <button
              onClick={handleExportPDF}
              disabled={pdfLoading || timecards.length === 0}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                pdfLoading || timecards.length === 0
                  ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                  : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white shadow-md hover:shadow-lg'
              }`}
            >
              {pdfLoading ? (
                <><Loader2 size={15} className="animate-spin" /> Generating...</>
              ) : (
                <><Download size={15} /> <span className="hidden sm:inline">Quick PDF</span></>
              )}
            </button>

            <div className="hidden sm:flex items-center gap-2.5 pl-3 border-l border-slate-200">
              <div className="w-8 h-8 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-full flex items-center justify-center text-white font-bold text-xs shadow-sm">
                {user?.name?.charAt(0) || 'A'}
              </div>
              <div className="text-right">
                <p className="text-sm font-semibold text-slate-800 leading-tight">{user?.name}</p>
                <p className="text-[11px] text-slate-400 font-medium">Admin</p>
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-[1440px] mx-auto px-6 py-6">
        {/* ── Week Navigation ───────────────────────────── */}
        <div className="mb-5 flex items-center justify-between">
          <button
            onClick={() => setWeekOffset(weekOffset - 1)}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-white hover:bg-slate-50 text-slate-600 rounded-lg transition-all text-sm font-medium border border-slate-200 shadow-sm hover:shadow"
          >
            <ChevronLeft size={16} />
            <span className="hidden sm:inline">Prev Week</span>
          </button>

          <div className="text-center">
            <p className="text-base font-bold text-slate-900">{formatWeekRange(monday, sunday)}</p>
            <p className="text-xs text-slate-400 mt-0.5">
              {weekOffset === 0 ? 'Current Week' : `${Math.abs(weekOffset)} ${Math.abs(weekOffset) === 1 ? 'week' : 'weeks'} ${weekOffset < 0 ? 'ago' : 'ahead'}`}
            </p>
          </div>

          <button
            onClick={() => setWeekOffset(weekOffset + 1)}
            disabled={weekOffset >= 0}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg transition-all text-sm font-medium border shadow-sm ${
              weekOffset >= 0
                ? 'bg-slate-50 text-slate-300 border-slate-100 cursor-not-allowed'
                : 'bg-white hover:bg-slate-50 text-slate-600 border-slate-200 hover:shadow'
            }`}
          >
            <span className="hidden sm:inline">Next Week</span>
            <ChevronRight size={16} />
          </button>
        </div>

        {/* ── Summary Cards ──────────────────────────────── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
          {/* Total Hours */}
          <div className="col-span-2 lg:col-span-1 bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-800 rounded-xl p-5 text-white shadow-lg relative overflow-hidden">
            <div className="absolute top-0 right-0 w-24 h-24 bg-white/5 rounded-full -translate-y-6 translate-x-6" />
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp size={15} className="text-blue-200" />
              <span className="text-xs font-semibold text-blue-200 uppercase tracking-wider">Total Hours</span>
            </div>
            <p className="text-3xl font-bold tracking-tight">{totalHours.toFixed(1)}</p>
            <div className="mt-3 h-1.5 bg-white/15 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-700 ${
                  weeklyOTHours > 0 ? 'bg-gradient-to-r from-green-300 via-yellow-300 to-red-400' : 'bg-blue-300'
                }`}
                style={{ width: `${Math.min((totalHours / 60) * 100, 100)}%` }}
              />
            </div>
            <p className="text-[10px] text-blue-300 mt-1">
              {weeklyOTHours > 0 ? `${weeklyOTHours.toFixed(1)} hrs OT across ${uniqueEmployees} employees` : `${uniqueEmployees} employees tracked`}
            </p>
          </div>

          {/* Pending Approvals */}
          <div className="bg-white rounded-xl p-4 border border-slate-200/60 shadow-sm hover:shadow transition-shadow">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Pending</span>
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${pendingCount > 0 ? 'bg-amber-50' : 'bg-emerald-50'}`}>
                {pendingCount > 0 ? <Clock size={15} className="text-amber-600" /> : <CheckCircle size={15} className="text-emerald-600" />}
              </div>
            </div>
            <p className={`text-2xl font-bold ${pendingCount > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>{pendingCount}</p>
            <p className="text-[11px] text-slate-400 mt-0.5">{approvedCount} approved of {timecards.length}</p>
          </div>

          {/* OT Alerts */}
          <div className="bg-white rounded-xl p-4 border border-slate-200/60 shadow-sm hover:shadow transition-shadow">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Overtime</span>
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${(weeklyOTHours + mandatoryOTTotal) > 0 ? 'bg-orange-50' : 'bg-slate-50'}`}>
                <AlertTriangle size={15} className={(weeklyOTHours + mandatoryOTTotal) > 0 ? 'text-orange-500' : 'text-slate-400'} />
              </div>
            </div>
            <p className={`text-2xl font-bold ${(weeklyOTHours + mandatoryOTTotal) > 0 ? 'text-orange-600' : 'text-slate-900'}`}>{(weeklyOTHours + mandatoryOTTotal).toFixed(1)}<span className="text-sm font-normal text-slate-400 ml-0.5">hrs</span></p>
            <p className="text-[11px] text-slate-400 mt-0.5">{weeklyOTHours.toFixed(1)} weekly + {mandatoryOTTotal.toFixed(1)} mandatory</p>
          </div>

          {/* Active Clock-Ins */}
          <div className="bg-white rounded-xl p-4 border border-slate-200/60 shadow-sm hover:shadow transition-shadow">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Active Now</span>
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${activeClockIns > 0 ? 'bg-emerald-50' : 'bg-slate-50'}`}>
                <Zap size={15} className={activeClockIns > 0 ? 'text-emerald-600' : 'text-slate-400'} />
              </div>
            </div>
            <p className={`text-2xl font-bold ${activeClockIns > 0 ? 'text-emerald-600' : 'text-slate-900'}`}>{activeClockIns}</p>
            <p className="text-[11px] text-slate-400 mt-0.5">Currently clocked in</p>
          </div>
        </div>

        {/* ── Category Breakdown ─────────────────────────── */}
        <div className="grid grid-cols-3 lg:grid-cols-5 gap-3 mb-5">
          {[
            { label: 'Regular', value: (weekdayHours - weeklyOTHours).toFixed(1), icon: <CheckCircle size={14} />, color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-100' },
            { label: 'Weekly OT', value: weeklyOTHours.toFixed(1), icon: <TrendingUp size={14} />, color: 'text-orange-600', bg: 'bg-orange-50', border: 'border-orange-100' },
            { label: 'Mandatory OT', value: mandatoryOTTotal.toFixed(1), icon: <Briefcase size={14} />, color: 'text-red-600', bg: 'bg-red-50', border: 'border-red-100' },
            { label: 'Night Shift', value: nightShiftTotal.toFixed(1), icon: <Moon size={14} />, color: 'text-indigo-600', bg: 'bg-indigo-50', border: 'border-indigo-100' },
            { label: 'Shop Hours', value: shopHoursTotal.toFixed(1), icon: <Factory size={14} />, color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-100' },
          ].map(({ label, value, icon, color, bg, border }) => (
            <div key={label} className={`flex items-center gap-3 px-3.5 py-2.5 rounded-lg border ${border} ${bg}`}>
              <div className={color}>{icon}</div>
              <div>
                <p className={`text-sm font-bold ${color}`}>{value}<span className="text-[10px] font-normal ml-0.5">hrs</span></p>
                <p className="text-[10px] text-slate-500 font-medium">{label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* ── Filters ────────────────────────────────────── */}
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <div className="flex gap-1 bg-white rounded-lg p-1 border border-slate-200/60 shadow-sm">
            {(['all', 'pending', 'approved'] as const).map((status) => (
              <button
                key={status}
                onClick={() => setFilterStatus(status)}
                className={`px-3.5 py-1.5 rounded-md text-xs font-semibold transition-all ${
                  filterStatus === status
                    ? status === 'pending'
                      ? 'bg-amber-500 text-white shadow-sm'
                      : status === 'approved'
                        ? 'bg-emerald-600 text-white shadow-sm'
                        : 'bg-slate-800 text-white shadow-sm'
                    : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
                }`}
              >
                {status === 'all' ? `All (${timecards.length})` : status === 'pending' ? `Pending (${pendingCount})` : `Approved (${approvedCount})`}
              </button>
            ))}
          </div>

          <div className="relative flex-1 min-w-[180px] max-w-xs">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search employee..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200/60 rounded-lg text-sm text-slate-800 placeholder-slate-400 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 shadow-sm transition-all"
            />
          </div>

          <button
            onClick={() => {
              if (expandedEmployees.size === employeeGroups.length) setExpandedEmployees(new Set());
              else setExpandedEmployees(new Set(employeeGroups.map(g => g.userId)));
            }}
            className="flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-slate-50 text-slate-600 rounded-lg text-xs font-semibold border border-slate-200/60 shadow-sm transition-all"
          >
            {expandedEmployees.size === employeeGroups.length ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            {expandedEmployees.size === employeeGroups.length ? 'Collapse All' : 'Expand All'}
          </button>
        </div>

        {/* ── Employee List (Expandable Rows) ────────────── */}
        <div className="space-y-3">
          {loading ? (
            <div className="bg-white rounded-xl border border-slate-200/60 shadow-sm p-16 text-center">
              <div className="w-10 h-10 mx-auto mb-3 relative">
                <div className="absolute inset-0 rounded-full border-[3px] border-slate-100"></div>
                <div className="absolute inset-0 rounded-full border-[3px] border-transparent border-t-blue-600 animate-spin"></div>
              </div>
              <p className="text-slate-400 text-sm">Loading timecards...</p>
            </div>
          ) : employeeGroups.length === 0 ? (
            <div className="bg-white rounded-xl border border-slate-200/60 shadow-sm p-16 text-center">
              <div className="w-16 h-16 bg-slate-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Clock className="text-slate-300" size={28} />
              </div>
              <p className="text-slate-600 font-semibold">No timecards found</p>
              <p className="text-slate-400 text-sm mt-1">Try a different week or filter</p>
            </div>
          ) : (
            employeeGroups.map((group) => {
              const isExpanded = expandedEmployees.has(group.userId);
              const statusColor = group.status === 'all_approved'
                ? 'border-l-emerald-400'
                : group.status === 'has_active'
                  ? 'border-l-blue-500'
                  : 'border-l-amber-400';

              return (
                <div key={group.userId} className={`bg-white rounded-xl border border-slate-200/60 shadow-sm overflow-hidden border-l-[3px] ${statusColor} transition-all`}>
                  {/* Employee Row Header */}
                  <button
                    onClick={() => toggleEmployee(group.userId)}
                    className="w-full px-5 py-4 flex items-center gap-4 hover:bg-slate-50/60 transition-colors text-left"
                  >
                    {/* Avatar */}
                    <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0 shadow-sm">
                      {group.name?.charAt(0) || '?'}
                    </div>

                    {/* Name & meta */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-bold text-slate-800 truncate">{group.name}</p>
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-slate-100 text-slate-500 uppercase">
                          {group.role.replace(/_/g, ' ')}
                        </span>
                        {/* Status badge */}
                        {group.status === 'has_active' && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-600 border border-emerald-200">
                            <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                            Active
                          </span>
                        )}
                        {group.status === 'has_pending' && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-600 border border-amber-200">
                            <Clock size={10} />
                            {group.pendingCount} Pending
                          </span>
                        )}
                        {group.status === 'all_approved' && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-600 border border-emerald-200">
                            <CheckCircle size={10} />
                            Approved
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-400 mt-0.5">{group.entries.length} entries this week</p>
                    </div>

                    {/* Hours summary (desktop) */}
                    <div className="hidden lg:flex items-center gap-4">
                      <div className="text-right">
                        <p className="text-lg font-bold text-slate-900 tabular-nums">{group.totalHours.toFixed(1)}<span className="text-xs font-normal text-slate-400 ml-0.5">hrs</span></p>
                      </div>
                      {group.weeklyOT > 0 && (
                        <span className="px-2 py-1 rounded-md text-[10px] font-bold bg-orange-50 text-orange-600 border border-orange-200">
                          +{group.weeklyOT.toFixed(1)} OT
                        </span>
                      )}
                      {group.mandatoryOT > 0 && (
                        <span className="px-2 py-1 rounded-md text-[10px] font-bold bg-red-50 text-red-600 border border-red-200">
                          +{group.mandatoryOT.toFixed(1)} Mand
                        </span>
                      )}
                    </div>

                    {/* Mobile hours */}
                    <div className="lg:hidden text-right">
                      <p className="text-base font-bold text-slate-900 tabular-nums">{group.totalHours.toFixed(1)}</p>
                      <p className="text-[10px] text-slate-400">hrs</p>
                    </div>

                    {/* Expand arrow */}
                    <div className={`transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}>
                      <ChevronDown size={18} className="text-slate-400" />
                    </div>
                  </button>

                  {/* Expanded: Daily Breakdown */}
                  {isExpanded && (
                    <div className="border-t border-slate-100">
                      {/* Employee hour type breakdown */}
                      <div className="px-5 py-3 bg-slate-50/60 flex flex-wrap items-center gap-3">
                        {[
                          { label: 'Regular', value: group.regularHours, color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-200' },
                          { label: 'Weekly OT', value: group.weeklyOT, color: 'text-orange-600', bg: 'bg-orange-50', border: 'border-orange-200' },
                          { label: 'Mand OT', value: group.mandatoryOT, color: 'text-red-600', bg: 'bg-red-50', border: 'border-red-200' },
                          { label: 'Night', value: group.nightShift, color: 'text-indigo-600', bg: 'bg-indigo-50', border: 'border-indigo-200' },
                          { label: 'Shop', value: group.shopHours, color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-200' },
                        ].filter(x => x.value > 0).map(({ label, value, color, bg, border }) => (
                          <span key={label} className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-bold ${bg} ${color} border ${border}`}>
                            {label}: {value.toFixed(1)}h
                          </span>
                        ))}

                        {/* Bulk actions */}
                        <div className="ml-auto flex items-center gap-2">
                          <button
                            onClick={(e) => { e.stopPropagation(); setShowNotesModal(group.userId); setNoteText(adminNotes[group.userId] || ''); }}
                            className="flex items-center gap-1 px-2 py-1 bg-white hover:bg-slate-100 text-slate-600 rounded-md text-[11px] font-semibold border border-slate-200 transition-colors"
                          >
                            <StickyNote size={11} />
                            Notes
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              const mondayStr = monday.toISOString().split('T')[0];
                              window.open(`/api/admin/timecards/${group.userId}/pdf?weekStart=${mondayStr}`, '_blank');
                            }}
                            className="flex items-center gap-1 px-2 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-md text-[11px] font-semibold border border-blue-200/60 transition-colors"
                          >
                            <FileText size={11} />
                            PDF
                          </button>
                          {group.pendingCount > 0 && (
                            <button
                              onClick={(e) => { e.stopPropagation(); handleBulkApprove(group.userId); }}
                              disabled={bulkApproving === group.userId}
                              className="flex items-center gap-1 px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-md text-[11px] font-semibold transition-colors disabled:opacity-50"
                            >
                              {bulkApproving === group.userId ? <Loader2 size={11} className="animate-spin" /> : <Shield size={11} />}
                              Approve All ({group.pendingCount})
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Daily entries table */}
                      <div className="overflow-x-auto">
                        <table className="w-full">
                          <thead>
                            <tr className="bg-slate-50/50 border-b border-slate-100">
                              <th className="px-5 py-2.5 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Date</th>
                              <th className="px-4 py-2.5 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Clock In</th>
                              <th className="px-4 py-2.5 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Clock Out</th>
                              <th className="px-4 py-2.5 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Hours</th>
                              <th className="px-4 py-2.5 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Category</th>
                              <th className="px-4 py-2.5 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Location</th>
                              <th className="px-4 py-2.5 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Status</th>
                              <th className="px-4 py-2.5 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Actions</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-50">
                            {group.entries.map((entry) => {
                              const badges = getEntryBadges(entry);
                              return (
                                <tr key={entry.id} className={`group transition-colors hover:bg-blue-50/40 ${
                                  entry.hour_type === 'mandatory_overtime' ? 'bg-red-50/20' : ''
                                }`}>
                                  <td className="px-5 py-3 whitespace-nowrap">
                                    <span className="text-sm text-slate-700 font-medium">{formatDate(entry.date)}</span>
                                  </td>
                                  <td className="px-4 py-3 whitespace-nowrap">
                                    <span className="text-sm font-medium text-slate-700 tabular-nums">{formatTime(entry.clock_in_time)}</span>
                                  </td>
                                  <td className="px-4 py-3 whitespace-nowrap">
                                    {entry.clock_out_time ? (
                                      <span className="text-sm font-medium text-slate-700 tabular-nums">{formatTime(entry.clock_out_time)}</span>
                                    ) : (
                                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-600 border border-emerald-200">
                                        <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                                        Active
                                      </span>
                                    )}
                                  </td>
                                  <td className="px-4 py-3 whitespace-nowrap">
                                    {entry.total_hours !== null ? (
                                      <span className="text-sm font-bold tabular-nums text-slate-800">{entry.total_hours.toFixed(2)}</span>
                                    ) : (
                                      <span className="text-sm text-slate-300">&mdash;</span>
                                    )}
                                  </td>
                                  <td className="px-4 py-3">
                                    <div className="flex flex-wrap gap-1">
                                      {badges.length > 0 ? badges.map((badge, bidx) => (
                                        <span key={bidx} className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold border ${badge.color}`}>
                                          {badge.icon}{badge.label}
                                        </span>
                                      )) : (
                                        <span className="text-[10px] text-slate-400 font-medium">Regular</span>
                                      )}
                                    </div>
                                  </td>
                                  <td className="px-4 py-3">
                                    {entry.clock_in_latitude && entry.clock_in_longitude ? (
                                      <button
                                        onClick={() => { setSelectedTimecard(entry); setShowMapModal(true); }}
                                        className="flex items-center gap-1 px-2 py-1 bg-blue-50 hover:bg-blue-100 text-blue-600 rounded-md transition-colors text-[11px] font-semibold border border-blue-200/60"
                                      >
                                        <MapPin size={11} />
                                        Map
                                      </button>
                                    ) : (
                                      <span className="text-[10px] text-slate-300">No GPS</span>
                                    )}
                                  </td>
                                  <td className="px-4 py-3 whitespace-nowrap">
                                    {entry.is_approved ? (
                                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-600 border border-emerald-200">
                                        <CheckCircle size={10} />
                                        Approved
                                      </span>
                                    ) : (
                                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-600 border border-amber-200">
                                        <Clock size={10} />
                                        Pending
                                      </span>
                                    )}
                                  </td>
                                  <td className="px-4 py-3">
                                    <div className="flex items-center gap-1.5 opacity-80 group-hover:opacity-100 transition-opacity">
                                      <button
                                        onClick={() => openEditModal(entry)}
                                        className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md text-[11px] font-semibold transition-colors flex items-center gap-1"
                                      >
                                        <Edit size={11} />
                                        Edit
                                      </button>
                                      {!entry.is_approved && (
                                        <button
                                          onClick={() => handleApprove(entry.id)}
                                          className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-md text-[11px] font-semibold transition-colors"
                                        >
                                          Approve
                                        </button>
                                      )}
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>

                      {/* Notes for this employee */}
                      {adminNotes[group.userId] && (
                        <div className="px-5 py-3 bg-amber-50/50 border-t border-amber-100 flex items-start gap-2">
                          <MessageSquare size={13} className="text-amber-600 mt-0.5 flex-shrink-0" />
                          <p className="text-xs text-amber-800">{adminNotes[group.userId]}</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* ── Legend ──────────────────────────────────────── */}
        <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 px-2 py-3 text-[11px] text-slate-500">
          {[
            { color: 'bg-emerald-500', label: 'Approved' },
            { color: 'bg-amber-500', label: 'Pending' },
            { color: 'bg-red-500', label: 'Weekend/Mandatory OT' },
            { color: 'bg-orange-500', label: 'Weekly OT (>40 hrs)' },
            { color: 'bg-slate-400', label: 'Time Off' },
          ].map(({ color, label }) => (
            <div key={label} className="flex items-center gap-1.5">
              <span className={`w-2 h-2 ${color} rounded-full`} />
              <span>{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ══════════════════════════════════════════════════
          EDIT MODAL
          ══════════════════════════════════════════════════ */}
      {showEditModal && selectedTimecard && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full border border-slate-200">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center">
                    <Edit size={14} className="text-blue-600" />
                  </div>
                  Edit Timecard
                </h3>
                <p className="text-xs text-slate-400 mt-1 ml-9">
                  {selectedTimecard.full_name} &middot; {formatDate(selectedTimecard.date)}
                </p>
              </div>
              <button onClick={() => setShowEditModal(false)} className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors">
                <XCircle size={18} className="text-slate-400" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Clock In Time</label>
                <input
                  type="datetime-local"
                  value={editFormData.clock_in_time ? new Date(editFormData.clock_in_time).toISOString().slice(0, 16) : ''}
                  onChange={(e) => setEditFormData({ ...editFormData, clock_in_time: e.target.value ? new Date(e.target.value).toISOString() : '' })}
                  className="w-full px-3.5 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 text-sm text-slate-800 bg-white transition-all"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Clock Out Time</label>
                <input
                  type="datetime-local"
                  value={editFormData.clock_out_time ? new Date(editFormData.clock_out_time).toISOString().slice(0, 16) : ''}
                  onChange={(e) => setEditFormData({ ...editFormData, clock_out_time: e.target.value ? new Date(e.target.value).toISOString() : '' })}
                  className="w-full px-3.5 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 text-sm text-slate-800 bg-white transition-all"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Notes</label>
                <textarea
                  value={editFormData.notes}
                  onChange={(e) => setEditFormData({ ...editFormData, notes: e.target.value })}
                  rows={3}
                  placeholder="Add any notes..."
                  className="w-full px-3.5 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 text-sm text-slate-800 bg-white resize-none placeholder-slate-400 transition-all"
                />
              </div>

              <div className="flex gap-2.5 pt-1">
                <button onClick={() => setShowEditModal(false)} className="flex-1 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-semibold text-sm transition-colors">
                  Cancel
                </button>
                <button onClick={handleUpdateTimecard} className="flex-1 px-4 py-2 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white rounded-lg font-semibold text-sm transition-all shadow-md">
                  Save Changes
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════
          MAP MODAL
          ══════════════════════════════════════════════════ */}
      {showMapModal && selectedTimecard && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-auto border border-slate-200">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center">
                    <MapPin size={14} className="text-blue-600" />
                  </div>
                  Clock Locations
                </h3>
                <p className="text-xs text-slate-400 mt-1 ml-9">
                  {selectedTimecard.full_name} &middot; {formatDate(selectedTimecard.date)}
                </p>
              </div>
              <button onClick={() => setShowMapModal(false)} className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors">
                <XCircle size={18} className="text-slate-400" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {selectedTimecard.clock_in_latitude && selectedTimecard.clock_in_longitude && (
                <div className="bg-blue-50/60 border border-blue-200/60 rounded-xl p-4">
                  <div className="flex items-center gap-2.5 mb-3">
                    <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center shadow-sm">
                      <MapPin size={14} className="text-white" />
                    </div>
                    <div>
                      <p className="font-bold text-slate-800 text-sm">Clock In</p>
                      <p className="text-[11px] text-slate-500">{formatTime(selectedTimecard.clock_in_time)}</p>
                    </div>
                  </div>
                  <p className="text-xs text-slate-500 mb-3 font-mono bg-white/60 px-2 py-1 rounded">
                    {selectedTimecard.clock_in_latitude.toFixed(6)}, {selectedTimecard.clock_in_longitude.toFixed(6)}
                  </p>
                  <a
                    href={getGoogleMapsLink(selectedTimecard.clock_in_latitude, selectedTimecard.clock_in_longitude)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors text-xs font-semibold shadow-sm"
                  >
                    <ExternalLink size={12} />
                    Open in Google Maps
                  </a>
                </div>
              )}

              {selectedTimecard.clock_out_latitude && selectedTimecard.clock_out_longitude && (
                <div className="bg-red-50/60 border border-red-200/60 rounded-xl p-4">
                  <div className="flex items-center gap-2.5 mb-3">
                    <div className="w-8 h-8 bg-red-600 rounded-lg flex items-center justify-center shadow-sm">
                      <MapPin size={14} className="text-white" />
                    </div>
                    <div>
                      <p className="font-bold text-slate-800 text-sm">Clock Out</p>
                      <p className="text-[11px] text-slate-500">
                        {selectedTimecard.clock_out_time ? formatTime(selectedTimecard.clock_out_time) : 'Still active'}
                      </p>
                    </div>
                  </div>
                  <p className="text-xs text-slate-500 mb-3 font-mono bg-white/60 px-2 py-1 rounded">
                    {selectedTimecard.clock_out_latitude.toFixed(6)}, {selectedTimecard.clock_out_longitude.toFixed(6)}
                  </p>
                  <a
                    href={getGoogleMapsLink(selectedTimecard.clock_out_latitude, selectedTimecard.clock_out_longitude)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors text-xs font-semibold shadow-sm"
                  >
                    <ExternalLink size={12} />
                    Open in Google Maps
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════
          ADMIN NOTES MODAL
          ══════════════════════════════════════════════════ */}
      {showNotesModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full border border-slate-200">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-amber-50 flex items-center justify-center">
                  <MessageSquare size={14} className="text-amber-600" />
                </div>
                Admin Notes
              </h3>
              <button onClick={() => setShowNotesModal(null)} className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors">
                <X size={18} className="text-slate-400" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <textarea
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                rows={4}
                placeholder="Add notes about late arrivals, no-shows, issues..."
                className="w-full px-3.5 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-amber-500/20 focus:border-amber-400 text-sm text-slate-800 bg-white resize-none placeholder-slate-400 transition-all"
              />
              <div className="flex gap-2.5">
                <button onClick={() => setShowNotesModal(null)} className="flex-1 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-semibold text-sm transition-colors">
                  Cancel
                </button>
                <button
                  onClick={() => {
                    if (showNotesModal) {
                      setAdminNotes(prev => ({ ...prev, [showNotesModal]: noteText }));
                      setShowNotesModal(null);
                    }
                  }}
                  className="flex-1 px-4 py-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white rounded-lg font-semibold text-sm transition-all shadow-md"
                >
                  Save Note
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
