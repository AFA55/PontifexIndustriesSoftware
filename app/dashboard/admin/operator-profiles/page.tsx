'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import {
  ChevronLeft, Users, UserPlus, Search, Mail, Phone, Calendar,
  Loader2, CheckCircle, XCircle, Star, Briefcase, Clock, TrendingUp,
  FileText, MessageSquare, DollarSign, ChevronRight, Plus,
  AlertTriangle, Award, Shield, X, Trash2, ChevronDown,
  BarChart3, Hash, MapPin, Filter
} from 'lucide-react';
import { getCurrentUser } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import AddProfileModal from './_components/AddProfileModal';

// Dynamic import for Recharts (SSR issues)
const BarChart = dynamic(() => import('recharts').then(m => m.BarChart), { ssr: false });
const Bar = dynamic(() => import('recharts').then(m => m.Bar), { ssr: false });
const XAxis = dynamic(() => import('recharts').then(m => m.XAxis), { ssr: false });
const YAxis = dynamic(() => import('recharts').then(m => m.YAxis), { ssr: false });
const Tooltip = dynamic(() => import('recharts').then(m => m.Tooltip), { ssr: false });
const ResponsiveContainer = dynamic(() => import('recharts').then(m => m.ResponsiveContainer), { ssr: false });

// ── Types ───────────────────────────────────────────────────
interface Profile {
  id: string;
  full_name: string;
  nickname: string | null;
  email: string;
  phone: string | null;
  phone_number: string | null;
  date_of_birth: string | null;
  role: string;
  active: boolean;
  profile_picture_url: string | null;
  created_at: string;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  emergency_contact_relationship: string | null;
}

interface OperatorHistory {
  profile: Profile & {
    hire_date?: string | null;
    hourly_rate?: number | null;
    skill_level?: string | null;
    tasks_qualified_for?: string[] | null;
    equipment_qualified_for?: string[] | null;
    overall_rating_avg?: number | null;
    total_ratings_received?: number | null;
  };
  stats: {
    total_jobs: number;
    total_hours: number;
    total_revenue: number;
    avg_rating: number;
    total_ratings: number;
    on_time_rate: number;
    jobs_this_month: number;
    hours_this_month: number;
    // Fallback for original API shape
    totalJobs?: number;
    completedJobs?: number;
    totalHours?: number;
    onTimePercent?: number;
  };
  job_history: JobRecord[];
  monthly_performance: { month: string; jobs_completed: number; hours_worked: number }[];
  certifications?: { name: string; expiry_date: string | null; is_expired: boolean }[];
  skills?: { task: string; proficiency: string }[];
  pay_history?: { effective_date: string; hourly_rate: number | null; reason: string | null }[];
  // Fallback for original API shape
  jobHistory?: JobRecord[];
  monthlyPerformance?: { month: string; jobs: number; hours: number }[];
}

interface JobRecord {
  id: string;
  job_number: string;
  customer_name: string;
  job_type: string;
  location: string | null;
  status: string;
  scheduled_date: string | null;
  end_date: string | null;
  work_completed_at: string | null;
  estimated_duration: number | null;
}

interface OperatorNote {
  id: string;
  operator_id: string;
  author_id: string;
  note_type: string;
  title: string;
  content: string;
  is_private: boolean;
  created_at: string;
  author_name?: string;
  author_email?: string | null;
  author?: { full_name: string; email: string } | null;
}

interface Timecard {
  id: string;
  date: string;
  clock_in_time: string;
  clock_out_time: string | null;
  total_hours: number | null;
  is_approved: boolean;
  is_shop_hours: boolean;
  is_night_shift: boolean;
  hour_type: string;
}

// ── Helpers ─────────────────────────────────────────────────
async function getToken() {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token || '';
}

async function apiFetch(url: string, opts?: RequestInit) {
  const token = await getToken();
  return fetch(url, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...opts?.headers,
    },
  });
}

const ROLE_COLORS: Record<string, { bg: string; text: string; avatar: string }> = {
  operator: { bg: 'bg-blue-50', text: 'text-blue-700', avatar: 'from-blue-500 to-blue-700' },
  apprentice: { bg: 'bg-teal-50', text: 'text-teal-700', avatar: 'from-teal-500 to-teal-700' },
  shop_manager: { bg: 'bg-amber-50', text: 'text-amber-700', avatar: 'from-amber-500 to-amber-700' },
  admin: { bg: 'bg-purple-50', text: 'text-purple-700', avatar: 'from-purple-500 to-purple-700' },
};

const NOTE_TYPE_CONFIG: Record<string, { label: string; color: string; icon: typeof Star }> = {
  general: { label: 'General', color: 'bg-gray-100 text-gray-700', icon: MessageSquare },
  performance_review: { label: 'Performance', color: 'bg-blue-100 text-blue-700', icon: BarChart3 },
  incident: { label: 'Incident', color: 'bg-red-100 text-red-700', icon: AlertTriangle },
  commendation: { label: 'Commendation', color: 'bg-green-100 text-green-700', icon: Award },
  warning: { label: 'Warning', color: 'bg-amber-100 text-amber-700', icon: AlertTriangle },
  training: { label: 'Training', color: 'bg-purple-100 text-purple-700', icon: Briefcase },
};

