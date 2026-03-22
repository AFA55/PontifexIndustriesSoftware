'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Wrench,
  Clock,
  AlertTriangle,
  CheckCircle,
  ChevronRight,
  LogOut,
  Package,
  Play,
  Pause,
  ClipboardList,
  Calendar,
  TrendingUp,
  User,
  Filter,
  Plus,
  Search,
  RefreshCw,
  ArrowLeft,
  Timer,
  DollarSign,
  Camera,
  FileText,
  X,
  ChevronDown,
  ChevronUp,
  Shield,
  Loader2,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { getCurrentUser, logout, isShopUser, isShopManager, type User as AuthUser } from '@/lib/auth';

// ============================================================
// Types
// ============================================================

interface DashboardStats {
  pending_work_orders: number;
  in_progress_work_orders: number;
  completed_today: number;
  critical_priority: number;
  overdue_scheduled: number;
  upcoming_scheduled: any[];
  recent_completions: any[];
}

interface WorkOrder {
  id: string;
  title: string;
  description: string | null;
  priority: string;
  status: string;
  unit_name: string | null;
  unit_pontifex_id: string | null;
  unit_category: string | null;
  assigned_to_name: string | null;
  assigned_to: string | null;
  started_at: string | null;
  completed_at: string | null;
  estimated_hours: number | null;
  actual_hours: number | null;
  issue_found: string | null;
  work_performed: string | null;
  parts_used: any[];
  parts_total_cost: number | null;
  labor_cost: number | null;
  total_cost: number | null;
  notes: string | null;
  created_at: string;
}

interface CompletionForm {
  issue_found: string;
  work_performed: string;
  parts_used: { name: string; quantity: number; unit_cost: number }[];
  labor_cost: string;
  notes: string;
}

// ============================================================
// Patriot Logo (consistent with admin)
// ============================================================
function PatriotLogo({ className = "h-8" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 250 60" fill="none" xmlns="http://www.w3.org/2000/svg">
      <g>
        <path
          d="M20 15L35 5L50 15L50 35L35 45L20 35L20 25L35 25L35 35L42 30L42 20L35 15L28 20L28 30L20 25V15Z"
          fill="url(#shop-gradient)"
        />
        <path d="M25 20L30 17L35 20L35 25L30 28L25 25V20Z" fill="currentColor" opacity="0.3" />
      </g>
      <g fill="currentColor">
        <text x="65" y="25" style={{ fontSize: '18px', fontFamily: 'Inter, sans-serif', fontWeight: 'bold' }}>PONTIFEX</text>
        <text x="65" y="45" style={{ fontSize: '12px', fontFamily: 'Inter, sans-serif', opacity: '0.8' }}>SHOP OPERATIONS</text>
      </g>
      <defs>
        <linearGradient id="shop-gradient" x1="20" y1="5" x2="50" y2="45" gradientUnits="userSpaceOnUse">
          <stop stopColor="#f97316" />
          <stop offset="0.5" stopColor="#ea580c" />
          <stop offset="1" stopColor="#c2410c" />
        </linearGradient>
      </defs>
    </svg>
  );
}

// ============================================================
// Status & Priority Helpers
// ============================================================

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; icon: any }> = {
  pending: { label: 'Pending', color: 'text-yellow-700', bg: 'bg-yellow-100 border-yellow-200', icon: Clock },
  assigned: { label: 'Assigned', color: 'text-blue-700', bg: 'bg-blue-100 border-blue-200', icon: User },
  in_progress: { label: 'In Progress', color: 'text-orange-700', bg: 'bg-orange-100 border-orange-200', icon: Play },
  waiting_parts: { label: 'Waiting Parts', color: 'text-purple-700', bg: 'bg-purple-100 border-purple-200', icon: Pause },
  completed: { label: 'Completed', color: 'text-green-700', bg: 'bg-green-100 border-green-200', icon: CheckCircle },
  cancelled: { label: 'Cancelled', color: 'text-gray-700', bg: 'bg-gray-100 border-gray-200', icon: X },
};

const PRIORITY_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  low: { label: 'Low', color: 'text-gray-600', bg: 'bg-gray-100' },
  normal: { label: 'Normal', color: 'text-blue-600', bg: 'bg-blue-100' },
  high: { label: 'High', color: 'text-orange-600', bg: 'bg-orange-100' },
  critical: { label: 'Critical', color: 'text-red-600', bg: 'bg-red-100' },
};

function StatusBadge({ status }: { status: string }) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.pending;
  const Icon = config.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border ${config.bg} ${config.color}`}>
      <Icon size={12} />
      {config.label}
    </span>
  );
}

function PriorityBadge({ priority }: { priority: string }) {
  const config = PRIORITY_CONFIG[priority] || PRIORITY_CONFIG.normal;
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold ${config.bg} ${config.color}`}>
      {priority === 'critical' && <AlertTriangle size={11} className="mr-1" />}
      {config.label}
    </span>
  );
}

// ============================================================
// Main Shop Dashboard
// ============================================================

