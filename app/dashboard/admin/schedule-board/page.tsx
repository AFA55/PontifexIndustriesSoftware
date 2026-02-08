'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Calendar, Send, Users, Clock, MapPin, History, LayoutGrid, List, CalendarDays, Filter, Search } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import JobHistoryModal from '@/components/JobHistoryModal';
import type { JobOrder as SharedJobOrder } from '@/types/job';
import type { OperatorSchedule as SharedOperatorSchedule } from '@/types/operator';

type ViewMode = 'timeline' | 'calendar' | 'columns';

// Equipment constants
const CORE_DRILLING_EQUIPMENT = {
  drills: ['Hilti DD250CA', 'Hilti DD500CA', 'Hilti DD160'],
  bitSizes: ['1/2" Bit', '3/4" Bit', '1" Bit', '1-1/4" Bit', '1-1/2" Bit', '2" Bit', '2-1/2" Bit', '3" Bit', '4" Bit', '5" Bit', '6" Bit', '8" Bit', '10" Bit', '12" Bit'],
  ladders: ['6ft Ladder', '8ft Ladder', '10ft Ladder', '12ft Ladder'],
  lifts: ['Scissor Lift'],
  accessories: ['Plastic', 'Vacuum Base', 'Drill Extensions', 'Tape', 'Sticky Spray'],
  cords: ['50ft Extension Cord', '100ft Extension Cord', '150ft Extension Cord'],
  vacuums: ['Hilti Vacuum', 'Regular Vacuum'],
  power: ['Portable Generator'],
};

const WALL_SAWING_EQUIPMENT = {
  saws: ['Pentruder Wall Saw'],
  hydraulics: ['100ft 480 Cord', '200ft 480 Cord', '250ft 480 Hose'],
  barsAndChains: ['10\' Bar and Chain', '15\' Bar and Chain', '24" Bar and Chain'],
  accessories: ['Slurry Drums', 'Plastic'],
};

const SLAB_SAWING_EQUIPMENT = {
  blades: ['20" Blade', '26" Blade', '30" Blade', '36" Blade', '42" Blade', '54" Blade'],
  guards: ['20" Guard', '26" Guard', '30" Guard', '36" Guard', '42" Guard', '54" Guard'],
  saws: ['5000 Slab Saw', '7000 Slab Saw', 'Electric Slab Saw'],
  hydraulics: ['100ft 480 Cord', '200ft 480 Cord'],
  accessories: ['Slurry Drums', 'Plastic'],
};

const HAND_SAWING_EQUIPMENT = {
  saws: ['20" Handsaw', '24" Handsaw', '30" Handsaw'],
  blades: ['20" Blade', '24" Blade', '30" Blade'],
  accessories: ['Plastic Sheeting', 'Water Bucket'],
  powerUnits: ['5hp Power Unit', '13hp Power Unit', '20hp Power Unit'],
  hydraulics: ['Hydraulic Hose (50ft)', 'Hydraulic Hose (100ft)', 'Hydraulic Hose (150ft)', 'Hydraulic Hose (200ft)'],
};

const commonEquipment = [
  ...CORE_DRILLING_EQUIPMENT.drills,
  ...CORE_DRILLING_EQUIPMENT.bitSizes,
  ...CORE_DRILLING_EQUIPMENT.ladders,
  ...CORE_DRILLING_EQUIPMENT.lifts,
  ...CORE_DRILLING_EQUIPMENT.accessories,
  ...CORE_DRILLING_EQUIPMENT.cords,
  ...CORE_DRILLING_EQUIPMENT.vacuums,
  ...CORE_DRILLING_EQUIPMENT.power,
  ...WALL_SAWING_EQUIPMENT.saws,
  ...WALL_SAWING_EQUIPMENT.hydraulics,
  ...WALL_SAWING_EQUIPMENT.barsAndChains,
  ...WALL_SAWING_EQUIPMENT.accessories,
  ...SLAB_SAWING_EQUIPMENT.blades,
  ...SLAB_SAWING_EQUIPMENT.guards,
  ...SLAB_SAWING_EQUIPMENT.saws,
  ...SLAB_SAWING_EQUIPMENT.hydraulics,
  ...SLAB_SAWING_EQUIPMENT.accessories,
  ...HAND_SAWING_EQUIPMENT.saws,
  ...HAND_SAWING_EQUIPMENT.blades,
  ...HAND_SAWING_EQUIPMENT.accessories,
  ...HAND_SAWING_EQUIPMENT.powerUnits,
  ...HAND_SAWING_EQUIPMENT.hydraulics,
  'Wall Saw', 'Slab Saw', 'Hand Saw', 'Diamond Blades', 'Water Hose (250\')', 'Water Tank', 'Safety Gear',
];

/**
 * Schedule Board extends the shared JobOrder with operator_email
 * for SMS dispatch. Uses Pick to keep only the fields this page needs
 * while staying linked to the single source of truth.
 */
type JobOrder = Pick<SharedJobOrder,
  | 'id' | 'job_number' | 'title' | 'customer_name'
  | 'location' | 'address' | 'scheduled_date' | 'end_date'
  | 'arrival_time' | 'shop_arrival_time' | 'assigned_to'
  | 'operator_name' | 'status' | 'foreman_name' | 'foreman_phone'
  | 'description' | 'equipment_needed' | 'priority'
> & {
  /** Extra field for SMS dispatch — not on the shared type */
  operator_email: string;
};

interface OperatorSchedule {
  operator_id: string;
  operator_name: string;
  operator_email: string;
  jobs: JobOrder[];
}