function formatDate(d: string | null) {
  if (!d) return '--';
  return new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatShortDate(d: string | null) {
  if (!d) return '--';
  return new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

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

function statusColor(status: string) {
  switch (status) {
    case 'completed': return 'bg-green-50 text-green-700 border-green-200';
    case 'in_progress': return 'bg-blue-50 text-blue-700 border-blue-200';
    case 'scheduled': case 'assigned': return 'bg-purple-50 text-purple-700 border-purple-200';
    case 'cancelled': return 'bg-red-50 text-red-700 border-red-200';
    default: return 'bg-gray-50 text-gray-700 border-gray-200';
  }
}

// ── Main Component ──────────────────────────────────────────
export default function OperatorProfilesPage() {
  const router = useRouter();
  const [currentUserRole, setCurrentUserRole] = useState<string>('');
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Detail state
  const [detailTab, setDetailTab] = useState<'overview' | 'jobs' | 'timecards' | 'notes' | 'pay'>('overview');
  const [history, setHistory] = useState<OperatorHistory | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [notes, setNotes] = useState<OperatorNote[]>([]);
  const [notesLoading, setNotesLoading] = useState(false);
  const [showAddNote, setShowAddNote] = useState(false);

  // Timecard state
  const [weekOffset, setWeekOffset] = useState(0);
  const [timecards, setTimecards] = useState<Timecard[]>([]);
  const [timecardsLoading, setTimecardsLoading] = useState(false);

  // Job filter state
  const [jobStatusFilter, setJobStatusFilter] = useState<string>('all');

  // Auth guard
  useEffect(() => {
    const currentUser = getCurrentUser();
    if (!currentUser) { router.push('/login'); return; }
    const role = currentUser.role || '';
    if (!['admin', 'super_admin', 'operations_manager'].includes(role)) {
      router.push('/dashboard');
      return;
    }
    setCurrentUserRole(role);
  }, [router]);

  // Fetch profiles list
  const fetchProfiles = useCallback(async () => {
    try {
      const res = await apiFetch('/api/admin/profiles');
      if (res.ok) {
        const json = await res.json();
        setProfiles(json.data || []);
      }
    } catch (err) {
      console.error('Failed to fetch profiles:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchProfiles(); }, [fetchProfiles]);

  // Fetch detail when selected
  const fetchDetail = useCallback(async (id: string) => {
    setDetailLoading(true);
    setHistory(null);
    try {
      const res = await apiFetch(`/api/admin/operators/${id}/history`);
      if (res.ok) {
        const json = await res.json();
        // Normalize: ensure both snake_case and camelCase fields exist for compat
        const d = json.data;
        if (d) {
          if (!d.jobHistory && d.job_history) d.jobHistory = d.job_history;
          if (!d.job_history && d.jobHistory) d.job_history = d.jobHistory;
          if (!d.monthlyPerformance && d.monthly_performance) d.monthlyPerformance = d.monthly_performance;
          if (!d.monthly_performance && d.monthlyPerformance) d.monthly_performance = d.monthlyPerformance;
          if (d.stats) {
            if (d.stats.total_jobs != null && d.stats.totalJobs == null) d.stats.totalJobs = d.stats.total_jobs;
            if (d.stats.on_time_rate != null && d.stats.onTimePercent == null) d.stats.onTimePercent = d.stats.on_time_rate;
            if (d.stats.total_hours != null && d.stats.totalHours == null) d.stats.totalHours = d.stats.total_hours;
          }
        }
        setHistory(d);
      }
    } catch (err) {
      console.error('Failed to fetch operator history:', err);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  // Fetch notes
  const fetchNotes = useCallback(async (id: string) => {
    setNotesLoading(true);
    try {
      const res = await apiFetch(`/api/admin/operators/${id}/notes`);
      if (res.ok) {
        const json = await res.json();
        setNotes(json.data || []);
      }
    } catch (err) {
      console.error('Failed to fetch notes:', err);
    } finally {
      setNotesLoading(false);
    }
  }, []);

  // Fetch timecards for selected operator
  const { monday, sunday } = useMemo(() => getWeekBounds(weekOffset), [weekOffset]);

  const fetchTimecards = useCallback(async (id: string) => {
    setTimecardsLoading(true);
    try {
      const startDate = monday.toISOString().split('T')[0];
      const endDate = sunday.toISOString().split('T')[0];
      const res = await apiFetch(`/api/admin/timecards?userId=${id}&startDate=${startDate}&endDate=${endDate}&limit=200`);
      if (res.ok) {
        const json = await res.json();
        setTimecards(json.data?.timecards || []);
      }
    } catch (err) {
      console.error('Failed to fetch timecards:', err);
    } finally {
      setTimecardsLoading(false);
    }
  }, [monday, sunday]);

  // When selection changes
  useEffect(() => {
    if (selectedId) {
      fetchDetail(selectedId);
      fetchNotes(selectedId);
      setDetailTab('overview');
      setWeekOffset(0);
    }
  }, [selectedId, fetchDetail, fetchNotes]);

  // When week changes, refetch timecards
  useEffect(() => {
    if (selectedId && detailTab === 'timecards') {
      fetchTimecards(selectedId);
    }
  }, [selectedId, detailTab, weekOffset, fetchTimecards]);

  // Filter profiles
  const filteredProfiles = useMemo(() => {
    return profiles.filter(p => {
      const matchesSearch = !search ||
        p.full_name.toLowerCase().includes(search.toLowerCase()) ||
        p.email.toLowerCase().includes(search.toLowerCase());
      const matchesStatus =
        statusFilter === 'all' ||
        (statusFilter === 'active' && p.active) ||
        (statusFilter === 'inactive' && !p.active);
      return matchesSearch && matchesStatus;
    });
  }, [profiles, search, statusFilter]);

  // Add profile handler
  const handleAddProfile = async (data: { fullName: string; email: string; role: string; dateOfBirth: string | null }) => {
    const res = await apiFetch('/api/admin/profiles', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const json = await res.json();
      throw new Error(json.error || 'Failed to create account');
    }
    setShowAddModal(false);
    fetchProfiles();
  };

  // Add note handler
  const handleAddNote = async (noteData: { title: string; content: string; note_type: string; is_private: boolean }) => {
    if (!selectedId) return;
    const res = await apiFetch(`/api/admin/operators/${selectedId}/notes`, {
      method: 'POST',
      body: JSON.stringify(noteData),
    });
    if (res.ok) {
      setShowAddNote(false);
      fetchNotes(selectedId);
    }
  };

  // Delete note handler
  const handleDeleteNote = async (noteId: string) => {
    if (!selectedId) return;
    const res = await apiFetch(`/api/admin/operators/${selectedId}/notes?noteId=${noteId}`, { method: 'DELETE' });
    if (res.ok) {
      fetchNotes(selectedId);
    }
  };

  const selectedProfile = profiles.find(p => p.id === selectedId);
  const roleConfig = selectedProfile ? (ROLE_COLORS[selectedProfile.role] || ROLE_COLORS.operator) : ROLE_COLORS.operator;

  // Timecard calculations
  const tcTotalHours = timecards.reduce((s, t) => s + (t.total_hours || 0), 0);
  const tcRegular = Math.min(timecards.filter(t => t.hour_type !== 'mandatory_overtime').reduce((s, t) => s + (t.total_hours || 0), 0), 40);
  const tcOT = Math.max(0, timecards.filter(t => t.hour_type !== 'mandatory_overtime').reduce((s, t) => s + (t.total_hours || 0), 0) - 40);
  const tcNight = timecards.filter(t => t.is_night_shift).reduce((s, t) => s + (t.total_hours || 0), 0);
  const tcShop = timecards.filter(t => t.is_shop_hours).reduce((s, t) => s + (t.total_hours || 0), 0);

  const formatFullDate = (date: Date) =>
    date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  const formatTime = (dateString: string) =>
    new Date(dateString).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

  // Normalize job history from either API shape
  const allJobs = useMemo(() => {
    if (!history) return [];
    return history.job_history || history.jobHistory || [];
  }, [history]);

  // Filtered jobs
  const filteredJobs = useMemo(() => {
    if (jobStatusFilter === 'all') return allJobs;
    return allJobs.filter((j: any) => j.status === jobStatusFilter);
  }, [allJobs, jobStatusFilter]);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/dashboard/admin" className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
              <ChevronLeft className="w-5 h-5 text-gray-500" />
            </Link>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-600 to-blue-700 flex items-center justify-center">
                <Users size={16} className="text-white" />
              </div>
              <div>
                <h1 className="text-base font-bold text-gray-900">Operator Management</h1>
                <p className="text-[11px] text-gray-400 hidden sm:block">{profiles.length} team members</p>
              </div>
            </div>
          </div>
          <button
            onClick={() => setShowAddModal(true)}
            className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold text-sm transition-colors shadow-sm flex items-center gap-1.5"
          >
            <UserPlus className="w-4 h-4" />
            <span className="hidden sm:inline">Add Member</span>
          </button>
        </div>
      </header>

      <div className="max-w-[1600px] mx-auto flex flex-col lg:flex-row min-h-[calc(100vh-56px)]">
        {/* ── Left Panel: Operator List ──────────────────────── */}
        <div className={`w-full lg:w-[400px] xl:w-[440px] flex-shrink-0 border-r border-gray-200 bg-white flex flex-col ${selectedId ? 'hidden lg:flex' : 'flex'}`}>
          {/* Search + Filter */}
          <div className="p-3 border-b border-gray-100 space-y-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search operators..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg focus:border-blue-500 focus:ring-1 focus:ring-blue-200 text-sm text-gray-900 placeholder-gray-400 transition-all"
              />
            </div>
            <div className="flex gap-1">
              {(['all', 'active', 'inactive'] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setStatusFilter(f)}
                  className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    statusFilter === f
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {f === 'all' ? `All (${profiles.length})` : f === 'active' ? `Active (${profiles.filter(p => p.active).length})` : `Inactive (${profiles.filter(p => !p.active).length})`}
                </button>
              ))}
            </div>
          </div>

          {/* Profiles List */}
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="w-7 h-7 animate-spin text-blue-500" />
              </div>
            ) : filteredProfiles.length === 0 ? (
              <div className="text-center py-16 px-4">
                <Users className="w-10 h-10 mx-auto mb-2 text-gray-300" />
                <p className="font-semibold text-gray-500 text-sm">No operators found</p>
                <p className="text-xs text-gray-400 mt-1">{search ? 'Try a different search' : 'Add your first team member'}</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {filteredProfiles.map((p) => {
                  const rc = ROLE_COLORS[p.role] || ROLE_COLORS.operator;
                  const isSelected = p.id === selectedId;
                  return (
                    <button
                      key={p.id}
                      onClick={() => setSelectedId(p.id)}
                      className={`w-full px-4 py-3 text-left transition-all flex items-center gap-3 ${
                        isSelected
                          ? 'bg-blue-50 border-l-[3px] border-l-blue-600'
                          : 'hover:bg-gray-50 border-l-[3px] border-l-transparent'
                      }`}
                    >
                      {/* Avatar */}
                      <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${rc.avatar} flex items-center justify-center flex-shrink-0`}>
                        {p.profile_picture_url ? (
                          <img src={p.profile_picture_url} alt="" className="w-full h-full rounded-full object-cover" />
                        ) : (
                          <span className="text-white font-bold text-sm">
                            {p.full_name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                          </span>
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-gray-900 text-sm truncate">{p.full_name}</p>
                          {p.active ? (
                            <span className="w-2 h-2 rounded-full bg-green-500 flex-shrink-0" />
                          ) : (
                            <span className="w-2 h-2 rounded-full bg-gray-300 flex-shrink-0" />
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${rc.bg} ${rc.text}`}>
                            {p.role === 'apprentice' ? 'Helper' : p.role.replace('_', ' ')}
                          </span>
                          <span className="text-[11px] text-gray-400 truncate">{p.email}</span>
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-gray-300 flex-shrink-0" />
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* ── Right Panel: Detail ────────────────────────────── */}
        <div className={`flex-1 flex flex-col ${!selectedId ? 'hidden lg:flex' : 'flex'}`}>
          {!selectedId ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center px-4">
                <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <Users className="w-8 h-8 text-gray-300" />
                </div>
                <p className="text-gray-500 font-semibold">Select an operator</p>
                <p className="text-sm text-gray-400 mt-1">Choose someone from the list to view their profile</p>
              </div>
            </div>
          ) : detailLoading ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <Loader2 className="w-8 h-8 animate-spin text-blue-500 mx-auto mb-3" />
                <p className="text-sm text-gray-400">Loading operator data...</p>
              </div>
            </div>
          ) : history ? (
            <>
              {/* Mobile back button */}
              <div className="lg:hidden p-3 border-b border-gray-100">
                <button onClick={() => setSelectedId(null)} className="flex items-center gap-1.5 text-sm text-gray-500 font-medium">
                  <ChevronLeft className="w-4 h-4" /> Back to list
                </button>
              </div>

              {/* Profile Header */}
              <div className="p-4 sm:p-6 border-b border-gray-200 bg-white">
                <div className="flex items-start gap-4">
                  <div className={`w-14 h-14 rounded-xl bg-gradient-to-br ${roleConfig.avatar} flex items-center justify-center flex-shrink-0 shadow-lg`}>
                    {history.profile.profile_picture_url ? (
                      <img src={history.profile.profile_picture_url} alt="" className="w-full h-full rounded-xl object-cover" />
                    ) : (
                      <span className="text-white font-bold text-xl">
                        {history.profile.full_name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                      </span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="text-lg font-bold text-gray-900">{history.profile.full_name}</h2>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${roleConfig.bg} ${roleConfig.text}`}>
                        {history.profile.role === 'apprentice' ? 'Helper' : history.profile.role.replace('_', ' ')}
                      </span>
                      {history.profile.active ? (
                        <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-green-50 text-green-700">Active</span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-500">Inactive</span>
                      )}
                    </div>
                    <div className="flex items-center gap-4 mt-1.5 flex-wrap">
                      <span className="text-xs text-gray-500 flex items-center gap-1"><Mail className="w-3 h-3" />{history.profile.email}</span>
                      {(history.profile.phone || history.profile.phone_number) && (
                        <span className="text-xs text-gray-500 flex items-center gap-1"><Phone className="w-3 h-3" />{history.profile.phone_number || history.profile.phone}</span>
                      )}
                      <span className="text-xs text-gray-500 flex items-center gap-1"><Calendar className="w-3 h-3" />Since {formatDate(history.profile.created_at?.split('T')[0])}</span>
                    </div>
                  </div>
                </div>

                {/* Quick Stats */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
                  {[
                    { label: 'Total Jobs', value: history.stats.total_jobs ?? history.stats.totalJobs ?? 0, icon: Briefcase, color: 'text-blue-600', bg: 'bg-blue-50' },
                    { label: 'Total Hours', value: `${history.stats.total_hours ?? history.stats.totalHours ?? 0}h`, icon: Clock, color: 'text-purple-600', bg: 'bg-purple-50' },
                    { label: 'Avg Rating', value: history.stats.avg_rating ? `${history.stats.avg_rating}/5` : 'N/A', icon: Star, color: 'text-green-600', bg: 'bg-green-50' },
                    { label: 'On-Time %', value: `${history.stats.on_time_rate ?? history.stats.onTimePercent ?? 0}%`, icon: TrendingUp, color: 'text-amber-600', bg: 'bg-amber-50' },
                  ].map(({ label, value, icon: Icon, color, bg }) => (
                    <div key={label} className="bg-white rounded-xl border border-gray-200 p-3 shadow-sm">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{label}</span>
                        <div className={`w-7 h-7 rounded-lg ${bg} flex items-center justify-center`}>
                          <Icon size={14} className={color} />
                        </div>
                      </div>
                      <p className="text-xl font-bold text-gray-900">{value}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Tabs */}
              <div className="px-4 sm:px-6 pt-3 bg-white border-b border-gray-200 overflow-x-auto">
                <div className="flex gap-1 min-w-max">
                  {([
                    { key: 'overview', label: 'Overview', icon: BarChart3 },
                    { key: 'jobs', label: 'Job History', icon: Briefcase },
                    { key: 'timecards', label: 'Timecards', icon: Clock },
                    { key: 'notes', label: 'Notes & Reviews', icon: MessageSquare },
                    ...(currentUserRole === 'super_admin' ? [{ key: 'pay', label: 'Pay & Comp', icon: DollarSign }] : []),
                  ] as { key: typeof detailTab; label: string; icon: typeof Star }[]).map(({ key, label, icon: Icon }) => (
                    <button
                      key={key}
                      onClick={() => setDetailTab(key)}
                      className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 mb-2 ${
                        detailTab === key
                          ? 'bg-blue-600 text-white shadow-sm'
                          : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
                      }`}
                    >
                      <Icon size={13} />
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Tab Content */}
              <div className="flex-1 overflow-y-auto p-4 sm:p-6">
                {/* ── Overview Tab ──────────────────────────── */}
                {detailTab === 'overview' && (
                  <div className="space-y-6">
                    {/* Monthly Performance Chart */}
                    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 sm:p-5">
                      <h3 className="text-sm font-bold text-gray-900 mb-4">Monthly Performance (Last 12 Months)</h3>
                      <div className="h-56">
                        {(() => {
                          // Normalize data from either API shape
                          const rawData = history.monthly_performance || history.monthlyPerformance || [];
                          const chartData = rawData.map((d: any) => ({
                            month: d.month,
                            jobs: d.jobs_completed ?? d.jobs ?? 0,
                            hours: d.hours_worked ?? d.hours ?? 0,
                          }));
                          return (
                            <ResponsiveContainer width="100%" height="100%">
                              <BarChart data={chartData}>
                                <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                                <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                                <Tooltip
                                  contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb', fontSize: '12px' }}
                                  formatter={(value: any, name: any) => [value, name === 'jobs' ? 'Jobs' : 'Hours']}
                                />
                                <Bar dataKey="jobs" fill="#2563eb" radius={[4, 4, 0, 0]} name="jobs" />
                                <Bar dataKey="hours" fill="#8b5cf6" radius={[4, 4, 0, 0]} name="hours" />
                              </BarChart>
                            </ResponsiveContainer>
                          );
                        })()}
                      </div>
                    </div>

                    {/* Contact & Emergency Info */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
                        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Contact Information</h3>
                        <div className="space-y-2.5">
                          <div className="flex items-center gap-2.5 text-sm">
                            <Mail className="w-4 h-4 text-gray-400" />
                            <span className="text-gray-700">{history.profile.email}</span>
                          </div>
                          {(history.profile.phone || history.profile.phone_number) && (
                            <div className="flex items-center gap-2.5 text-sm">
                              <Phone className="w-4 h-4 text-gray-400" />
                              <span className="text-gray-700">{history.profile.phone_number || history.profile.phone}</span>
                            </div>
                          )}
                          {history.profile.date_of_birth && (
                            <div className="flex items-center gap-2.5 text-sm">
                              <Calendar className="w-4 h-4 text-gray-400" />
                              <span className="text-gray-700">{formatDate(history.profile.date_of_birth)}</span>
                            </div>
                          )}
                          {history.profile.nickname && (
                            <div className="flex items-center gap-2.5 text-sm">
                              <Users className="w-4 h-4 text-gray-400" />
                              <span className="text-gray-700">Goes by &ldquo;{history.profile.nickname}&rdquo;</span>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
                        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                          <Shield className="w-3.5 h-3.5 text-red-500" />
                          Emergency Contact
                        </h3>
                        {history.profile.emergency_contact_name ? (
                          <div className="space-y-1.5">
                            <p className="text-sm font-semibold text-gray-900">{history.profile.emergency_contact_name}</p>
                            {history.profile.emergency_contact_relationship && (
                              <p className="text-xs text-gray-500">{history.profile.emergency_contact_relationship}</p>
                            )}
                            {history.profile.emergency_contact_phone && (
                              <p className="text-sm text-gray-700">{history.profile.emergency_contact_phone}</p>
                            )}
                          </div>
                        ) : (
                          <p className="text-sm text-gray-400 italic">No emergency contact on file</p>
                        )}
                      </div>
                    </div>

                    {/* Skills & Certifications */}
                    {((history.skills && history.skills.length > 0) || (history.certifications && history.certifications.length > 0)) && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
                          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                            <Award className="w-3.5 h-3.5 text-blue-500" /> Skills & Qualifications
                          </h3>
                          <div className="flex flex-wrap gap-1.5">
                            {history.skills && history.skills.length > 0 ? history.skills.map((s: any, i: number) => (
                              <span key={i} className="px-2 py-1 rounded-lg text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200">{s.task}</span>
                            )) : <p className="text-sm text-gray-400 italic">No skills on file</p>}
                          </div>
                        </div>
                        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
                          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                            <Shield className="w-3.5 h-3.5 text-green-500" /> Certifications
                          </h3>
                          {history.certifications && history.certifications.length > 0 ? (
                            <div className="space-y-2">
                              {history.certifications.map((c: any, i: number) => (
                                <div key={i} className="flex items-center justify-between">
                                  <span className="text-sm text-gray-700">{c.name}</span>
                                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${c.is_expired ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
                                    {c.is_expired ? 'Expired' : c.expiry_date ? `Valid` : 'No expiry'}
                                  </span>
                                </div>
                              ))}
                            </div>
                          ) : <p className="text-sm text-gray-400 italic">No certifications on file</p>}
                        </div>
                      </div>
                    )}

                    {/* Recent Jobs */}
                    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Recent Jobs</h3>
                        <button onClick={() => setDetailTab('jobs')} className="text-xs font-semibold text-blue-600 hover:text-blue-700">View All</button>
                      </div>
                      {allJobs.length === 0 ? (
                        <p className="text-sm text-gray-400 italic text-center py-4">No jobs assigned yet</p>
                      ) : (
                        <div className="space-y-2">
                          {allJobs.slice(0, 5).map((job: any) => (
                            <div key={job.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-medium text-gray-900 truncate">{job.customer_name}</p>
                                <p className="text-xs text-gray-400">{job.job_number} &middot; {job.job_type?.split(',')[0]?.trim()}</p>
                              </div>
                              <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                                <span className="text-xs text-gray-400">{formatShortDate(job.scheduled_date)}</span>
                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${statusColor(job.status)}`}>
                                  {job.status.replace(/_/g, ' ')}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* ── Job History Tab ───────────────────────── */}
                {detailTab === 'jobs' && (
                  <div className="space-y-4">
                    {/* Summary + Filter */}
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-4">
                        <p className="text-sm text-gray-600">
                          <span className="font-bold text-gray-900">{allJobs.length}</span> total jobs
                        </p>
                      </div>
                      <div className="flex items-center gap-1">
                        <Filter className="w-3.5 h-3.5 text-gray-400 mr-1" />
                        {['all', 'completed', 'in_progress', 'scheduled', 'cancelled'].map(s => (
                          <button
                            key={s}
                            onClick={() => setJobStatusFilter(s)}
                            className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all ${
                              jobStatusFilter === s ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                            }`}
                          >
                            {s === 'all' ? 'All' : s.replace(/_/g, ' ')}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Job Table */}
                    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                      {filteredJobs.length === 0 ? (
                        <div className="p-12 text-center">
                          <Briefcase className="w-10 h-10 text-gray-200 mx-auto mb-2" />
                          <p className="text-sm text-gray-400">No jobs match this filter</p>
                        </div>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full">
                            <thead>
                              <tr className="bg-gray-50 border-b border-gray-100">
                                <th className="px-4 py-2.5 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider">Date</th>
                                <th className="px-4 py-2.5 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider">Job #</th>
                                <th className="px-4 py-2.5 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider">Customer</th>
                                <th className="px-4 py-2.5 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider">Type</th>
                                <th className="px-4 py-2.5 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider">Location</th>
                                <th className="px-4 py-2.5 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider">Status</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                              {filteredJobs.map(job => (
                                <tr key={job.id} className="hover:bg-blue-50/30 transition-colors cursor-pointer" onClick={() => router.push(`/dashboard/admin/jobs/${job.id}`)}>
                                  <td className="px-4 py-2.5 text-sm text-gray-700 whitespace-nowrap">{formatShortDate(job.scheduled_date)}</td>
                                  <td className="px-4 py-2.5 text-sm font-medium text-gray-900 whitespace-nowrap">{job.job_number}</td>
                                  <td className="px-4 py-2.5 text-sm text-gray-700 max-w-[200px] truncate">{job.customer_name}</td>
                                  <td className="px-4 py-2.5 text-sm text-gray-500 whitespace-nowrap">{job.job_type?.split(',')[0]?.trim()}</td>
                                  <td className="px-4 py-2.5 text-sm text-gray-500 max-w-[150px] truncate">{job.location || '--'}</td>
                                  <td className="px-4 py-2.5 whitespace-nowrap">
                                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${statusColor(job.status)}`}>
                                      {job.status.replace(/_/g, ' ')}
                                    </span>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* ── Timecards Tab ─────────────────────────── */}
                {detailTab === 'timecards' && (
                  <div className="space-y-4">
                    {/* Week Navigation */}
                    <div className="flex items-center justify-between">
                      <button
                        onClick={() => setWeekOffset(weekOffset - 1)}
                        className="flex items-center gap-1 px-3 py-1.5 bg-white hover:bg-gray-50 text-gray-600 rounded-lg text-sm font-medium border border-gray-200 shadow-sm"
                      >
                        <ChevronLeft size={14} /> Prev
                      </button>
                      <div className="text-center">
                        <p className="text-sm font-bold text-gray-900">{formatFullDate(monday)} -- {formatFullDate(sunday)}</p>
                        <p className="text-[11px] text-gray-400">{weekOffset === 0 ? 'Current Week' : `${Math.abs(weekOffset)} week${Math.abs(weekOffset) > 1 ? 's' : ''} ago`}</p>
                      </div>
                      <button
                        onClick={() => setWeekOffset(weekOffset + 1)}
                        disabled={weekOffset >= 0}
                        className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium border shadow-sm ${
                          weekOffset >= 0 ? 'bg-gray-50 text-gray-300 border-gray-100 cursor-not-allowed' : 'bg-white hover:bg-gray-50 text-gray-600 border-gray-200'
                        }`}
                      >
                        Next <ChevronRight size={14} />
                      </button>
                    </div>

                    {/* Hours Breakdown */}
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                      {[
                        { label: 'Total', value: tcTotalHours.toFixed(1), color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-100' },
                        { label: 'Regular', value: tcRegular.toFixed(1), color: 'text-green-600', bg: 'bg-green-50', border: 'border-green-100' },
                        { label: 'Weekly OT', value: tcOT.toFixed(1), color: 'text-orange-600', bg: 'bg-orange-50', border: 'border-orange-100' },
                        { label: 'Night', value: tcNight.toFixed(1), color: 'text-indigo-600', bg: 'bg-indigo-50', border: 'border-indigo-100' },
                        { label: 'Shop', value: tcShop.toFixed(1), color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-100' },
                      ].map(({ label, value, color, bg, border }) => (
                        <div key={label} className={`px-3 py-2.5 rounded-lg border ${border} ${bg}`}>
                          <p className={`text-lg font-bold ${color}`}>{value}<span className="text-xs font-normal ml-0.5">h</span></p>
                          <p className="text-[10px] text-gray-500 font-medium">{label}</p>
                        </div>
                      ))}
                    </div>

                    {/* Timecard Table */}
                    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                        <p className="text-sm font-bold text-gray-800">Time Entries</p>
                        <button
                          onClick={() => {
                            const mondayStr = monday.toISOString().split('T')[0];
                            window.open(`/api/admin/timecards/${selectedId}/pdf?weekStart=${mondayStr}`, '_blank');
                          }}
                          className="flex items-center gap-1.5 px-2.5 py-1.5 bg-white hover:bg-gray-50 text-blue-700 rounded-lg text-xs font-medium border border-blue-200 shadow-sm"
                        >
                          <FileText size={13} /> Download PDF
                        </button>
                      </div>

                      {timecardsLoading ? (
                        <div className="p-12 text-center">
                          <Loader2 className="w-6 h-6 animate-spin text-blue-500 mx-auto mb-2" />
                          <p className="text-xs text-gray-400">Loading timecards...</p>
                        </div>
                      ) : timecards.length === 0 ? (
                        <div className="p-12 text-center">
                          <Clock className="w-10 h-10 text-gray-200 mx-auto mb-2" />
                          <p className="text-sm text-gray-400">No entries this week</p>
                        </div>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full">
                            <thead>
                              <tr className="bg-gray-50 border-b border-gray-100">
                                <th className="px-4 py-2.5 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider">Date</th>
                                <th className="px-4 py-2.5 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider">In</th>
                                <th className="px-4 py-2.5 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider">Out</th>
                                <th className="px-4 py-2.5 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider">Hours</th>
                                <th className="px-4 py-2.5 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider">Type</th>
                                <th className="px-4 py-2.5 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider">Status</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                              {timecards.map(tc => (
                                <tr key={tc.id} className="hover:bg-blue-50/30">
                                  <td className="px-4 py-2.5 text-sm text-gray-700 whitespace-nowrap">
                                    {new Date(tc.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                                  </td>
                                  <td className="px-4 py-2.5 text-sm font-medium text-gray-700 tabular-nums">{formatTime(tc.clock_in_time)}</td>
                                  <td className="px-4 py-2.5 text-sm text-gray-700 tabular-nums">
                                    {tc.clock_out_time ? formatTime(tc.clock_out_time) : (
                                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-green-50 text-green-600 border border-green-200">
                                        <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" /> Active
                                      </span>
                                    )}
                                  </td>
                                  <td className="px-4 py-2.5 text-sm font-bold text-gray-800 tabular-nums">{tc.total_hours?.toFixed(2) || '--'}</td>
                                  <td className="px-4 py-2.5">
                                    <div className="flex flex-wrap gap-1">
                                      {tc.is_shop_hours && <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">Shop</span>}
                                      {tc.is_night_shift && <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">Night</span>}
                                      {tc.hour_type === 'mandatory_overtime' && <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-red-50 text-red-700 border border-red-200">Wknd OT</span>}
                                      {!tc.is_shop_hours && !tc.is_night_shift && tc.hour_type !== 'mandatory_overtime' && <span className="text-[10px] text-gray-400">Regular</span>}
                                    </div>
                                  </td>
                                  <td className="px-4 py-2.5">
                                    {tc.is_approved ? (
                                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-green-50 text-green-600 border border-green-200">
                                        <CheckCircle size={10} /> Approved
                                      </span>
                                    ) : (
                                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-600 border border-amber-200">
                                        <Clock size={10} /> Pending
                                      </span>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* ── Notes & Reviews Tab ───────────────────── */}
                {detailTab === 'notes' && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-bold text-gray-900">Notes & Reviews</h3>
                      <button
                        onClick={() => setShowAddNote(true)}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold transition-colors shadow-sm"
                      >
                        <Plus size={13} /> Add Note
                      </button>
                    </div>

                    {notesLoading ? (
                      <div className="text-center py-12">
                        <Loader2 className="w-6 h-6 animate-spin text-blue-500 mx-auto" />
                      </div>
                    ) : notes.length === 0 ? (
                      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-12 text-center">
                        <MessageSquare className="w-10 h-10 text-gray-200 mx-auto mb-2" />
                        <p className="text-sm text-gray-400">No notes yet</p>
                        <p className="text-xs text-gray-300 mt-1">Add a note to track performance, incidents, or training</p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {notes.map(note => {
                          const config = NOTE_TYPE_CONFIG[note.note_type] || NOTE_TYPE_CONFIG.general;
                          const NoteIcon = config.icon;
                          return (
                            <div key={note.id} className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
                              <div className="flex items-start justify-between gap-3">
                                <div className="flex items-start gap-3 flex-1 min-w-0">
                                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${config.color}`}>
                                    <NoteIcon size={14} />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <p className="text-sm font-semibold text-gray-900">{note.title}</p>
                                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${config.color}`}>{config.label}</span>
                                      {note.is_private && (
                                        <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-gray-100 text-gray-500">Private</span>
                                      )}
                                    </div>
                                    <p className="text-sm text-gray-600 mt-1 whitespace-pre-wrap">{note.content}</p>
                                    <p className="text-xs text-gray-400 mt-2">
                                      {note.author_name || note.author?.full_name || 'Unknown'} &middot; {new Date(note.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                    </p>
                                  </div>
                                </div>
                                {currentUserRole === 'super_admin' && (
                                  <button
                                    onClick={() => handleDeleteNote(note.id)}
                                    className="p-1.5 hover:bg-red-50 rounded-lg transition-colors text-gray-400 hover:text-red-600"
                                  >
                                    <Trash2 size={14} />
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {/* ── Pay & Compensation Tab (super_admin only) ─ */}
                {detailTab === 'pay' && currentUserRole === 'super_admin' && (
                  <div className="space-y-4">
                    {/* Current Rate */}
                    {(history.profile as any).hourly_rate && (
                      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
                        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Current Rate</h3>
                        <p className="text-3xl font-bold text-gray-900">${(history.profile as any).hourly_rate}<span className="text-base font-normal text-gray-400">/hr</span></p>
                      </div>
                    )}

                    {/* Pay History */}
                    {history.pay_history && history.pay_history.length > 0 ? (
                      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
                        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4">Pay History</h3>
                        <div className="space-y-3">
                          {history.pay_history.map((pay: any, i: number) => (
                            <div key={i} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                              <div>
                                <p className="text-sm font-medium text-gray-900">${pay.hourly_rate}/hr</p>
                                {pay.reason && <p className="text-xs text-gray-500 mt-0.5">{pay.reason}</p>}
                              </div>
                              <span className="text-xs text-gray-400">{formatDate(pay.effective_date)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
                        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4">Compensation</h3>
                        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-start gap-3">
                          <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                          <div>
                            <p className="text-sm font-semibold text-amber-800">Pay tracking coming soon</p>
                            <p className="text-xs text-amber-700 mt-1">
                              Hourly rate management, pay history timeline, and rate change tracking will be available in a future update.
                            </p>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <AlertTriangle className="w-10 h-10 text-red-300 mx-auto mb-2" />
                <p className="text-sm text-gray-500">Failed to load operator data</p>
                <button onClick={() => selectedId && fetchDetail(selectedId)} className="mt-2 text-sm text-blue-600 font-semibold hover:text-blue-700">Try again</button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Add Profile Modal ──────────────────────────────── */}
      {showAddModal && (
        <AddProfileModal onSubmit={handleAddProfile} onClose={() => setShowAddModal(false)} />
      )}

      {/* ── Add Note Modal ─────────────────────────────────── */}
      {showAddNote && (
        <AddNoteModal
          onSubmit={handleAddNote}
          onClose={() => setShowAddNote(false)}
        />
      )}
    </div>
  );
}

// ── Add Note Modal Component ────────────────────────────────
function AddNoteModal({ onSubmit, onClose }: {
  onSubmit: (data: { title: string; content: string; note_type: string; is_private: boolean }) => Promise<void>;
  onClose: () => void;
}) {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [noteType, setNoteType] = useState('general');
  const [isPrivate, setIsPrivate] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!title.trim() || !content.trim()) return;
    setSubmitting(true);
    try {
      await onSubmit({ title: title.trim(), content: content.trim(), note_type: noteType, is_private: isPrivate });
    } catch {
      // handled by parent
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[70]" onClick={onClose} />
      <div className="fixed inset-0 flex items-center justify-center z-[80] p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
          <div className="p-5 border-b border-gray-100 flex items-center justify-between">
            <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-blue-600" />
              Add Note
            </h3>
            <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
              <X size={18} className="text-gray-400" />
            </button>
          </div>

          <div className="p-5 space-y-4">
            {/* Note Type */}
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Type</label>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(NOTE_TYPE_CONFIG).map(([key, config]) => (
                  <button
                    key={key}
                    onClick={() => setNoteType(key)}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                      noteType === key ? 'bg-blue-600 text-white' : `${config.color} hover:opacity-80`
                    }`}
                  >
                    {config.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Title */}
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Title</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Brief description..."
                className="w-full px-3.5 py-2 border border-gray-300 rounded-lg focus:border-blue-500 focus:ring-1 focus:ring-blue-200 text-sm text-gray-900 transition-all"
              />
            </div>

            {/* Content */}
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Content</label>
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={4}
                placeholder="Detailed notes..."
                className="w-full px-3.5 py-2 border border-gray-300 rounded-lg focus:border-blue-500 focus:ring-1 focus:ring-blue-200 text-sm text-gray-900 resize-none transition-all"
              />
            </div>

            {/* Private */}
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={isPrivate}
                onChange={(e) => setIsPrivate(e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm text-gray-700">Mark as private (visible to super admins only)</span>
            </label>

            {/* Actions */}
            <div className="flex gap-2.5 pt-1">
              <button
                onClick={onClose}
                className="flex-1 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-semibold text-sm transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={submitting || !title.trim() || !content.trim()}
                className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold text-sm transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
              >
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                {submitting ? 'Saving...' : 'Save Note'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