export default function ShopDashboard() {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [workOrdersLoading, setWorkOrdersLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('active');
  const [expandedWO, setExpandedWO] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Work ticket flow
  const [activeTicket, setActiveTicket] = useState<string | null>(null);
  const [ticketTimer, setTicketTimer] = useState<number>(0);
  const [timerInterval, setTimerInterval] = useState<NodeJS.Timeout | null>(null);
  const [showCompletionForm, setShowCompletionForm] = useState(false);
  const [completionForm, setCompletionForm] = useState<CompletionForm>({
    issue_found: '',
    work_performed: '',
    parts_used: [],
    labor_cost: '',
    notes: '',
  });
  const [submitting, setSubmitting] = useState(false);

  // Create work order form
  const [showCreateWO, setShowCreateWO] = useState(false);
  const [createWOForm, setCreateWOForm] = useState({
    title: '',
    description: '',
    priority: 'normal' as string,
    unit_id: '',
    estimated_hours: '',
  });
  const [equipmentSearch, setEquipmentSearch] = useState('');
  const [equipmentResults, setEquipmentResults] = useState<any[]>([]);
  const [equipmentSearchLoading, setEquipmentSearchLoading] = useState(false);
  const [creatingWO, setCreatingWO] = useState(false);
  const equipmentSearchTimer = useRef<NodeJS.Timeout | null>(null);

  // ============================================================
  // Auth Check
  // ============================================================
  useEffect(() => {
    const currentUser = getCurrentUser();
    if (!currentUser) {
      router.push('/shop-login');
      return;
    }
    if (!['shop_manager', 'shop_hand', 'admin', 'super_admin'].includes(currentUser.role)) {
      router.push('/login');
      return;
    }
    setUser(currentUser);
    setLoading(false);
  }, [router]);

  // ============================================================
  // Data Fetching
  // ============================================================
  const getToken = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        // Session expired — redirect to login
        router.push('/shop-login?expired=true');
        throw new Error('Session expired');
      }
      return session.access_token;
    } catch (err: any) {
      if (err?.message === 'Session expired') throw err;
      // Network error reaching Supabase
      console.warn('Failed to get session token:', err?.message);
      throw new Error('Unable to connect. Please check your internet connection.');
    }
  }, [router]);

  const fetchStats = useCallback(async () => {
    try {
      const token = await getToken();
      const res = await fetch('/api/shop/dashboard-stats', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const json = await res.json();
        if (json.success) setStats(json.data);
      }
    } catch (err) {
      console.error('Error fetching shop stats:', err);
    }
  }, [getToken]);

  const fetchWorkOrders = useCallback(async () => {
    try {
      setWorkOrdersLoading(true);
      const token = await getToken();
      const statusParam = statusFilter === 'active'
        ? 'pending,assigned,in_progress,waiting_parts'
        : statusFilter === 'completed' ? 'completed' : statusFilter;
      const res = await fetch(`/api/shop/work-orders?pageSize=50&status=${statusParam}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const json = await res.json();
        if (json.success) setWorkOrders(json.data || []);
      }
    } catch (err) {
      console.error('Error fetching work orders:', err);
    } finally {
      setWorkOrdersLoading(false);
    }
  }, [getToken, statusFilter]);

  useEffect(() => {
    if (!loading && user) {
      fetchStats();
      fetchWorkOrders();
    }
  }, [loading, user, fetchStats, fetchWorkOrders]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([fetchStats(), fetchWorkOrders()]);
    setRefreshing(false);
  };

  // ============================================================
  // Equipment Search for Create WO
  // ============================================================
  const searchEquipment = useCallback(async (query: string) => {
    if (!query || query.length < 2) {
      setEquipmentResults([]);
      return;
    }
    try {
      setEquipmentSearchLoading(true);
      const token = await getToken();
      const res = await fetch(`/api/equipment-units?search=${encodeURIComponent(query)}&pageSize=10`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const json = await res.json();
        setEquipmentResults(json.data || []);
      }
    } catch (err) {
      console.error('Error searching equipment:', err);
    } finally {
      setEquipmentSearchLoading(false);
    }
  }, [getToken]);

  useEffect(() => {
    if (equipmentSearchTimer.current) clearTimeout(equipmentSearchTimer.current);
    equipmentSearchTimer.current = setTimeout(() => {
      searchEquipment(equipmentSearch);
    }, 300);
    return () => {
      if (equipmentSearchTimer.current) clearTimeout(equipmentSearchTimer.current);
    };
  }, [equipmentSearch, searchEquipment]);

  const createWorkOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createWOForm.unit_id || !createWOForm.title.trim()) return;
    setCreatingWO(true);
    try {
      const token = await getToken();
      const res = await fetch('/api/shop/work-orders', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          unit_id: createWOForm.unit_id,
          title: createWOForm.title.trim(),
          description: createWOForm.description.trim() || null,
          priority: createWOForm.priority,
          estimated_hours: createWOForm.estimated_hours ? parseFloat(createWOForm.estimated_hours) : null,
        }),
      });
      if (res.ok) {
        setShowCreateWO(false);
        setCreateWOForm({ title: '', description: '', priority: 'normal', unit_id: '', estimated_hours: '' });
        setEquipmentSearch('');
        setEquipmentResults([]);
        await Promise.all([fetchStats(), fetchWorkOrders()]);
      } else {
        const err = await res.json().catch(() => ({}));
        alert(err.error || 'Failed to create work order');
      }
    } catch (err) {
      console.error('Error creating work order:', err);
      alert('Failed to create work order');
    } finally {
      setCreatingWO(false);
    }
  };

  // ============================================================
  // Work Ticket Timer
  // ============================================================
  const startWorkTicket = async (workOrderId: string) => {
    try {
      const token = await getToken();
      await fetch(`/api/shop/work-orders/${workOrderId}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: 'in_progress' }),
      });
      setActiveTicket(workOrderId);
      setTicketTimer(0);
      const interval = setInterval(() => {
        setTicketTimer(prev => prev + 1);
      }, 1000);
      setTimerInterval(interval);
      fetchWorkOrders();
    } catch (err) {
      console.error('Error starting work ticket:', err);
    }
  };

  const stopWorkTicket = () => {
    if (timerInterval) {
      clearInterval(timerInterval);
      setTimerInterval(null);
    }
    setShowCompletionForm(true);
  };

  const formatTimer = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // ============================================================
  // Complete Work Order
  // ============================================================
  const addPart = () => {
    setCompletionForm(prev => ({
      ...prev,
      parts_used: [...prev.parts_used, { name: '', quantity: 1, unit_cost: 0 }],
    }));
  };

  const updatePart = (index: number, field: string, value: any) => {
    setCompletionForm(prev => {
      const parts = [...prev.parts_used];
      parts[index] = { ...parts[index], [field]: value };
      return { ...prev, parts_used: parts };
    });
  };

  const removePart = (index: number) => {
    setCompletionForm(prev => ({
      ...prev,
      parts_used: prev.parts_used.filter((_, i) => i !== index),
    }));
  };

  const submitCompletion = async () => {
    if (!activeTicket) return;
    setSubmitting(true);
    try {
      const token = await getToken();
      const actualHours = ticketTimer / 3600;
      const partsTotal = completionForm.parts_used.reduce(
        (sum, p) => sum + (p.quantity * p.unit_cost), 0
      );
      const laborCost = parseFloat(completionForm.labor_cost) || 0;

      await fetch(`/api/shop/work-orders/${activeTicket}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          status: 'completed',
          issue_found: completionForm.issue_found,
          work_performed: completionForm.work_performed,
          parts_used: completionForm.parts_used,
          parts_total_cost: partsTotal,
          labor_cost: laborCost,
          total_cost: partsTotal + laborCost,
          actual_hours: Math.round(actualHours * 100) / 100,
          notes: completionForm.notes,
        }),
      });

      // Reset
      setActiveTicket(null);
      setTicketTimer(0);
      setShowCompletionForm(false);
      setCompletionForm({
        issue_found: '',
        work_performed: '',
        parts_used: [],
        labor_cost: '',
        notes: '',
      });
      await Promise.all([fetchStats(), fetchWorkOrders()]);
    } catch (err) {
      console.error('Error completing work order:', err);
      alert('Failed to complete work order. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // ============================================================
  // Logout
  // ============================================================
  const handleLogout = () => {
    if (timerInterval) clearInterval(timerInterval);
    logout();
    router.push('/shop-login');
  };

  // ============================================================
  // Loading State
  // ============================================================
  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-gray-900 to-orange-950 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin w-10 h-10 border-3 border-orange-500 border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-gray-400 font-medium">Loading shop dashboard...</p>
        </div>
      </div>
    );
  }

  const isManager = user?.role === 'shop_manager' || user?.role === 'admin' || user?.role === 'super_admin';

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-orange-50/30 to-amber-50/20">
      {/* ============================================================ */}
      {/* Header */}
      {/* ============================================================ */}
      <div className="bg-gradient-to-r from-gray-900 via-gray-800 to-orange-900 border-b border-orange-800/50 sticky top-0 z-50 shadow-2xl">
        <div className="container mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="transform hover:scale-105 transition-transform duration-200">
              <PatriotLogo className="h-10 text-white" />
            </div>

            <div className="flex items-center gap-3">
              {/* Active work timer (if running) */}
              {activeTicket && !showCompletionForm && (
                <div className="hidden sm:flex items-center gap-2 bg-green-500/20 border border-green-500/40 px-4 py-2 rounded-xl">
                  <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                  <Timer size={16} className="text-green-400" />
                  <span className="text-green-300 font-mono font-bold text-sm">{formatTimer(ticketTimer)}</span>
                  <button
                    onClick={stopWorkTicket}
                    className="ml-2 px-2 py-1 bg-red-500/80 hover:bg-red-500 text-white rounded-lg text-xs font-bold transition-colors"
                  >
                    Stop
                  </button>
                </div>
              )}

              <div className="hidden sm:flex items-center gap-3 bg-white/10 backdrop-blur-lg px-4 py-2 rounded-xl border border-white/20">
                <div className="w-9 h-9 bg-gradient-to-br from-orange-500 to-amber-600 rounded-full flex items-center justify-center text-white font-bold shadow-lg">
                  {user?.name?.charAt(0) || 'S'}
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-white">{user?.name || 'Shop Staff'}</p>
                  <p className="text-xs text-orange-200 capitalize font-medium">
                    {user?.role === 'shop_manager' ? 'Shop Manager' : user?.role === 'shop_hand' ? 'Shop Hand' : 'Admin'}
                  </p>
                </div>
              </div>

              <button
                onClick={handleRefresh}
                disabled={refreshing}
                className="p-2.5 bg-white/10 hover:bg-white/20 text-white rounded-xl transition-all border border-white/20"
              >
                <RefreshCw size={18} className={refreshing ? 'animate-spin' : ''} />
              </button>

              <button
                onClick={handleLogout}
                className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white rounded-xl transition-all shadow-lg font-medium text-sm"
              >
                <LogOut size={16} />
                <span className="hidden sm:inline">Logout</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-6 max-w-7xl">
        {/* ============================================================ */}
        {/* Welcome + Stats Row */}
        {/* ============================================================ */}
        <div className="mb-8">
          <h1 className="text-3xl sm:text-4xl font-bold text-gray-800 mb-1">
            Shop Dashboard
          </h1>
          <p className="text-gray-500 font-medium">
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
          <div className="bg-white rounded-2xl border border-yellow-200 p-5 shadow-lg hover:shadow-xl transition-shadow">
            <div className="flex items-center justify-between mb-2">
              <Clock size={20} className="text-yellow-600" />
              <span className="text-xs font-bold text-yellow-600 bg-yellow-100 px-2 py-0.5 rounded-full">QUEUE</span>
            </div>
            <p className="text-3xl font-bold text-gray-800">{stats?.pending_work_orders ?? '—'}</p>
            <p className="text-sm text-gray-500 mt-1">Pending</p>
          </div>

          <div className="bg-white rounded-2xl border border-orange-200 p-5 shadow-lg hover:shadow-xl transition-shadow">
            <div className="flex items-center justify-between mb-2">
              <Wrench size={20} className="text-orange-600" />
              <span className="text-xs font-bold text-orange-600 bg-orange-100 px-2 py-0.5 rounded-full">ACTIVE</span>
            </div>
            <p className="text-3xl font-bold text-gray-800">{stats?.in_progress_work_orders ?? '—'}</p>
            <p className="text-sm text-gray-500 mt-1">In Progress</p>
          </div>

          <div className="bg-white rounded-2xl border border-green-200 p-5 shadow-lg hover:shadow-xl transition-shadow">
            <div className="flex items-center justify-between mb-2">
              <CheckCircle size={20} className="text-green-600" />
              <span className="text-xs font-bold text-green-600 bg-green-100 px-2 py-0.5 rounded-full">DONE</span>
            </div>
            <p className="text-3xl font-bold text-gray-800">{stats?.completed_today ?? '—'}</p>
            <p className="text-sm text-gray-500 mt-1">Completed Today</p>
          </div>

          <div className="bg-white rounded-2xl border border-red-200 p-5 shadow-lg hover:shadow-xl transition-shadow">
            <div className="flex items-center justify-between mb-2">
              <AlertTriangle size={20} className="text-red-600" />
              <span className="text-xs font-bold text-red-600 bg-red-100 px-2 py-0.5 rounded-full">URGENT</span>
            </div>
            <p className="text-3xl font-bold text-gray-800">{stats?.critical_priority ?? '—'}</p>
            <p className="text-sm text-gray-500 mt-1">Critical</p>
          </div>

          <div className="bg-white rounded-2xl border border-purple-200 p-5 shadow-lg hover:shadow-xl transition-shadow">
            <div className="flex items-center justify-between mb-2">
              <Calendar size={20} className="text-purple-600" />
              <span className="text-xs font-bold text-purple-600 bg-purple-100 px-2 py-0.5 rounded-full">SCHED</span>
            </div>
            <p className="text-3xl font-bold text-gray-800">{stats?.overdue_scheduled ?? '—'}</p>
            <p className="text-sm text-gray-500 mt-1">Overdue Maint.</p>
          </div>
        </div>

        {/* ============================================================ */}
        {/* Active Work Timer Banner */}
        {/* ============================================================ */}
        {activeTicket && !showCompletionForm && (
          <div className="mb-6 bg-gradient-to-r from-green-600 to-emerald-600 rounded-2xl p-5 shadow-xl text-white">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 bg-white/20 rounded-2xl flex items-center justify-center">
                  <Wrench size={28} />
                </div>
                <div>
                  <p className="text-sm font-medium text-green-100">Currently Working On</p>
                  <p className="text-xl font-bold">
                    {workOrders.find(wo => wo.id === activeTicket)?.title || 'Work Order'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-center">
                  <p className="text-3xl font-mono font-bold">{formatTimer(ticketTimer)}</p>
                  <p className="text-xs text-green-200">Elapsed Time</p>
                </div>
                <button
                  onClick={stopWorkTicket}
                  className="px-6 py-3 bg-red-500 hover:bg-red-600 text-white rounded-xl font-bold shadow-lg transition-colors"
                >
                  Stop & Complete
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ============================================================ */}
        {/* Completion Form Modal */}
        {/* ============================================================ */}
        {showCompletionForm && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-start justify-center overflow-y-auto pt-8 pb-8">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl mx-4">
              <div className="p-6 border-b border-gray-200 bg-gradient-to-r from-green-50 to-emerald-50 rounded-t-3xl">
                <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-3">
                  <FileText className="text-green-600" size={28} />
                  Complete Work Order
                </h2>
                <p className="text-gray-500 mt-1">
                  Time worked: <span className="font-mono font-bold text-green-700">{formatTimer(ticketTimer)}</span>
                </p>
              </div>

              <div className="p-6 space-y-5">
                {/* Issue Found */}
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">
                    What was the issue? <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    value={completionForm.issue_found}
                    onChange={e => setCompletionForm(prev => ({ ...prev, issue_found: e.target.value }))}
                    className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:ring-2 focus:ring-green-500 focus:border-green-500 text-sm"
                    rows={3}
                    placeholder="Describe the issue you found..."
                  />
                </div>

                {/* Work Performed */}
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">
                    How did you fix it? <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    value={completionForm.work_performed}
                    onChange={e => setCompletionForm(prev => ({ ...prev, work_performed: e.target.value }))}
                    className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:ring-2 focus:ring-green-500 focus:border-green-500 text-sm"
                    rows={3}
                    placeholder="Describe the work you performed..."
                  />
                </div>

                {/* Parts Used */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm font-bold text-gray-700">Parts / Materials Used</label>
                    <button
                      onClick={addPart}
                      className="inline-flex items-center gap-1 px-3 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg text-xs font-bold transition-colors"
                    >
                      <Plus size={14} /> Add Part
                    </button>
                  </div>
                  {completionForm.parts_used.length === 0 ? (
                    <p className="text-sm text-gray-400 italic">No parts added yet</p>
                  ) : (
                    <div className="space-y-2">
                      {completionForm.parts_used.map((part, idx) => (
                        <div key={idx} className="flex items-center gap-2">
                          <input
                            type="text"
                            value={part.name}
                            onChange={e => updatePart(idx, 'name', e.target.value)}
                            className="flex-1 px-3 py-2 rounded-lg border border-gray-300 text-sm"
                            placeholder="Part name"
                          />
                          <input
                            type="number"
                            value={part.quantity}
                            onChange={e => updatePart(idx, 'quantity', parseInt(e.target.value) || 0)}
                            className="w-20 px-3 py-2 rounded-lg border border-gray-300 text-sm text-center"
                            placeholder="Qty"
                            min="1"
                          />
                          <div className="relative">
                            <span className="absolute left-3 top-2 text-gray-400 text-sm">$</span>
                            <input
                              type="number"
                              value={part.unit_cost || ''}
                              onChange={e => updatePart(idx, 'unit_cost', parseFloat(e.target.value) || 0)}
                              className="w-28 px-3 py-2 pl-7 rounded-lg border border-gray-300 text-sm"
                              placeholder="Unit cost"
                              step="0.01"
                            />
                          </div>
                          <span className="text-sm font-bold text-gray-600 w-20 text-right">
                            ${(part.quantity * part.unit_cost).toFixed(2)}
                          </span>
                          <button
                            onClick={() => removePart(idx)}
                            className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          >
                            <X size={16} />
                          </button>
                        </div>
                      ))}
                      <div className="text-right text-sm font-bold text-gray-700 pr-10">
                        Parts Total: ${completionForm.parts_used.reduce((s, p) => s + p.quantity * p.unit_cost, 0).toFixed(2)}
                      </div>
                    </div>
                  )}
                </div>

                {/* Labor Cost */}
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">Labor Cost ($)</label>
                  <div className="relative w-48">
                    <span className="absolute left-3 top-3 text-gray-400">$</span>
                    <input
                      type="number"
                      value={completionForm.labor_cost}
                      onChange={e => setCompletionForm(prev => ({ ...prev, labor_cost: e.target.value }))}
                      className="w-full px-3 py-2.5 pl-7 rounded-xl border border-gray-300 focus:ring-2 focus:ring-green-500 text-sm"
                      placeholder="0.00"
                      step="0.01"
                    />
                  </div>
                </div>

                {/* Notes */}
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">Additional Notes</label>
                  <textarea
                    value={completionForm.notes}
                    onChange={e => setCompletionForm(prev => ({ ...prev, notes: e.target.value }))}
                    className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:ring-2 focus:ring-green-500 text-sm"
                    rows={2}
                    placeholder="Any additional notes..."
                  />
                </div>
              </div>

              {/* Actions */}
              <div className="p-6 border-t border-gray-200 flex items-center justify-between bg-gray-50 rounded-b-3xl">
                <button
                  onClick={() => {
                    setShowCompletionForm(false);
                    // Resume timer
                    const interval = setInterval(() => {
                      setTicketTimer(prev => prev + 1);
                    }, 1000);
                    setTimerInterval(interval);
                  }}
                  className="px-5 py-2.5 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-xl font-medium text-sm transition-colors"
                >
                  Resume Work
                </button>
                <button
                  onClick={submitCompletion}
                  disabled={submitting || !completionForm.issue_found || !completionForm.work_performed}
                  className="inline-flex items-center gap-2 px-6 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-xl font-bold text-sm transition-colors disabled:opacity-50 shadow-lg"
                >
                  {submitting ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <CheckCircle size={16} />
                  )}
                  {submitting ? 'Submitting...' : 'Submit & Complete'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ============================================================ */}
        {/* Create Work Order Modal */}
        {/* ============================================================ */}
        {showCreateWO && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-start justify-center overflow-y-auto pt-8 pb-8">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg mx-4">
              <div className="p-6 border-b border-gray-200 bg-gradient-to-r from-orange-50 to-amber-50 rounded-t-3xl">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-bold text-gray-800 flex items-center gap-3">
                    <Plus className="text-orange-600" size={24} />
                    New Work Order
                  </h2>
                  <button
                    onClick={() => {
                      setShowCreateWO(false);
                      setEquipmentSearch('');
                      setEquipmentResults([]);
                    }}
                    className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                  >
                    <X size={20} className="text-gray-400" />
                  </button>
                </div>
              </div>

              <form onSubmit={createWorkOrder} className="p-6 space-y-4">
                {/* Equipment Unit Search */}
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">
                    Equipment Unit <span className="text-red-500">*</span>
                  </label>
                  {createWOForm.unit_id ? (
                    <div className="flex items-center gap-2 bg-orange-50 border border-orange-200 rounded-xl px-4 py-3">
                      <Package size={18} className="text-orange-600" />
                      <div className="flex-1">
                        <p className="text-sm font-bold text-gray-800">
                          {equipmentResults.find(e => e.id === createWOForm.unit_id)?.name || 'Selected Equipment'}
                        </p>
                        <p className="text-xs text-gray-500 font-mono">
                          {equipmentResults.find(e => e.id === createWOForm.unit_id)?.pontifex_id || ''}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setCreateWOForm(f => ({ ...f, unit_id: '' }));
                          setEquipmentSearch('');
                        }}
                        className="p-1 hover:bg-orange-100 rounded-lg transition-colors"
                      >
                        <X size={16} className="text-gray-500" />
                      </button>
                    </div>
                  ) : (
                    <div className="relative">
                      <Search size={16} className="absolute left-3 top-3 text-gray-400" />
                      <input
                        type="text"
                        value={equipmentSearch}
                        onChange={(e) => setEquipmentSearch(e.target.value)}
                        placeholder="Search by name or Patriot ID..."
                        className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-gray-300 focus:ring-2 focus:ring-orange-500 focus:border-orange-500 text-sm"
                      />
                      {equipmentSearchLoading && (
                        <Loader2 size={16} className="absolute right-3 top-3 text-gray-400 animate-spin" />
                      )}
                      {equipmentResults.length > 0 && !createWOForm.unit_id && (
                        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-xl z-10 max-h-48 overflow-y-auto">
                          {equipmentResults.map((eq: any) => (
                            <button
                              key={eq.id}
                              type="button"
                              onClick={() => {
                                setCreateWOForm(f => ({ ...f, unit_id: eq.id }));
                                setEquipmentSearch('');
                              }}
                              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-orange-50 text-left transition-colors border-b border-gray-100 last:border-b-0"
                            >
                              <Package size={16} className="text-gray-400 flex-shrink-0" />
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-bold text-gray-700 truncate">{eq.name}</p>
                                <p className="text-xs text-gray-400">
                                  <span className="font-mono">{eq.pontifex_id}</span>
                                  {eq.manufacturer && <span className="ml-2">{eq.manufacturer}</span>}
                                </p>
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Title */}
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">
                    Title <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={createWOForm.title}
                    onChange={(e) => setCreateWOForm(f => ({ ...f, title: e.target.value }))}
                    placeholder="Brief description of the work needed"
                    required
                    className="w-full px-4 py-2.5 rounded-xl border border-gray-300 focus:ring-2 focus:ring-orange-500 focus:border-orange-500 text-sm"
                  />
                </div>

                {/* Description */}
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">Description</label>
                  <textarea
                    value={createWOForm.description}
                    onChange={(e) => setCreateWOForm(f => ({ ...f, description: e.target.value }))}
                    placeholder="Detailed description..."
                    rows={3}
                    className="w-full px-4 py-2.5 rounded-xl border border-gray-300 focus:ring-2 focus:ring-orange-500 focus:border-orange-500 text-sm resize-none"
                  />
                </div>

                {/* Priority + Estimated Hours */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-2">Priority</label>
                    <div className="grid grid-cols-2 gap-1.5">
                      {['low', 'normal', 'high', 'critical'].map(p => (
                        <button
                          key={p}
                          type="button"
                          onClick={() => setCreateWOForm(f => ({ ...f, priority: p }))}
                          className={`py-1.5 px-2 rounded-lg text-xs font-bold border-2 transition-all capitalize ${
                            createWOForm.priority === p
                              ? p === 'critical' ? 'bg-red-100 border-red-400 text-red-700'
                                : p === 'high' ? 'bg-orange-100 border-orange-400 text-orange-700'
                                : p === 'normal' ? 'bg-blue-100 border-blue-400 text-blue-700'
                                : 'bg-gray-100 border-gray-400 text-gray-700'
                              : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'
                          }`}
                        >
                          {p}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-2">Estimated Hours</label>
                    <input
                      type="number"
                      step="0.5"
                      min="0"
                      value={createWOForm.estimated_hours}
                      onChange={(e) => setCreateWOForm(f => ({ ...f, estimated_hours: e.target.value }))}
                      placeholder="e.g. 2.5"
                      className="w-full px-4 py-2.5 rounded-xl border border-gray-300 focus:ring-2 focus:ring-orange-500 focus:border-orange-500 text-sm"
                    />
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setShowCreateWO(false);
                      setEquipmentSearch('');
                      setEquipmentResults([]);
                    }}
                    className="flex-1 px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-medium text-sm transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={creatingWO || !createWOForm.unit_id || !createWOForm.title.trim()}
                    className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-orange-600 hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl font-bold text-sm transition-colors shadow-lg"
                  >
                    {creatingWO ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : (
                      <Plus size={16} />
                    )}
                    {creatingWO ? 'Creating...' : 'Create Work Order'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ============================================================ */}
        {/* Two Column Layout: Work Orders + Sidebar */}
        {/* ============================================================ */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main: Work Orders */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
              {/* Header */}
              <div className="p-5 border-b border-gray-100 flex items-center justify-between flex-wrap gap-3">
                <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                  <ClipboardList size={22} className="text-orange-600" />
                  Work Orders
                </h2>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowCreateWO(true)}
                    className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-orange-600 hover:bg-orange-700 text-white rounded-lg text-sm font-bold shadow-md transition-colors"
                  >
                    <Plus size={16} />
                    New WO
                  </button>
                  {['active', 'completed', 'all'].map(filter => (
                    <button
                      key={filter}
                      onClick={() => setStatusFilter(filter)}
                      className={`px-4 py-1.5 rounded-lg text-sm font-bold transition-colors ${
                        statusFilter === filter
                          ? 'bg-orange-600 text-white shadow-md'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      {filter === 'active' ? 'Active' : filter === 'completed' ? 'Completed' : 'All'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Work Order List */}
              {workOrdersLoading ? (
                <div className="p-12 text-center">
                  <Loader2 className="animate-spin w-8 h-8 text-orange-500 mx-auto mb-3" />
                  <p className="text-gray-500">Loading work orders...</p>
                </div>
              ) : workOrders.length === 0 ? (
                <div className="p-12 text-center">
                  <Wrench className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                  <p className="text-gray-500 font-medium text-lg">No work orders found</p>
                  <p className="text-gray-400 text-sm mt-1">
                    {statusFilter === 'active' ? 'All caught up! No pending maintenance.' : 'No matching work orders.'}
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {workOrders.map(wo => {
                    const isExpanded = expandedWO === wo.id;
                    return (
                      <div key={wo.id} className="hover:bg-gray-50/50 transition-colors">
                        {/* Summary Row */}
                        <div
                          className="p-4 cursor-pointer flex items-center gap-4"
                          onClick={() => setExpandedWO(isExpanded ? null : wo.id)}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                              <PriorityBadge priority={wo.priority} />
                              <StatusBadge status={wo.status} />
                              {wo.unit_pontifex_id && (
                                <span className="text-xs font-mono text-gray-400 bg-gray-100 px-2 py-0.5 rounded">
                                  {wo.unit_pontifex_id}
                                </span>
                              )}
                            </div>
                            <h3 className="font-bold text-gray-800 truncate">{wo.title}</h3>
                            <p className="text-sm text-gray-500 mt-0.5">
                              {wo.unit_name || 'Unknown equipment'}
                              {wo.assigned_to_name && (
                                <span className="ml-2 text-blue-600">• Assigned to {wo.assigned_to_name}</span>
                              )}
                            </p>
                          </div>

                          <div className="flex items-center gap-2 flex-shrink-0">
                            {/* Start work button (only for pending/assigned items not already active) */}
                            {['pending', 'assigned'].includes(wo.status) && activeTicket !== wo.id && !activeTicket && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  startWorkTicket(wo.id);
                                }}
                                className="inline-flex items-center gap-1.5 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-xl text-sm font-bold shadow-md transition-colors"
                              >
                                <Play size={14} />
                                Start
                              </button>
                            )}
                            {isExpanded ? <ChevronUp size={18} className="text-gray-400" /> : <ChevronDown size={18} className="text-gray-400" />}
                          </div>
                        </div>

                        {/* Expanded Details */}
                        {isExpanded && (
                          <div className="px-4 pb-4 pt-0">
                            <div className="bg-gray-50 rounded-xl p-4 space-y-3">
                              {wo.description && (
                                <div>
                                  <p className="text-xs font-bold text-gray-500 uppercase mb-1">Description</p>
                                  <p className="text-sm text-gray-700">{wo.description}</p>
                                </div>
                              )}
                              {wo.issue_found && (
                                <div>
                                  <p className="text-xs font-bold text-gray-500 uppercase mb-1">Issue Found</p>
                                  <p className="text-sm text-gray-700">{wo.issue_found}</p>
                                </div>
                              )}
                              {wo.work_performed && (
                                <div>
                                  <p className="text-xs font-bold text-gray-500 uppercase mb-1">Work Performed</p>
                                  <p className="text-sm text-gray-700">{wo.work_performed}</p>
                                </div>
                              )}
                              {wo.parts_used && wo.parts_used.length > 0 && (
                                <div>
                                  <p className="text-xs font-bold text-gray-500 uppercase mb-1">Parts Used</p>
                                  <div className="space-y-1">
                                    {wo.parts_used.map((p: any, i: number) => (
                                      <p key={i} className="text-sm text-gray-700">
                                        {p.name} × {p.quantity} @ ${p.unit_cost?.toFixed(2)} = <span className="font-bold">${(p.quantity * p.unit_cost).toFixed(2)}</span>
                                      </p>
                                    ))}
                                  </div>
                                </div>
                              )}
                              {(wo.total_cost !== null && wo.total_cost > 0) && (
                                <div className="flex items-center gap-4 pt-2 border-t border-gray-200">
                                  <div>
                                    <span className="text-xs text-gray-500">Parts:</span>
                                    <span className="ml-1 text-sm font-bold">${(wo.parts_total_cost || 0).toFixed(2)}</span>
                                  </div>
                                  <div>
                                    <span className="text-xs text-gray-500">Labor:</span>
                                    <span className="ml-1 text-sm font-bold">${(wo.labor_cost || 0).toFixed(2)}</span>
                                  </div>
                                  <div>
                                    <span className="text-xs text-gray-500">Total:</span>
                                    <span className="ml-1 text-sm font-bold text-green-700">${wo.total_cost.toFixed(2)}</span>
                                  </div>
                                  {wo.actual_hours && (
                                    <div>
                                      <span className="text-xs text-gray-500">Time:</span>
                                      <span className="ml-1 text-sm font-bold">{wo.actual_hours.toFixed(1)}h</span>
                                    </div>
                                  )}
                                </div>
                              )}
                              {wo.notes && (
                                <div>
                                  <p className="text-xs font-bold text-gray-500 uppercase mb-1">Notes</p>
                                  <p className="text-sm text-gray-700">{wo.notes}</p>
                                </div>
                              )}
                              <p className="text-xs text-gray-400 pt-1">
                                Created {new Date(wo.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                              </p>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Upcoming Scheduled Maintenance */}
            <div className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
              <div className="p-5 border-b border-gray-100">
                <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                  <Calendar size={20} className="text-purple-600" />
                  Upcoming Maintenance
                </h3>
              </div>
              <div className="p-4">
                {!stats?.upcoming_scheduled || stats.upcoming_scheduled.length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-4">No upcoming maintenance scheduled</p>
                ) : (
                  <div className="space-y-3">
                    {stats.upcoming_scheduled.map((item: any, idx: number) => (
                      <div key={idx} className="flex items-start gap-3 p-3 rounded-xl bg-gray-50 hover:bg-gray-100 transition-colors">
                        <div className={`w-2 h-2 rounded-full mt-2 flex-shrink-0 ${
                          item.priority === 'critical' ? 'bg-red-500' :
                          item.priority === 'high' ? 'bg-orange-500' : 'bg-blue-500'
                        }`}></div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-gray-700 truncate">{item.name}</p>
                          {item.unit_name && (
                            <p className="text-xs text-gray-500 truncate">{item.unit_name}</p>
                          )}
                          {item.next_due_at && (
                            <p className="text-xs text-gray-400 mt-0.5">
                              Due: {new Date(item.next_due_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                            </p>
                          )}
                          {item.category && !item.unit_name && (
                            <p className="text-xs text-gray-400 capitalize">All {item.category}s</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Recent Completions */}
            <div className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
              <div className="p-5 border-b border-gray-100">
                <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                  <CheckCircle size={20} className="text-green-600" />
                  Recent Completions
                </h3>
              </div>
              <div className="p-4">
                {!stats?.recent_completions || stats.recent_completions.length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-4">No recent completions</p>
                ) : (
                  <div className="space-y-3">
                    {stats.recent_completions.map((item: any, idx: number) => (
                      <div key={idx} className="flex items-start gap-3 p-3 rounded-xl bg-green-50/50">
                        <CheckCircle size={16} className="text-green-500 mt-0.5 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-gray-700 truncate">{item.title}</p>
                          <p className="text-xs text-gray-500 truncate">{item.unit_name || 'Equipment'}</p>
                          {item.completed_at && (
                            <p className="text-xs text-gray-400 mt-0.5">
                              {new Date(item.completed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                            </p>
                          )}
                        </div>
                        {item.total_cost > 0 && (
                          <span className="text-xs font-bold text-green-700 bg-green-100 px-2 py-0.5 rounded-full">
                            ${item.total_cost.toFixed(0)}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Quick Actions (Manager only) */}
            {isManager && (
              <div className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
                <div className="p-5 border-b border-gray-100">
                  <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                    <Shield size={20} className="text-amber-600" />
                    Manager Actions
                  </h3>
                </div>
                <div className="p-4 space-y-2">
                  <Link
                    href="/dashboard/admin/equipment-units"
                    className="flex items-center gap-3 p-3 rounded-xl hover:bg-orange-50 transition-colors group"
                  >
                    <div className="w-10 h-10 bg-orange-100 rounded-xl flex items-center justify-center group-hover:bg-orange-200 transition-colors">
                      <Package size={18} className="text-orange-600" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-gray-700">Equipment Management</p>
                      <p className="text-xs text-gray-500">View all units, NFC tags</p>
                    </div>
                    <ChevronRight size={16} className="text-gray-300 ml-auto" />
                  </Link>
                  <Link
                    href="/dashboard/inventory"
                    className="flex items-center gap-3 p-3 rounded-xl hover:bg-blue-50 transition-colors group"
                  >
                    <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center group-hover:bg-blue-200 transition-colors">
                      <ClipboardList size={18} className="text-blue-600" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-gray-700">Blade Management</p>
                      <p className="text-xs text-gray-500">Inventory & blade tracking</p>
                    </div>
                    <ChevronRight size={16} className="text-gray-300 ml-auto" />
                  </Link>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