export default function ScheduleBoardPage() {
  const router = useRouter();
  const [schedules, setSchedules] = useState<OperatorSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [selectedDate, setSelectedDate] = useState(() => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow.toISOString().split('T')[0];
  });
  const [weekStartDate, setWeekStartDate] = useState(() => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow.toISOString().split('T')[0];
  });
  const [allJobsForWeek, setAllJobsForWeek] = useState<{ [date: string]: JobOrder[] }>({});
  const [editingJob, setEditingJob] = useState<JobOrder | null>(null);
  const [saving, setSaving] = useState(false);
  const [viewingHistory, setViewingHistory] = useState<{ jobId: string; jobNumber: string } | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('timeline');
  const [searchQuery, setSearchQuery] = useState('');
  const [operators, setOperators] = useState<Array<{ id: string; full_name: string; email: string }>>([]);
  const [showOperatorDropdown, setShowOperatorDropdown] = useState(false);
  const [equipmentSearch, setEquipmentSearch] = useState('');
  const [showEquipmentDropdown, setShowEquipmentDropdown] = useState(false);
  const [selectedDayView, setSelectedDayView] = useState<{ date: string; jobs: JobOrder[] } | null>(null);
  const [showDeleteConfirmation, setShowDeleteConfirmation] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    fetchOperators();
    if (viewMode === 'calendar') {
      fetchWeekSchedules();
    } else {
      fetchSchedules();
    }
  }, [selectedDate, viewMode, weekStartDate]);

  const fetchOperators = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const { data, error } = await supabase
        .from('users')
        .select('id, full_name, email')
        .eq('role', 'operator')
        .order('full_name');

      if (!error && data) {
        setOperators(data);
      }
    } catch (error) {
      console.error('Error fetching operators:', error);
    }
  };

  const fetchSchedules = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push('/login');
        return;
      }

      console.log('Fetching schedules for date:', selectedDate);
      const response = await fetch(`/api/job-orders?scheduled_date=${selectedDate}`, {
        headers: {
          'Authorization': `Bearer ${session.access_token}`
        }
      });

      if (response.ok) {
        const result = await response.json();
        console.log('Fetched job orders:', result.data);
        if (result.success) {
          // Group jobs by operator
          const grouped = groupJobsByOperator(result.data);
          console.log('Grouped schedules:', grouped);
          setSchedules(grouped);
        }
      } else {
        console.error('Failed to fetch schedules:', await response.text());
      }
    } catch (error) {
      console.error('Error fetching schedules:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchWeekSchedules = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push('/login');
        return;
      }

      setLoading(true);
      const weekJobs: { [date: string]: JobOrder[] } = {};

      // Fetch jobs for 6 days starting from weekStartDate
      for (let i = 0; i < 6; i++) {
        const date = new Date(weekStartDate);
        date.setDate(date.getDate() + i);
        const dateString = date.toISOString().split('T')[0];

        const response = await fetch(`/api/job-orders?scheduled_date=${dateString}`, {
          headers: {
            'Authorization': `Bearer ${session.access_token}`
          }
        });

        if (response.ok) {
          const result = await response.json();
          if (result.success) {
            weekJobs[dateString] = result.data;
          }
        }
      }

      setAllJobsForWeek(weekJobs);
    } catch (error) {
      console.error('Error fetching week schedules:', error);
    } finally {
      setLoading(false);
    }
  };

  const groupJobsByOperator = (jobs: JobOrder[]): OperatorSchedule[] => {
    const grouped = new Map<string, OperatorSchedule>();

    jobs.forEach(job => {
      // Handle unassigned jobs separately
      const operatorId = job.assigned_to || 'unassigned';
      const operatorName = job.assigned_to ? (job.operator_name || 'Unknown') : 'Unassigned';
      const operatorEmail = job.assigned_to ? (job.operator_email || '') : '';

      if (!grouped.has(operatorId)) {
        grouped.set(operatorId, {
          operator_id: operatorId,
          operator_name: operatorName,
          operator_email: operatorEmail,
          jobs: []
        });
      }

      grouped.get(operatorId)!.jobs.push(job);
    });

    // Sort jobs within each operator by shop_arrival_time
    grouped.forEach(schedule => {
      schedule.jobs.sort((a, b) => {
        const timeA = a.shop_arrival_time || a.arrival_time || '';
        const timeB = b.shop_arrival_time || b.arrival_time || '';
        return timeA.localeCompare(timeB);
      });
    });

    // Convert to array and sort: unassigned first, then by operator name
    const schedulesArray = Array.from(grouped.values());
    return schedulesArray.sort((a, b) => {
      if (a.operator_id === 'unassigned') return -1;
      if (b.operator_id === 'unassigned') return 1;
      return a.operator_name.localeCompare(b.operator_name);
    });
  };

  const handleSendSchedules = async () => {
    const assignedSchedules = schedules.filter(s => s.operator_id !== 'unassigned');

    if (assignedSchedules.length === 0) {
      alert('No assigned schedules to send for this date');
      return;
    }

    const confirmSend = confirm(
      `Send schedule notifications to ${assignedSchedules.length} operator(s) for ${new Date(selectedDate).toLocaleDateString()}?`
    );

    if (!confirmSend) return;

    setSending(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        alert('Session expired. Please log in again.');
        router.push('/login');
        return;
      }

      const response = await fetch('/api/admin/send-schedule', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          scheduled_date: selectedDate,
          operator_schedules: assignedSchedules
        })
      });

      const result = await response.json();

      if (result.success) {
        alert(`✅ Schedule sent to ${result.sent_count} operator(s)!`);
      } else {
        alert(result.error || 'Failed to send schedules');
      }
    } catch (error) {
      console.error('Error sending schedules:', error);
      alert('Failed to send schedules. Please try again.');
    } finally {
      setSending(false);
    }
  };

  const openEditModal = (job: JobOrder) => {
    setEditingJob(job);
    setShowOperatorDropdown(false);
    setShowEquipmentDropdown(false);
    setEquipmentSearch('');
  };

  const closeEditModal = () => {
    setEditingJob(null);
    setShowOperatorDropdown(false);
    setShowEquipmentDropdown(false);
    setEquipmentSearch('');
  };

  const addEquipment = (item: string) => {
    if (!editingJob) return;
    const currentEquipment = editingJob.equipment_needed || [];
    if (!currentEquipment.includes(item)) {
      setEditingJob({
        ...editingJob,
        equipment_needed: [...currentEquipment, item]
      });
    }
    setEquipmentSearch('');
    setShowEquipmentDropdown(false);
  };

  const removeEquipment = (item: string) => {
    if (!editingJob) return;
    setEditingJob({
      ...editingJob,
      equipment_needed: (editingJob.equipment_needed || []).filter(e => e !== item)
    });
  };

  const handleDeleteJob = async () => {
    if (!editingJob) return;

    setDeleting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        alert('Session expired. Please log in again.');
        return;
      }

      const response = await fetch(`/api/admin/job-orders/${editingJob.id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${session.access_token}`
        }
      });

      if (response.ok) {
        alert('✅ Job deleted successfully!');
        setShowDeleteConfirmation(false);
        closeEditModal();
        await fetchSchedules();
        if (viewMode === 'calendar') {
          await fetchWeekSchedules();
        }
      } else {
        const error = await response.json();
        alert(`Failed to delete job: ${error.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Error deleting job:', error);
      alert('Failed to delete job. Please try again.');
    } finally {
      setDeleting(false);
    }
  };

  const handleSaveJob = async () => {
    if (!editingJob) return;

    setSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        alert('Session expired. Please log in again.');
        router.push('/login');
        return;
      }

      const response = await fetch(`/api/admin/job-orders/${editingJob.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          scheduled_date: editingJob.scheduled_date,
          end_date: editingJob.end_date || null,
          arrival_time: editingJob.arrival_time,
          shop_arrival_time: editingJob.shop_arrival_time,
          location: editingJob.location,
          address: editingJob.address,
          customer_name: editingJob.customer_name,
          foreman_name: editingJob.foreman_name,
          foreman_phone: editingJob.foreman_phone,
          equipment_needed: editingJob.equipment_needed,
          description: editingJob.description,
          assigned_to: editingJob.assigned_to || null
        })
      });

      const result = await response.json();

      if (response.ok) {
        alert('✅ Job updated successfully!');
        closeEditModal();
        await fetchSchedules();
      } else {
        alert(result.error || 'Failed to update job');
      }
    } catch (error) {
      console.error('Error updating job:', error);
      alert('Failed to update job. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const deleteJob = async (jobId: string, jobTitle: string) => {
    if (!confirm(`Are you sure you want to delete "${jobTitle}"?\n\nThis action cannot be undone.`)) {
      return;
    }

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        alert('Session expired. Please log in again.');
        router.push('/login');
        return;
      }

      const response = await fetch(`/api/job-orders/${jobId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${session.access_token}`
        }
      });

      const result = await response.json();

      if (response.ok) {
        alert('✅ Job deleted successfully!');
        await fetchSchedules();
      } else {
        alert(result.error || 'Failed to delete job');
      }
    } catch (error) {
      console.error('Error deleting job:', error);
      alert('Failed to delete job. Please try again.');
    }
  };

  const formatTime = (time: string | null) => {
    if (!time) return 'Not set';
    const [hours, minutes] = time.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour % 12 || 12;
    return `${displayHour}:${minutes} ${ampm}`;
  };

  const goToPreviousDay = () => {
    const currentDate = new Date(selectedDate);
    currentDate.setDate(currentDate.getDate() - 1);
    setSelectedDate(currentDate.toISOString().split('T')[0]);
  };

  const goToNextDay = () => {
    const currentDate = new Date(selectedDate);
    currentDate.setDate(currentDate.getDate() + 1);
    setSelectedDate(currentDate.toISOString().split('T')[0]);
  };

  const goToPreviousWeek = () => {
    const currentDate = new Date(weekStartDate);
    currentDate.setDate(currentDate.getDate() - 6);
    setWeekStartDate(currentDate.toISOString().split('T')[0]);
  };

  const goToNextWeek = () => {
    const currentDate = new Date(weekStartDate);
    currentDate.setDate(currentDate.getDate() + 6);
    setWeekStartDate(currentDate.toISOString().split('T')[0]);
  };

  const formatDisplayDate = (dateString: string) => {
    const date = new Date(dateString);
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) {
      return 'Today';
    } else if (date.toDateString() === tomorrow.toDateString()) {
      return 'Tomorrow';
    } else if (date.toDateString() === yesterday.toDateString()) {
      return 'Yesterday';
    } else {
      return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
    }
  };

  const totalJobs = schedules.reduce((sum, schedule) => sum + schedule.jobs.length, 0);
  const assignedOperators = schedules.filter(s => s.operator_id !== 'unassigned').length;

  // Color palette for different operators
  const operatorColors = [
    { border: 'border-purple-500', bg: 'bg-purple-100', text: 'text-purple-700', badge: 'bg-purple-500', hover: 'hover:border-purple-400', icon: 'text-purple-600' },
    { border: 'border-pink-500', bg: 'bg-pink-100', text: 'text-pink-700', badge: 'bg-pink-500', hover: 'hover:border-pink-400', icon: 'text-pink-600' },
    { border: 'border-blue-500', bg: 'bg-blue-100', text: 'text-blue-700', badge: 'bg-blue-500', hover: 'hover:border-blue-400', icon: 'text-blue-600' },
    { border: 'border-indigo-500', bg: 'bg-indigo-100', text: 'text-indigo-700', badge: 'bg-indigo-500', hover: 'hover:border-indigo-400', icon: 'text-indigo-600' },
    { border: 'border-violet-500', bg: 'bg-violet-100', text: 'text-violet-700', badge: 'bg-violet-500', hover: 'hover:border-violet-400', icon: 'text-violet-600' },
    { border: 'border-fuchsia-500', bg: 'bg-fuchsia-100', text: 'text-fuchsia-700', badge: 'bg-fuchsia-500', hover: 'hover:border-fuchsia-400', icon: 'text-fuchsia-600' },
    { border: 'border-rose-500', bg: 'bg-rose-100', text: 'text-rose-700', badge: 'bg-rose-500', hover: 'hover:border-rose-400', icon: 'text-rose-600' },
    { border: 'border-cyan-500', bg: 'bg-cyan-100', text: 'text-cyan-700', badge: 'bg-cyan-500', hover: 'hover:border-cyan-400', icon: 'text-cyan-600' },
  ];

  const getOperatorColor = (index: number) => {
    return operatorColors[index % operatorColors.length];
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-purple-50">
      {/* Header */}
      <div className="backdrop-blur-xl bg-white/90 border-b border-gray-200 sticky top-0 z-50 shadow-lg">
        <div className="container mx-auto px-4 md:px-6 py-3 md:py-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3 md:gap-4">
              <Link
                href="/dashboard/admin"
                className="p-2 bg-gray-100 hover:bg-gray-200 rounded-xl transition-all hover:scale-105"
                title="Back to Dashboard"
              >
                <svg className="w-5 h-5 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
              </Link>
              <div>
                <h1 className="text-lg md:text-xl font-bold text-gray-900 flex items-center gap-2">
                  <Calendar className="w-5 h-5 md:w-6 md:h-6 text-purple-600" />
                  Admin Dispatch Board
                </h1>
                <p className="text-gray-600 text-xs md:text-sm">Manage job assignments & schedules</p>
              </div>
            </div>

            <button
              onClick={handleSendSchedules}
              disabled={sending || assignedOperators === 0}
              className="w-full sm:w-auto px-4 md:px-6 py-2 md:py-3 bg-gradient-to-r from-purple-600 to-pink-500 hover:from-purple-700 hover:to-pink-600 text-white rounded-xl disabled:opacity-50 disabled:cursor-not-allowed transition-all font-bold flex items-center justify-center gap-2 shadow-lg hover:shadow-xl hover:scale-[1.02] text-sm md:text-base"
            >
              <Send className="w-4 h-4 md:w-5 md:h-5" />
              {sending ? 'Sending...' : 'Send Out Schedule'}
            </button>
          </div>
        </div>
      </div>

      {/* Date Selector & Stats */}
      <div className="container mx-auto px-4 md:px-6 py-4">
        <div className="bg-white rounded-xl md:rounded-2xl shadow-xl border border-gray-100 p-4 md:p-6">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 md:gap-6">
            {/* Left Side: Date Navigation */}
            <div className="flex items-center gap-3">
              <button
                onClick={goToPreviousDay}
                className="p-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl transition-all hover:scale-105"
                title="Previous Day"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
                </svg>
              </button>

              <div className="flex items-center gap-3 bg-gray-50 px-5 py-3 rounded-xl border border-gray-200">
                <Calendar className="w-5 h-5 text-purple-600" />
                <div>
                  <div className="text-xs font-semibold text-gray-600 uppercase">Viewing</div>
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-bold text-gray-900">{formatDisplayDate(selectedDate)}</span>
                    <input
                      type="date"
                      value={selectedDate}
                      onChange={(e) => setSelectedDate(e.target.value)}
                      className="px-2 py-1 rounded-lg border border-gray-300 focus:border-purple-500 focus:outline-none text-sm font-medium cursor-pointer hover:border-purple-400 text-gray-900"
                      style={{ colorScheme: 'light' }}
                    />
                  </div>
                </div>
              </div>

              <button
                onClick={goToNextDay}
                className="p-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl transition-all hover:scale-105"
                title="Next Day"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>

            {/* Center: View Mode Toggle */}
            <div className="flex items-center gap-2 bg-gray-50 p-1.5 rounded-xl border border-gray-200">
              <button
                onClick={() => setViewMode('timeline')}
                className={`px-4 py-2 rounded-lg font-semibold text-sm transition-all flex items-center gap-2 ${
                  viewMode === 'timeline'
                    ? 'bg-gradient-to-r from-purple-600 to-pink-500 text-white shadow-lg'
                    : 'text-gray-600 hover:bg-white hover:text-gray-900'
                }`}
              >
                <LayoutGrid className="w-4 h-4" />
                Timeline
              </button>
              <button
                onClick={() => setViewMode('calendar')}
                className={`px-4 py-2 rounded-lg font-semibold text-sm transition-all flex items-center gap-2 ${
                  viewMode === 'calendar'
                    ? 'bg-gradient-to-r from-purple-600 to-pink-500 text-white shadow-lg'
                    : 'text-gray-600 hover:bg-white hover:text-gray-900'
                }`}
              >
                <CalendarDays className="w-4 h-4" />
                Calendar
              </button>
              <button
                onClick={() => setViewMode('columns')}
                className={`px-4 py-2 rounded-lg font-semibold text-sm transition-all flex items-center gap-2 ${
                  viewMode === 'columns'
                    ? 'bg-gradient-to-r from-purple-600 to-pink-500 text-white shadow-lg'
                    : 'text-gray-600 hover:bg-white hover:text-gray-900'
                }`}
              >
                <List className="w-4 h-4" />
                Columns
              </button>
            </div>

            {/* Right Side: Stats */}
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 px-4 py-2 bg-purple-50 rounded-xl border border-purple-200">
                <Users className="w-5 h-5 text-purple-600" />
                <div>
                  <div className="text-xs font-semibold text-purple-600">Operators</div>
                  <div className="text-lg font-bold text-gray-900">{assignedOperators}</div>
                </div>
              </div>
              <div className="flex items-center gap-2 px-4 py-2 bg-blue-50 rounded-xl border border-blue-200">
                <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
                <div>
                  <div className="text-xs font-semibold text-blue-600">Jobs</div>
                  <div className="text-lg font-bold text-gray-900">{totalJobs}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Schedule Grid */}
      <div className="container mx-auto px-4 md:px-6 pb-6">
        {loading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600 mx-auto"></div>
            <p className="mt-4 text-gray-600">Loading schedules...</p>
          </div>
        ) : schedules.length === 0 && viewMode !== 'calendar' ? (
          <div className="bg-white rounded-3xl shadow-xl border border-gray-100 p-12 text-center">
            <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <Calendar className="w-10 h-10 text-purple-600" />
            </div>
            <h3 className="text-2xl font-bold text-gray-900 mb-2">No Jobs Scheduled</h3>
            <p className="text-gray-600 mb-6">No jobs scheduled for {new Date(selectedDate).toLocaleDateString()}</p>
            <Link
              href="/dashboard/admin/dispatch-scheduling"
              className="inline-block px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-500 hover:from-purple-700 hover:to-pink-600 text-white rounded-xl transition-all font-bold shadow-lg hover:shadow-xl hover:scale-[1.02]"
            >
              Create Job Order
            </Link>
          </div>
        ) : (
          <>
            {/* Timeline View */}
            {viewMode === 'timeline' && (
              <div className="bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden">
                {/* Timeline Header */}
                <div className="bg-gradient-to-r from-purple-600 to-pink-500 p-6 text-white">
                  <h2 className="text-xl font-bold">Timeline View - Daily Dispatch</h2>
                  <p className="text-purple-100 text-sm">Jobs organized by time and operator</p>
                </div>

                {/* Timeline Grid */}
                <div className="p-6 overflow-x-auto">
                  <div className="space-y-6">
                    {schedules.map((schedule, operatorIndex) => {
                      const isUnassigned = schedule.operator_id === 'unassigned';
                      const colors = isUnassigned ? null : getOperatorColor(operatorIndex);
                      return (
                        <div key={schedule.operator_id} className={`border-l-4 pl-6 ${isUnassigned ? 'border-orange-500' : colors?.border}`}>
                          {/* Operator Header */}
                          <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-4">
                              <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${
                                isUnassigned
                                  ? 'bg-orange-100 animate-pulse'
                                  : colors?.bg
                              }`}>
                                {isUnassigned ? (
                                  <svg className="w-6 h-6 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                  </svg>
                                ) : (
                                  <Users className={`w-6 h-6 ${colors?.icon}`} />
                                )}
                              </div>
                              <div>
                                <h3 className="text-lg font-bold text-gray-900">{schedule.operator_name}</h3>
                                <p className="text-sm text-gray-600">{isUnassigned ? 'Needs assignment' : schedule.operator_email}</p>
                              </div>
                            </div>
                            <div className={`px-4 py-2 rounded-full font-bold text-sm ${
                              isUnassigned
                                ? 'bg-orange-100 text-orange-700'
                                : `${colors?.bg} ${colors?.text}`
                            }`}>
                              {schedule.jobs.length} {schedule.jobs.length === 1 ? 'Job' : 'Jobs'}
                            </div>
                          </div>

                          {/* Jobs Timeline */}
                          <div className="space-y-3">
                            {schedule.jobs.map((job, index) => (
                              <div
                                key={job.id}
                                className={`group bg-gray-50 hover:bg-white rounded-xl p-4 border-2 transition-all hover:shadow-lg ${
                                  isUnassigned
                                    ? 'border-orange-200 hover:border-orange-400'
                                    : `border-gray-200 ${colors?.hover}`
                                }`}
                              >
                                <div className="flex items-start gap-4">
                                  {/* Job Number Badge */}
                                  <div className="flex-shrink-0">
                                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold ${
                                      isUnassigned
                                        ? 'bg-orange-500 text-white'
                                        : `${colors?.badge} text-white`
                                    }`}>
                                      #{index + 1}
                                    </div>
                                  </div>

                                  {/* Job Content */}
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-start justify-between gap-4 mb-3">
                                      <div className="flex-1 min-w-0">
                                        <h4 className="font-bold text-gray-900 text-base mb-1 truncate">{job.customer_name}</h4>
                                        <p className="text-xs text-gray-500">{job.job_number}</p>
                                      </div>
                                      {isUnassigned && (
                                        <span className="px-3 py-1 bg-orange-500 text-white rounded-full text-xs font-bold whitespace-nowrap">
                                          UNASSIGNED
                                        </span>
                                      )}
                                      {job.priority && job.priority !== 'medium' && (
                                        <span className={`px-3 py-1 rounded-full text-xs font-bold whitespace-nowrap ${
                                          job.priority === 'urgent' ? 'bg-red-500 text-white' :
                                          job.priority === 'high' ? 'bg-orange-500 text-white' :
                                          'bg-blue-500 text-white'
                                        }`}>
                                          {job.priority.toUpperCase()}
                                        </span>
                                      )}
                                    </div>

                                    {/* Time and Location Grid */}
                                    <div className="grid md:grid-cols-2 gap-3 mb-3">
                                      {/* Times */}
                                      <div className="space-y-2">
                                        {job.shop_arrival_time && (
                                          <div className="flex items-center gap-2 text-sm">
                                            <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center">
                                              <Clock className="w-4 h-4 text-purple-600" />
                                            </div>
                                            <div>
                                              <p className="text-xs text-gray-500">Shop</p>
                                              <p className="font-bold text-green-700">{formatTime(job.shop_arrival_time)}</p>
                                            </div>
                                          </div>
                                        )}
                                        <div className="flex items-center gap-2 text-sm">
                                          <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
                                            <Clock className="w-4 h-4 text-blue-600" />
                                          </div>
                                          <div>
                                            <p className="text-xs text-gray-500">Site</p>
                                            <p className="font-bold text-blue-700">{formatTime(job.arrival_time)}</p>
                                          </div>
                                        </div>
                                      </div>

                                      {/* Location */}
                                      <div className="flex items-start gap-2 p-3 bg-orange-50 rounded-xl">
                                        <MapPin className="w-5 h-5 text-orange-600 mt-0.5 flex-shrink-0" />
                                        <div className="min-w-0">
                                          <p className="text-sm font-bold text-gray-900 mb-1 truncate">{job.location}</p>
                                          <p className="text-xs text-gray-600 truncate">{job.customer_name}</p>
                                          {job.foreman_name && (
                                            <p className="text-xs text-gray-500 mt-1 truncate">
                                              Contact: {job.foreman_name}
                                            </p>
                                          )}
                                        </div>
                                      </div>
                                    </div>

                                    {/* Actions */}
                                    <div className="flex gap-2 flex-wrap">
                                      {isUnassigned && (
                                        <button
                                          onClick={() => openEditModal(job)}
                                          className="px-4 py-2 bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-700 text-white rounded-lg text-sm font-bold transition-all shadow-md hover:shadow-lg"
                                        >
                                          Assign Operator
                                        </button>
                                      )}
                                      <Link
                                        href={`/dashboard/admin/jobs/${job.id}`}
                                        className="px-4 py-2 bg-gradient-to-r from-blue-600 to-cyan-500 hover:from-blue-700 hover:to-cyan-600 text-white rounded-lg text-sm font-bold transition-all shadow-md hover:shadow-lg flex items-center gap-2"
                                      >
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                        </svg>
                                        View Progress
                                      </Link>
                                      <button
                                        onClick={() => openEditModal(job)}
                                        className="px-4 py-2 bg-gradient-to-r from-purple-600 to-pink-500 hover:from-purple-700 hover:to-pink-600 text-white rounded-lg text-sm font-bold transition-all shadow-md hover:shadow-lg"
                                      >
                                        Edit Details
                                      </button>
                                      <button
                                        onClick={() => setViewingHistory({ jobId: job.id, jobNumber: job.job_number })}
                                        className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm font-semibold transition-all flex items-center gap-2"
                                      >
                                        <History className="w-4 h-4" />
                                        History
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* Calendar View */}
            {viewMode === 'calendar' && (
              <div className="bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden">
                {/* Header with Week Navigation */}
                <div className="bg-gradient-to-r from-purple-600 to-pink-500 p-4 md:p-6 text-white">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-2">
                    <div>
                      <h2 className="text-lg md:text-xl font-bold">6-Day Calendar View</h2>
                      <p className="text-purple-100 text-xs md:text-sm">Weekly schedule overview</p>
                    </div>
                    <div className="flex items-center gap-2 md:gap-3">
                      <button
                        onClick={goToPreviousWeek}
                        className="p-2 bg-white/20 hover:bg-white/30 rounded-xl transition-all"
                        title="Previous 6 Days"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
                        </svg>
                      </button>
                      <button
                        onClick={goToNextWeek}
                        className="p-2 bg-white/20 hover:bg-white/30 rounded-xl transition-all"
                        title="Next 6 Days"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>

                {/* 6-Day Grid */}
                <div className="p-4 md:p-6 overflow-x-auto">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3 md:gap-4">
                    {Array.from({ length: 6 }).map((_, dayIndex) => {
                      const date = new Date(weekStartDate);
                      date.setDate(date.getDate() + dayIndex);
                      const dateString = date.toISOString().split('T')[0];
                      const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });
                      const dayDate = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                      const jobs = allJobsForWeek[dateString] || [];
                      const isToday = dateString === new Date().toISOString().split('T')[0];

                      return (
                        <div key={dateString} className={`flex flex-col border-2 rounded-xl overflow-hidden ${
                          isToday ? 'border-purple-500 shadow-lg' : 'border-gray-200'
                        }`}>
                          {/* Day Header - Clickable */}
                          <div
                            onClick={() => setSelectedDayView({ date: dateString, jobs })}
                            className={`p-3 md:p-4 text-center cursor-pointer transition-all hover:opacity-90 ${
                              isToday
                                ? 'bg-gradient-to-br from-purple-600 to-pink-500 text-white hover:from-purple-700 hover:to-pink-600'
                                : 'bg-gray-50 text-gray-900 hover:bg-gray-100'
                            }`}
                            title="Click to view all jobs for this day"
                          >
                            <div className="text-xs font-bold uppercase mb-1">{dayName}</div>
                            <div className="text-base md:text-lg font-bold">{dayDate}</div>
                            <div className="text-xs mt-1 opacity-80">{jobs.length} jobs</div>
                            <div className="text-xs mt-1 opacity-70">Tap to view all</div>
                          </div>

                          {/* Jobs List */}
                          <div className="flex-1 p-2 space-y-2 bg-gray-50 overflow-y-auto max-h-[400px] md:max-h-[600px]">
                            {jobs.length === 0 ? (
                              <div className="text-center py-8 text-gray-400">
                                <Calendar className="w-8 h-8 mx-auto mb-2 opacity-50" />
                                <p className="text-xs">No jobs</p>
                              </div>
                            ) : (
                              jobs.map((job) => (
                                <div
                                  key={job.id}
                                  onClick={() => openEditModal(job)}
                                  className="bg-white rounded-lg p-3 border border-gray-200 hover:border-purple-400 hover:shadow-md transition-all cursor-pointer"
                                >
                                  <div className="mb-2">
                                    <p className="text-xs font-bold text-gray-900 truncate" title={job.customer_name}>
                                      {job.customer_name}
                                    </p>
                                    <p className="text-xs text-gray-500">{job.job_number}</p>
                                  </div>

                                  {job.shop_arrival_time && (
                                    <div className="flex items-center gap-1 text-xs mb-1">
                                      <Clock className="w-3 h-3 text-purple-600" />
                                      <span className="text-green-700 font-semibold">{formatTime(job.shop_arrival_time)}</span>
                                    </div>
                                  )}

                                  <div className="flex items-center gap-1 text-xs mb-2">
                                    <Clock className="w-3 h-3 text-blue-600" />
                                    <span className="text-blue-700 font-semibold">{formatTime(job.arrival_time)}</span>
                                  </div>

                                  <div className="flex items-start gap-1 text-xs mb-2">
                                    <MapPin className="w-3 h-3 text-orange-600 mt-0.5 flex-shrink-0" />
                                    <span className="text-gray-600 truncate">{job.location}</span>
                                  </div>

                                  {job.operator_name && (
                                    <div className="flex items-center gap-1 text-xs">
                                      <Users className="w-3 h-3 text-purple-600" />
                                      <span className="text-purple-700 font-medium truncate">{job.operator_name}</span>
                                    </div>
                                  )}

                                  {!job.assigned_to && (
                                    <div className="mt-2">
                                      <span className="px-2 py-1 bg-orange-500 text-white rounded text-xs font-bold">
                                        UNASSIGNED
                                      </span>
                                    </div>
                                  )}

                                  {job.priority && job.priority !== 'medium' && (
                                    <div className="mt-2">
                                      <span className={`px-2 py-1 rounded text-xs font-bold ${
                                        job.priority === 'urgent' ? 'bg-red-500 text-white' :
                                        job.priority === 'high' ? 'bg-orange-500 text-white' :
                                        'bg-blue-500 text-white'
                                      }`}>
                                        {job.priority.toUpperCase()}
                                      </span>
                                    </div>
                                  )}
                                </div>
                              ))
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* Columns View (Original) */}
            {viewMode === 'columns' && (
              <div className="flex gap-4 overflow-x-auto pb-4">
                {schedules.map((schedule, operatorIndex) => {
                  const isUnassigned = schedule.operator_id === 'unassigned';
                  const colors = isUnassigned ? null : getOperatorColor(operatorIndex);
                  // Create gradient from badge color
                  const gradientClass = isUnassigned
                    ? 'bg-gradient-to-br from-orange-500 to-amber-600'
                    : colors?.badge === 'bg-purple-500' ? 'bg-gradient-to-br from-purple-500 to-purple-600' :
                      colors?.badge === 'bg-pink-500' ? 'bg-gradient-to-br from-pink-500 to-pink-600' :
                      colors?.badge === 'bg-blue-500' ? 'bg-gradient-to-br from-blue-500 to-blue-600' :
                      colors?.badge === 'bg-indigo-500' ? 'bg-gradient-to-br from-indigo-500 to-indigo-600' :
                      colors?.badge === 'bg-violet-500' ? 'bg-gradient-to-br from-violet-500 to-violet-600' :
                      colors?.badge === 'bg-fuchsia-500' ? 'bg-gradient-to-br from-fuchsia-500 to-fuchsia-600' :
                      colors?.badge === 'bg-rose-500' ? 'bg-gradient-to-br from-rose-500 to-rose-600' :
                      'bg-gradient-to-br from-cyan-500 to-cyan-600';
                  return (
                    <div
                      key={schedule.operator_id}
                      className={`flex-shrink-0 w-80 rounded-2xl shadow-xl overflow-hidden ${
                        isUnassigned ? 'border-2 border-orange-300' : 'border border-gray-200'
                      }`}
                      style={{ minWidth: '320px' }}
                    >
                      <div className={`p-4 ${gradientClass}`}>
                        <div className="flex items-center gap-3 mb-2">
                          <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-white/20">
                            {isUnassigned ? (
                              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                            ) : (
                              <Users className="w-5 h-5 text-white" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <h3 className="text-white font-bold text-lg truncate">{schedule.operator_name}</h3>
                            {!isUnassigned && (
                              <p className="text-white/80 text-xs truncate">{schedule.operator_email}</p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="px-3 py-1 rounded-full text-sm font-bold bg-white/20 text-white">
                            {schedule.jobs.length} {schedule.jobs.length === 1 ? 'Job' : 'Jobs'}
                          </span>
                          {isUnassigned && (
                            <span className="px-2 py-1 bg-white/20 text-white text-xs font-bold rounded-full animate-pulse">
                              UNASSIGNED
                            </span>
                          )}
                        </div>
                      </div>

                      <div className={`p-3 space-y-3 min-h-[200px] max-h-[calc(100vh-300px)] overflow-y-auto ${
                        isUnassigned ? 'bg-gradient-to-br from-orange-50 to-amber-50' : 'bg-gray-50'
                      }`}>
                        {schedule.jobs.map((job) => (
                          <div
                            key={job.id}
                            className={`bg-white rounded-xl p-4 shadow-md hover:shadow-lg transition-all border-2 ${
                              isUnassigned ? 'border-orange-200 hover:border-orange-300' : `border-gray-200 ${colors?.hover}`
                            }`}
                          >
                            <div className="mb-3">
                              <div className="flex items-start justify-between gap-2 mb-1">
                                <h4 className="font-bold text-gray-900 text-sm leading-tight">{job.customer_name}</h4>
                                {isUnassigned && (
                                  <span className="px-2 py-0.5 bg-orange-500 text-white rounded-full text-xs font-bold whitespace-nowrap">
                                    UNASSIGNED
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-gray-500">{job.job_number}</p>
                            </div>

                            <div className="space-y-2 mb-3">
                              {job.shop_arrival_time && (
                                <div className="flex items-center gap-2 text-xs">
                                  <Clock className="w-3.5 h-3.5 text-purple-600" />
                                  <span className="font-semibold text-green-700">Shop: {formatTime(job.shop_arrival_time)}</span>
                                </div>
                              )}
                              <div className="flex items-center gap-2 text-xs">
                                <Clock className="w-3.5 h-3.5 text-blue-600" />
                                <span className="font-semibold text-blue-700">Site: {formatTime(job.arrival_time)}</span>
                              </div>
                            </div>

                            <div className="flex items-start gap-2 mb-3 p-2 bg-orange-50 rounded-lg">
                              <MapPin className="w-3.5 h-3.5 text-orange-600 mt-0.5 flex-shrink-0" />
                              <div className="min-w-0">
                                <p className="text-xs font-semibold text-gray-900 truncate">{job.location}</p>
                                <p className="text-xs text-gray-600 truncate">{job.customer_name}</p>
                              </div>
                            </div>

                            {job.priority && job.priority !== 'medium' && (
                              <div className="mb-3">
                                <span className={`px-2 py-1 rounded-md text-xs font-bold ${
                                  job.priority === 'urgent' ? 'bg-red-100 text-red-700' :
                                  job.priority === 'high' ? 'bg-orange-100 text-orange-700' :
                                  'bg-blue-100 text-blue-700'
                                }`}>
                                  {job.priority.toUpperCase()}
                                </span>
                              </div>
                            )}

                            <div className="flex gap-2 flex-wrap">
                              {isUnassigned && (
                                <button
                                  onClick={() => openEditModal(job)}
                                  className="flex-1 px-3 py-1.5 bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-700 text-white rounded-lg text-xs font-bold transition-all shadow-md hover:shadow-lg"
                                >
                                  Assign
                                </button>
                              )}
                              <button
                                onClick={() => openEditModal(job)}
                                className="flex-1 px-3 py-1.5 bg-gradient-to-r from-purple-600 to-pink-500 hover:from-purple-700 hover:to-pink-600 text-white rounded-lg text-xs font-bold transition-all shadow-md hover:shadow-lg"
                              >
                                Edit
                              </button>
                              <button
                                onClick={() => setViewingHistory({ jobId: job.id, jobNumber: job.job_number })}
                                className="px-3 py-1.5 bg-gradient-to-r from-gray-100 to-gray-200 hover:from-gray-200 hover:to-gray-300 text-gray-700 rounded-lg text-xs font-bold transition-all shadow-md hover:shadow-lg"
                              >
                                <History className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        ))}

                        {schedule.jobs.length === 0 && (
                          <div className="text-center py-8 text-gray-400">
                            <p className="text-sm">No jobs assigned</p>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>

      {/* Edit Modal */}
      {editingJob && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="sticky top-0 bg-gradient-to-r from-purple-600 to-pink-500 text-white p-6 rounded-t-3xl">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-bold mb-1">Edit Job Details</h2>
                  <p className="text-purple-100">{editingJob.job_number} - {editingJob.title}</p>
                </div>
                <button
                  onClick={() => closeEditModal()}
                  className="p-2 hover:bg-white/20 rounded-xl transition-colors"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Modal Content */}
            <div className="p-6 space-y-6">
              {/* Operator Assignment */}
              <div className="bg-gradient-to-br from-purple-50 to-pink-50 p-5 rounded-xl border-2 border-purple-200">
                <div className="flex items-start gap-3">
                  <Users className="w-6 h-6 text-purple-600 mt-1" />
                  <div className="flex-1">
                    <label className="block text-sm font-bold text-gray-900 mb-1">
                      Assigned Operator
                    </label>
                    <p className="text-xs text-gray-600 mb-3">
                      Future updates will include smart recommendations based on task requirements and operator skill levels.
                    </p>

                    {/* Current Operator Display */}
                    {!showOperatorDropdown ? (
                      <div>
                        <div className="w-full px-4 py-3 bg-white border-2 border-purple-300 rounded-xl mb-3">
                          <div className="flex items-center gap-2">
                            {editingJob.assigned_to ? (
                              <>
                                <div className="w-8 h-8 rounded-full bg-purple-600 flex items-center justify-center text-white font-bold text-sm">
                                  {editingJob.operator_name?.charAt(0) || '?'}
                                </div>
                                <div>
                                  <p className="font-bold text-gray-900">{editingJob.operator_name || 'Unknown Operator'}</p>
                                  <p className="text-xs text-gray-500">{editingJob.operator_email || ''}</p>
                                </div>
                              </>
                            ) : (
                              <>
                                <div className="w-8 h-8 rounded-full bg-orange-500 flex items-center justify-center">
                                  <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                  </svg>
                                </div>
                                <div>
                                  <p className="font-bold text-orange-600">Unassigned</p>
                                  <p className="text-xs text-gray-500">No operator assigned to this job</p>
                                </div>
                              </>
                            )}
                          </div>
                        </div>

                        {/* Action Buttons */}
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => setShowOperatorDropdown(true)}
                            className="flex-1 px-4 py-2 bg-gradient-to-r from-purple-600 to-pink-500 hover:from-purple-700 hover:to-pink-600 text-white rounded-lg font-semibold transition-all shadow-md hover:shadow-lg"
                          >
                            Change Operator
                          </button>
                          {editingJob.assigned_to && (
                            <button
                              type="button"
                              onClick={() => {
                                setEditingJob({
                                  ...editingJob,
                                  assigned_to: '',
                                  operator_name: '',
                                  operator_email: ''
                                });
                              }}
                              className="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg font-semibold transition-all shadow-md hover:shadow-lg"
                              title="Remove operator assignment"
                            >
                              Unassign
                            </button>
                          )}
                        </div>
                      </div>
                    ) : (
                      /* Operator Dropdown */
                      <div className="space-y-2">
                        <select
                          value={editingJob.assigned_to || ''}
                          onChange={(e) => {
                            const selectedId = e.target.value;
                            const selectedOperator = operators.find(op => op.id === selectedId);
                            setEditingJob({
                              ...editingJob,
                              assigned_to: selectedId,
                              operator_name: selectedOperator?.full_name || '',
                              operator_email: selectedOperator?.email || ''
                            });
                          }}
                          className="w-full px-4 py-3 border-2 border-purple-300 rounded-xl focus:border-purple-500 focus:outline-none transition-colors text-gray-900 bg-white font-medium"
                          autoFocus
                        >
                          <option value="">-- Select Operator --</option>
                          {operators.map((operator) => (
                            <option key={operator.id} value={operator.id}>
                              {operator.full_name} ({operator.email})
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={() => setShowOperatorDropdown(false)}
                          className="w-full px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm font-semibold transition-all"
                        >
                          Done
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Scheduled Date */}
              <div className="bg-gradient-to-br from-blue-50 to-cyan-50 p-5 rounded-xl border-2 border-blue-200">
                <div className="flex items-start gap-3">
                  <Calendar className="w-6 h-6 text-blue-600 mt-1" />
                  <div className="flex-1">
                    <label className="block text-sm font-bold text-gray-900 mb-2">
                      Scheduled Date *
                    </label>
                    <input
                      type="date"
                      value={editingJob.scheduled_date ? editingJob.scheduled_date.split('T')[0] : ''}
                      onChange={(e) => setEditingJob({ ...editingJob, scheduled_date: e.target.value })}
                      className="w-full px-4 py-3 border-2 border-blue-300 rounded-xl focus:border-blue-500 focus:outline-none transition-colors text-gray-900 text-lg font-semibold"
                    />
                  </div>
                </div>

                {/* End Date for multi-day jobs */}
                <div className="flex items-start gap-3">
                  <Calendar className="w-6 h-6 text-purple-600 mt-1" />
                  <div className="flex-1">
                    <label className="block text-sm font-bold text-gray-900 mb-2">
                      End Date (multi-day jobs)
                    </label>
                    <input
                      type="date"
                      value={editingJob.end_date || ''}
                      onChange={(e) => setEditingJob({ ...editingJob, end_date: e.target.value || null })}
                      min={editingJob.scheduled_date ? editingJob.scheduled_date.split('T')[0] : ''}
                      className="w-full px-4 py-3 border-2 border-purple-300 rounded-xl focus:border-purple-500 focus:outline-none transition-colors text-gray-900 text-lg font-semibold"
                    />
                    <p className="text-xs text-gray-500 mt-1">Leave empty for single-day jobs</p>
                  </div>
                </div>
              </div>

              {/* Times */}
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Shop Arrival Time
                  </label>
                  <input
                    type="time"
                    value={editingJob.shop_arrival_time ? editingJob.shop_arrival_time.substring(0, 5) : ''}
                    onChange={(e) => setEditingJob({ ...editingJob, shop_arrival_time: e.target.value })}
                    className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:border-purple-500 focus:outline-none transition-colors text-gray-900 text-lg font-semibold"
                  />
                  <div className="flex gap-2 mt-2">
                    <button
                      type="button"
                      onClick={() => setEditingJob({ ...editingJob, shop_arrival_time: '06:00' })}
                      className="px-3 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-xs font-medium transition-all"
                    >
                      6:00 AM
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingJob({ ...editingJob, shop_arrival_time: '07:00' })}
                      className="px-3 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-xs font-medium transition-all"
                    >
                      7:00 AM
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingJob({ ...editingJob, shop_arrival_time: '08:00' })}
                      className="px-3 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-xs font-medium transition-all"
                    >
                      8:00 AM
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Job Site Arrival Time *
                  </label>
                  <input
                    type="time"
                    value={editingJob.arrival_time ? editingJob.arrival_time.substring(0, 5) : ''}
                    onChange={(e) => setEditingJob({ ...editingJob, arrival_time: e.target.value })}
                    className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:border-blue-500 focus:outline-none transition-colors text-gray-900 text-lg font-semibold"
                  />
                  <div className="flex gap-2 mt-2">
                    <button
                      type="button"
                      onClick={() => setEditingJob({ ...editingJob, arrival_time: '07:00' })}
                      className="px-3 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-xs font-medium transition-all"
                    >
                      7:00 AM
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingJob({ ...editingJob, arrival_time: '08:00' })}
                      className="px-3 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-xs font-medium transition-all"
                    >
                      8:00 AM
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingJob({ ...editingJob, arrival_time: '09:00' })}
                      className="px-3 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-xs font-medium transition-all"
                    >
                      9:00 AM
                    </button>
                  </div>
                </div>
              </div>

              {/* Location */}
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Location Name *
                  </label>
                  <input
                    type="text"
                    value={editingJob.location}
                    onChange={(e) => setEditingJob({ ...editingJob, location: e.target.value })}
                    className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:border-orange-500 focus:outline-none transition-colors text-gray-900"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Full Address *
                  </label>
                  <input
                    type="text"
                    value={editingJob.address}
                    onChange={(e) => setEditingJob({ ...editingJob, address: e.target.value })}
                    className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:border-orange-500 focus:outline-none transition-colors text-gray-900"
                  />
                </div>
              </div>

              {/* Customer & Contact */}
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Customer Name
                  </label>
                  <input
                    type="text"
                    value={editingJob.customer_name}
                    onChange={(e) => setEditingJob({ ...editingJob, customer_name: e.target.value })}
                    className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:border-purple-500 focus:outline-none transition-colors text-gray-900"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Contact on Site
                  </label>
                  <input
                    type="text"
                    value={editingJob.foreman_name || ''}
                    onChange={(e) => setEditingJob({ ...editingJob, foreman_name: e.target.value })}
                    className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:border-purple-500 focus:outline-none transition-colors text-gray-900"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Contact Phone
                </label>
                <input
                  type="tel"
                  value={editingJob.foreman_phone || ''}
                  onChange={(e) => setEditingJob({ ...editingJob, foreman_phone: e.target.value })}
                  className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:border-purple-500 focus:outline-none transition-colors text-gray-900"
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Job Description
                </label>
                <textarea
                  value={editingJob.description || ''}
                  onChange={(e) => setEditingJob({ ...editingJob, description: e.target.value })}
                  rows={4}
                  className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:border-blue-500 focus:outline-none transition-colors text-gray-900"
                />
              </div>

              {/* Equipment */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Equipment Needed
                </label>

                {/* Selected Equipment Tags */}
                {editingJob.equipment_needed && editingJob.equipment_needed.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-3 p-3 bg-gray-50 rounded-xl border border-gray-200">
                    {editingJob.equipment_needed.map((item, idx) => (
                      <span
                        key={idx}
                        className="inline-flex items-center gap-2 px-3 py-1.5 bg-purple-100 text-purple-700 rounded-lg text-sm font-medium"
                      >
                        {item}
                        <button
                          type="button"
                          onClick={() => removeEquipment(item)}
                          className="hover:bg-purple-200 rounded-full p-0.5 transition-colors"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </span>
                    ))}
                  </div>
                )}

                {/* Equipment Search */}
                <div className="relative">
                  <input
                    type="text"
                    value={equipmentSearch}
                    onChange={(e) => {
                      setEquipmentSearch(e.target.value);
                      setShowEquipmentDropdown(true);
                    }}
                    onFocus={() => setShowEquipmentDropdown(true)}
                    placeholder="Search equipment..."
                    className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:border-purple-500 focus:outline-none transition-colors text-gray-900"
                    autoComplete="off"
                  />

                  {/* Equipment Dropdown */}
                  {showEquipmentDropdown && equipmentSearch && (
                    <div className="absolute z-50 w-full mt-1 bg-white border-2 border-gray-300 rounded-xl shadow-lg max-h-60 overflow-y-auto">
                      {commonEquipment
                        .filter(item => item.toLowerCase().includes(equipmentSearch.toLowerCase()))
                        .map((item, idx) => (
                          <div
                            key={idx}
                            onClick={() => addEquipment(item)}
                            className="px-4 py-2 hover:bg-purple-50 cursor-pointer text-gray-800 border-b border-gray-100 last:border-b-0"
                          >
                            {item}
                          </div>
                        ))}
                      {commonEquipment.filter(item => item.toLowerCase().includes(equipmentSearch.toLowerCase())).length === 0 && (
                        <div className="px-4 py-2 text-gray-500 text-sm">No equipment found</div>
                      )}
                    </div>
                  )}
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  Type to search and add equipment items
                </p>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="sticky bottom-0 bg-gray-50 p-6 rounded-b-3xl border-t border-gray-200 flex justify-between items-center gap-3">
              {/* Delete Button on Left */}
              <button
                onClick={() => setShowDeleteConfirmation(true)}
                className="px-6 py-3 bg-red-500 hover:bg-red-600 text-white rounded-xl font-semibold transition-all shadow-md hover:shadow-lg flex items-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                Delete Job
              </button>

              {/* Save/Cancel Buttons on Right */}
              <div className="flex gap-3">
                <button
                  onClick={() => closeEditModal()}
                  className="px-6 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-semibold transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveJob}
                  disabled={saving}
                  className="px-8 py-3 bg-gradient-to-r from-purple-600 to-pink-500 hover:from-purple-700 hover:to-pink-600 text-white rounded-xl font-bold transition-all shadow-lg hover:shadow-xl hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirmation && editingJob && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full overflow-hidden">
            {/* Header */}
            <div className="bg-gradient-to-r from-red-600 to-red-700 p-6 text-white">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-xl font-bold">Delete Job</h3>
                  <p className="text-red-100 text-sm">This action cannot be undone</p>
                </div>
              </div>
            </div>

            {/* Content */}
            <div className="p-6">
              <p className="text-gray-700 mb-4">
                Are you sure you want to delete this job?
              </p>
              <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
                <p className="font-bold text-gray-900">{editingJob.customer_name}</p>
                <p className="text-sm text-gray-600">{editingJob.job_number}</p>
                <p className="text-sm text-gray-600 mt-2">{editingJob.location}</p>
              </div>
              <p className="text-sm text-red-600 font-semibold mt-4 flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                This will permanently delete all job data, history, and related records.
              </p>
            </div>

            {/* Footer */}
            <div className="bg-gray-50 p-6 flex justify-end gap-3 border-t border-gray-200">
              <button
                onClick={() => setShowDeleteConfirmation(false)}
                disabled={deleting}
                className="px-6 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-semibold transition-all disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteJob}
                disabled={deleting}
                className="px-6 py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold transition-all shadow-lg hover:shadow-xl flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {deleting ? (
                  <>
                    <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Deleting...
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                    Yes, Delete Job
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* History Modal */}
      {viewingHistory && (
        <JobHistoryModal
          jobId={viewingHistory.jobId}
          jobNumber={viewingHistory.jobNumber}
          isOpen={true}
          onClose={() => setViewingHistory(null)}
        />
      )}

      {/* Day View Modal */}
      {selectedDayView && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl max-w-5xl w-full max-h-[90vh] overflow-hidden">
            {/* Modal Header */}
            <div className="sticky top-0 bg-gradient-to-r from-purple-600 to-pink-500 text-white p-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-bold mb-1">
                    {new Date(selectedDayView.date).toLocaleDateString('en-US', {
                      weekday: 'long',
                      month: 'long',
                      day: 'numeric',
                      year: 'numeric'
                    })}
                  </h2>
                  <p className="text-purple-100">{selectedDayView.jobs.length} jobs scheduled</p>
                </div>
                <button
                  onClick={() => setSelectedDayView(null)}
                  className="p-2 hover:bg-white/20 rounded-xl transition-colors"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Modal Content */}
            <div className="p-6 overflow-y-auto max-h-[calc(90vh-100px)]">
              {selectedDayView.jobs.length === 0 ? (
                <div className="text-center py-12">
                  <Calendar className="w-16 h-16 mx-auto mb-4 text-gray-300" />
                  <h3 className="text-xl font-bold text-gray-900 mb-2">No Jobs Scheduled</h3>
                  <p className="text-gray-600">There are no jobs scheduled for this day.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {selectedDayView.jobs.map((job, index) => (
                    <div
                      key={job.id}
                      className="bg-white border-2 border-gray-200 rounded-xl p-5 hover:border-purple-400 transition-all shadow-sm hover:shadow-md"
                    >
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-600 to-pink-500 text-white font-bold flex items-center justify-center text-lg">
                            #{index + 1}
                          </div>
                          <div>
                            <h3 className="text-lg font-bold text-gray-900">{job.customer_name}</h3>
                            <p className="text-sm text-gray-500">{job.job_number}</p>
                          </div>
                        </div>
                        <button
                          onClick={() => {
                            setSelectedDayView(null);
                            openEditModal(job);
                          }}
                          className="px-4 py-2 bg-gradient-to-r from-purple-600 to-pink-500 hover:from-purple-700 hover:to-pink-600 text-white rounded-lg font-semibold transition-all shadow-md hover:shadow-lg text-sm"
                        >
                          Edit Job
                        </button>
                      </div>

                      <div className="grid md:grid-cols-2 gap-4 mb-4">
                        {/* Times */}
                        <div className="space-y-2">
                          {job.shop_arrival_time && (
                            <div className="flex items-center gap-2">
                              <Clock className="w-4 h-4 text-purple-600" />
                              <span className="text-sm text-gray-600">Shop:</span>
                              <span className="text-sm font-bold text-green-700">{formatTime(job.shop_arrival_time)}</span>
                            </div>
                          )}
                          <div className="flex items-center gap-2">
                            <Clock className="w-4 h-4 text-blue-600" />
                            <span className="text-sm text-gray-600">Site:</span>
                            <span className="text-sm font-bold text-blue-700">{formatTime(job.arrival_time)}</span>
                          </div>
                        </div>

                        {/* Location */}
                        <div className="flex items-start gap-2">
                          <MapPin className="w-4 h-4 text-orange-600 mt-0.5" />
                          <div>
                            <p className="text-sm font-bold text-gray-900">{job.location}</p>
                            <p className="text-xs text-gray-600">{job.address}</p>
                          </div>
                        </div>
                      </div>

                      {/* Operator */}
                      {job.operator_name && (
                        <div className="flex items-center gap-2 mb-3 p-3 bg-purple-50 rounded-lg">
                          <Users className="w-4 h-4 text-purple-600" />
                          <span className="text-sm text-gray-600">Operator:</span>
                          <span className="text-sm font-bold text-purple-700">{job.operator_name}</span>
                        </div>
                      )}

                      {!job.assigned_to && (
                        <div className="mb-3 p-3 bg-orange-50 rounded-lg border border-orange-200">
                          <span className="text-sm font-bold text-orange-700">⚠️ UNASSIGNED - No operator assigned</span>
                        </div>
                      )}

                      {/* Priority */}
                      {job.priority && job.priority !== 'medium' && (
                        <div className="mb-3">
                          <span className={`px-3 py-1 rounded-lg text-sm font-bold ${
                            job.priority === 'urgent' ? 'bg-red-100 text-red-700' :
                            job.priority === 'high' ? 'bg-orange-100 text-orange-700' :
                            'bg-blue-100 text-blue-700'
                          }`}>
                            {job.priority.toUpperCase()} PRIORITY
                          </span>
                        </div>
                      )}

                      {/* Description */}
                      {job.description && (
                        <div className="p-3 bg-gray-50 rounded-lg">
                          <p className="text-sm text-gray-700">{job.description}</p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
