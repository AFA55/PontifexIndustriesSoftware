'use client';

import { useState, useEffect, lazy, Suspense } from 'react';
import {
  X, Printer, Edit3, MapPin, Wrench, Clock, Calendar, Users, FileText,
  Droplets, Zap, Shield, HardHat, Wind, Scissors, Package, ClipboardList,
  AlertTriangle, Gauge, Phone, DollarSign, ChevronDown, ChevronUp,
  Loader2, ExternalLink, Info, MessageSquare, Send, Save, XCircle, History
} from 'lucide-react';
import type { JobCardData } from './JobCard';
import { getDisplayName } from '@/lib/equipment-map';

const WorkHistoryTimeline = lazy(() => import('./WorkHistoryTimeline'));

interface JobDetailViewProps {
  job: JobCardData;
  operatorName?: string | null;
  helperName?: string | null;
  rowIndex: number | null;
  onClose: () => void;
  onEdit: () => void;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
interface FullJobData extends Record<string, any> {
  id: string;
  job_number: string;
  customer_name: string;
  customer_contact?: string;
  site_contact_phone?: string;
  foreman_phone?: string;
  address?: string;
  location?: string;
  job_type?: string;
  description?: string;
  scheduled_date?: string;
  end_date?: string;
  arrival_time?: string;
  estimated_cost?: number;
  estimated_hours?: number;
  po_number?: string;
  salesman_name?: string;
  operator_name?: string | null;
  helper_name?: string | null;
  equipment_needed?: string[];
  equipment_rentals?: string[];
  equipment_selections?: Record<string, Record<string, string>>;
  scope_details?: Record<string, any>;
  site_compliance?: Record<string, any>;
  jobsite_conditions?: Record<string, any>;
  additional_info?: string;
  job_difficulty_rating?: number;
  difficulty_rating?: number;
  permit_required?: boolean;
  permits?: { type: string; details?: string }[];
  is_multi_day?: boolean;
  is_will_call?: boolean;
  status?: string;
  directions?: string;
  loading_started_at?: string | null;
  route_started_at?: string | null;
  work_started_at?: string | null;
  work_completed_at?: string | null;
  done_for_day_at?: string | null;
}

interface JobNote {
  id: string;
  content: string;
  created_at: string;
  author_name: string;
}

function getDifficultyInfo(rating: number): { color: string; bg: string; label: string } {
  if (rating <= 2) return { color: 'text-green-700', bg: 'bg-green-100', label: 'Easy' };
  if (rating <= 4) return { color: 'text-blue-700', bg: 'bg-blue-100', label: 'Moderate' };
  if (rating <= 6) return { color: 'text-yellow-700', bg: 'bg-yellow-100', label: 'Challenging' };
  if (rating <= 8) return { color: 'text-orange-700', bg: 'bg-orange-100', label: 'Hard' };
  return { color: 'text-red-700', bg: 'bg-red-100', label: 'Extreme' };
}

function formatDate(d?: string) {
  if (!d) return '--';
  try {
    return new Date(d + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  } catch { return d; }
}

function formatTime(time?: string | null) {
  if (!time) return null;
  const [hours, minutes] = time.split(':');
  const hour = parseInt(hours);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${minutes} ${ampm}`;
}

function formatTimestamp(iso?: string | null): string {
  if (!iso) return '--';
  try {
    return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  } catch { return '--'; }
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}

async function getToken(): Promise<string> {
  try {
    const { supabase } = await import('@/lib/supabase');
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token || '';
  } catch {
    return '';
  }
}

// ── Status Timeline Component ──
function StatusTimeline({ data }: { data: FullJobData }) {
  const steps = [
    { key: 'scheduled', label: 'Scheduled', time: data.scheduled_date ? formatDate(data.scheduled_date) : null, color: 'bg-gray-400' },
    { key: 'loading', label: 'Loading', time: data.loading_started_at ? formatTimestamp(data.loading_started_at) : null, color: 'bg-amber-400' },
    { key: 'in_route', label: 'In Route', time: data.route_started_at ? formatTimestamp(data.route_started_at) : null, color: 'bg-blue-500' },
    { key: 'in_progress', label: 'Working', time: data.work_started_at ? formatTimestamp(data.work_started_at) : null, color: 'bg-orange-500' },
    { key: 'completed', label: 'Completed', time: data.work_completed_at ? formatTimestamp(data.work_completed_at) : null, color: 'bg-emerald-500' },
  ];

  // Determine which steps are completed
  const statusOrder = ['scheduled', 'loading', 'in_route', 'in_progress', 'completed'];
  const currentStatus = data.status || 'scheduled';
  let activeIdx = statusOrder.indexOf(currentStatus);
  // If loading_started_at is set but status is not explicitly 'loading', adjust
  if (activeIdx < 1 && data.loading_started_at) activeIdx = 1;
  if (activeIdx < 2 && data.route_started_at) activeIdx = 2;
  if (activeIdx < 3 && data.work_started_at) activeIdx = 3;
  if (activeIdx < 4 && data.work_completed_at) activeIdx = 4;

  // Check for done_for_day
  const isDoneForDay = data.done_for_day_at && !data.work_completed_at;

  return (
    <div className="flex items-center gap-1 px-4 py-3 bg-gray-50 rounded-xl border border-gray-200 mb-4 overflow-x-auto">
      {steps.map((step, idx) => {
        const isComplete = idx <= activeIdx;
        const isCurrent = idx === activeIdx;
        return (
          <div key={step.key} className="flex items-center gap-1 flex-shrink-0">
            {idx > 0 && (
              <div className={`w-6 h-0.5 ${isComplete ? 'bg-emerald-400' : 'bg-gray-200'}`} />
            )}
            <div className="flex flex-col items-center">
              <div className={`w-3 h-3 rounded-full ${isComplete ? step.color : 'bg-gray-200'} ${isCurrent ? 'ring-2 ring-offset-1 ring-purple-400' : ''}`} />
              <span className={`text-[9px] font-bold mt-0.5 whitespace-nowrap ${isComplete ? 'text-gray-700' : 'text-gray-400'}`}>
                {step.label}
              </span>
              {step.time && (
                <span className="text-[8px] text-gray-400">{step.time}</span>
              )}
            </div>
          </div>
        );
      })}
      {isDoneForDay && (
        <div className="flex items-center gap-1 flex-shrink-0 ml-2">
          <div className="w-6 h-0.5 bg-emerald-300" />
          <div className="flex flex-col items-center">
            <div className="w-3 h-3 rounded-full bg-emerald-400 ring-2 ring-offset-1 ring-emerald-300" />
            <span className="text-[9px] font-bold mt-0.5 text-emerald-600 whitespace-nowrap">Done Today</span>
            <span className="text-[8px] text-gray-400">{formatTimestamp(data.done_for_day_at)}</span>
          </div>
        </div>
      )}
    </div>
  );
}

export default function JobDetailView({ job, operatorName, helperName, rowIndex, onClose, onEdit }: JobDetailViewProps) {
  const [fullData, setFullData] = useState<FullJobData | null>(null);
  const [loading, setLoading] = useState(true);
  const [printingPdf, setPrintingPdf] = useState(false);
  const [activeTab, setActiveTab] = useState<'details' | 'history'>('details');
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    jobInfo: true,
    schedule: true,
    scope: true,
    equipment: true,
    conditions: true,
    compliance: true,
    permits: true,
    notes: true,
  });

  // Notes state
  const [jobNotes, setJobNotes] = useState<JobNote[]>([]);
  const [newNote, setNewNote] = useState('');
  const [addingNote, setAddingNote] = useState(false);

  // Inline editing state
  const [isEditing, setIsEditing] = useState(false);
  const [editFields, setEditFields] = useState<Record<string, any>>({});
  const [saving, setSaving] = useState(false);

  const toggleSection = (key: string) => {
    setExpandedSections(prev => ({ ...prev, [key]: !prev[key] }));
  };

  // Fetch full job data
  useEffect(() => {
    let cancelled = false;
    const fetchData = async () => {
      setLoading(true);
      try {
        const token = await getToken();
        const res = await fetch(`/api/job-orders/${job.id}/full-detail`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok && !cancelled) {
          const json = await res.json();
          if (json.success) {
            setFullData(json.data);
          }
        }
      } catch (err) {
        console.error('Failed to fetch job detail:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchData();
    return () => { cancelled = true; };
  }, [job.id]);

  // Fetch job notes
  useEffect(() => {
    let cancelled = false;
    const fetchNotes = async () => {
      try {
        const token = await getToken();
        const res = await fetch(`/api/job-orders/${job.id}/notes`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok && !cancelled) {
          const json = await res.json();
          if (json.success) {
            setJobNotes(json.data || []);
          }
        }
      } catch {
        // notes endpoint may not exist yet — ignore
      }
    };
    fetchNotes();
    return () => { cancelled = true; };
  }, [job.id]);

  const handleAddNote = async () => {
    if (!newNote.trim()) return;
    setAddingNote(true);
    try {
      const token = await getToken();
      const res = await fetch(`/api/job-orders/${job.id}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ content: newNote.trim() }),
      });
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data) {
          setJobNotes(prev => [json.data, ...prev]);
        }
        setNewNote('');
      }
    } catch (err) {
      console.error('Failed to add note:', err);
    } finally {
      setAddingNote(false);
    }
  };

  const handleStartEdit = () => {
    if (!fullData) return;
    setEditFields({
      scheduled_date: fullData.scheduled_date || '',
      end_date: fullData.end_date || '',
      arrival_time: fullData.arrival_time || '',
      po_number: fullData.po_number || '',
      description: fullData.description || '',
      additional_info: fullData.additional_info || '',
    });
    setIsEditing(true);
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditFields({});
  };

  const handleSaveEdit = async () => {
    setSaving(true);
    try {
      const token = await getToken();
      const res = await fetch(`/api/job-orders/${job.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(editFields),
      });
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data) {
          setFullData(prev => prev ? { ...prev, ...json.data } : prev);
        }
        setIsEditing(false);
        setEditFields({});
      }
    } catch (err) {
      console.error('Failed to save edit:', err);
    } finally {
      setSaving(false);
    }
  };

  const handlePrintDispatch = async () => {
    setPrintingPdf(true);
    try {
      const token = await getToken();
      const res = await fetch(`/api/job-orders/${job.id}/dispatch-pdf`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const blob = await res.blob();
        const pdfUrl = URL.createObjectURL(blob);
        window.open(pdfUrl, '_blank');
      }
    } catch (err) {
      console.error('Error generating dispatch PDF:', err);
    } finally {
      setPrintingPdf(false);
    }
  };

  const d = fullData;
  const conditions = d?.jobsite_conditions as Record<string, any> | undefined;
  const compliance = d?.site_compliance as Record<string, any> | undefined;
  const difficulty = d?.job_difficulty_rating || d?.difficulty_rating || job.difficulty_rating || 0;

  // Parse conditions into structured flags
  const conditionFlags: { label: string; active: boolean; detail?: string; warning?: boolean }[] = conditions ? [
    { label: 'Water Available', active: !!conditions.water_available, detail: conditions.water_available_ft ? `${conditions.water_available_ft}ft` : undefined },
    { label: 'Power Available', active: !!conditions.electricity_available, detail: conditions.electricity_available_ft ? `${conditions.electricity_available_ft}ft` : undefined },
    { label: '480 Cord Req\'d', active: !!conditions.cord_480, detail: conditions.cord_480_ft ? `${conditions.cord_480_ft}ft` : undefined, warning: true },
    { label: 'Hyd Hose', active: !!conditions.hyd_hose, detail: conditions.hyd_hose_ft ? `${conditions.hyd_hose_ft}ft` : undefined },
    { label: 'Vac Water', active: !!conditions.water_control },
    { label: 'Hang Poly', active: !!conditions.plastic_needed },
    { label: 'Cleanup', active: !!conditions.clean_up_required },
    { label: 'Overcutting OK', active: !!conditions.overcutting_allowed },
    { label: 'High Work', active: !!conditions.high_work, detail: conditions.high_work_ft ? `${conditions.high_work_ft}ft` : undefined, warning: true },
    { label: 'Scaffold/Lift Avail', active: !!conditions.scaffolding_provided },
    { label: 'Manpower Prov\'d', active: !!conditions.manpower_provided },
    { label: 'Proper Ventilation', active: !!conditions.proper_ventilation },
  ] : [];

  // Equipment selections
  const equipSelections = d?.equipment_selections || {};
  const equipItems: { label: string; value: string }[] = [];
  for (const [, selections] of Object.entries(equipSelections)) {
    for (const [key, val] of Object.entries(selections)) {
      if (val && val !== 'no' && val !== 'false' && val !== '0') {
        const label = key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        const displayVal = val === 'yes' || val === 'true' ? '' : val;
        equipItems.push({ label, value: displayVal });
      }
    }
  }

  const statusColors: Record<string, string> = {
    pending: 'bg-yellow-100 text-yellow-800 border-yellow-300',
    scheduled: 'bg-blue-100 text-blue-800 border-blue-300',
    assigned: 'bg-indigo-100 text-indigo-800 border-indigo-300',
    dispatched: 'bg-purple-100 text-purple-800 border-purple-300',
    in_progress: 'bg-emerald-100 text-emerald-800 border-emerald-300',
    in_route: 'bg-blue-100 text-blue-800 border-blue-300',
    completed: 'bg-green-100 text-green-800 border-green-300',
    cancelled: 'bg-red-100 text-red-800 border-red-300',
  };

  const currentStatus = d?.status || job.status || 'scheduled';
  const statusStyle = statusColors[currentStatus] || 'bg-gray-100 text-gray-800 border-gray-300';

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[70]" onClick={onClose} />

      {/* Full-page overlay */}
      <div className="fixed inset-0 z-[80] flex items-center justify-center p-2 sm:p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl max-h-[95vh] overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">

          {/* Header */}
          <div className="bg-gradient-to-r from-purple-600 via-purple-700 to-indigo-700 p-5 text-white flex-shrink-0">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <span className="text-xs font-bold bg-white/20 px-3 py-1 rounded-lg">{job.job_number}</span>
                <span className={`text-xs font-bold px-2.5 py-1 rounded-lg border ${statusStyle}`}>
                  {currentStatus.replace(/_/g, ' ').toUpperCase()}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={handlePrintDispatch}
                  disabled={printingPdf}
                  className="flex items-center gap-1.5 px-3 py-2 bg-white/20 hover:bg-white/30 rounded-xl text-sm font-bold transition-colors"
                  title="Print Dispatch Ticket"
                >
                  {printingPdf ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />}
                  <span className="hidden sm:inline">Print</span>
                </button>
                {isEditing ? (
                  <>
                    <button
                      onClick={handleSaveEdit}
                      disabled={saving}
                      className="flex items-center gap-1.5 px-3 py-2 bg-emerald-500 hover:bg-emerald-600 rounded-xl text-sm font-bold transition-colors"
                    >
                      {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                      <span className="hidden sm:inline">Save</span>
                    </button>
                    <button
                      onClick={handleCancelEdit}
                      className="flex items-center gap-1.5 px-3 py-2 bg-red-500/80 hover:bg-red-600 rounded-xl text-sm font-bold transition-colors"
                    >
                      <XCircle className="w-4 h-4" />
                      <span className="hidden sm:inline">Cancel</span>
                    </button>
                  </>
                ) : (
                  <button
                    onClick={handleStartEdit}
                    className="flex items-center gap-1.5 px-3 py-2 bg-white/20 hover:bg-white/30 rounded-xl text-sm font-bold transition-colors"
                    title="Edit Inline"
                  >
                    <Edit3 className="w-4 h-4" />
                    <span className="hidden sm:inline">Edit</span>
                  </button>
                )}
                <button
                  onClick={onClose}
                  className="p-2 hover:bg-white/20 rounded-xl transition-colors"
                  title="Back to Board"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <h2 className="text-xl sm:text-2xl font-bold">{job.customer_name}</h2>
            <div className="flex flex-wrap items-center gap-2 mt-1.5">
              {job.job_type?.split(',').map((t, i) => (
                <span key={i} className="px-2.5 py-0.5 bg-white/20 rounded-full text-xs font-semibold">
                  {t.trim()}
                </span>
              ))}
              {job.is_will_call && (
                <span className="px-2.5 py-0.5 bg-amber-400/30 rounded-full text-xs font-bold flex items-center gap-1">
                  <Phone className="w-3 h-3" /> WILL CALL
                </span>
              )}
            </div>
          </div>

          {/* Tab Bar */}
          <div className="flex border-b border-gray-200 px-5 bg-gray-50 flex-shrink-0">
            <button
              onClick={() => setActiveTab('details')}
              className={`px-4 py-2.5 text-sm font-bold border-b-2 transition-colors ${
                activeTab === 'details'
                  ? 'border-purple-600 text-purple-700'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <FileText className="w-4 h-4 inline mr-1.5" />
              Details
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className={`px-4 py-2.5 text-sm font-bold border-b-2 transition-colors ${
                activeTab === 'history'
                  ? 'border-purple-600 text-purple-700'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <History className="w-4 h-4 inline mr-1.5" />
              Work History
            </button>
          </div>

          {/* Body — scrollable */}
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="w-8 h-8 animate-spin text-purple-500" />
                <span className="ml-3 text-gray-500 font-medium">Loading job details...</span>
              </div>
            ) : activeTab === 'history' ? (
              <div className="p-5">
                <Suspense fallback={
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-5 h-5 animate-spin text-purple-500" />
                    <span className="ml-2 text-sm text-gray-500">Loading...</span>
                  </div>
                }>
                  <WorkHistoryTimeline jobOrderId={job.id} />
                </Suspense>
              </div>
            ) : (
              <div className="flex flex-col lg:flex-row">
                {/* Left column — 70% job info */}
                <div className="flex-1 lg:w-[70%] p-5 space-y-4">

                  {/* Status Timeline */}
                  {d && <StatusTimeline data={d} />}

                  {/* ---- Job Info Card ---- */}
                  <SectionCard
                    title="Job Information"
                    icon={<Info className="w-4 h-4 text-purple-600" />}
                    headerColor="bg-purple-50 border-purple-200"
                    expanded={expandedSections.jobInfo}
                    onToggle={() => toggleSection('jobInfo')}
                  >
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2">
                      <FieldRow label="Customer" value={d?.customer_name || job.customer_name} bold />
                      <FieldRow label="Contact" value={d?.customer_contact} />
                      <FieldRow label="Phone" value={d?.site_contact_phone || d?.foreman_phone} />
                      {isEditing ? (
                        <EditFieldRow label="PO #" value={editFields.po_number} onChange={(v) => setEditFields(f => ({ ...f, po_number: v }))} />
                      ) : (
                        <FieldRow label="PO #" value={d?.po_number || job.po_number} />
                      )}
                      <FieldRow label="Location" value={d?.location || job.location} bold />
                      <FieldRow label="Quoted By" value={d?.salesman_name} />
                      {(d?.address && d.address !== d.location) && (
                        <div className="sm:col-span-2">
                          <FieldRow label="Address" value={d.address} />
                        </div>
                      )}
                      {d?.estimated_cost && (
                        <FieldRow label="Estimated Cost" value={formatCurrency(Number(d.estimated_cost))} bold />
                      )}
                      {d?.estimated_hours && (
                        <FieldRow label="Est. Hours" value={`${d.estimated_hours}h`} />
                      )}
                    </div>
                    {(d?.address || job.address) && (
                      <a
                        href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(d?.address || job.address || '')}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-purple-600 hover:text-purple-700 mt-3 font-semibold"
                      >
                        <ExternalLink className="w-3 h-3" /> Open in Google Maps
                      </a>
                    )}
                  </SectionCard>

                  {/* ---- Schedule & Assignment Card ---- */}
                  <SectionCard
                    title="Schedule & Assignment"
                    icon={<Calendar className="w-4 h-4 text-blue-600" />}
                    headerColor="bg-blue-50 border-blue-200"
                    expanded={expandedSections.schedule}
                    onToggle={() => toggleSection('schedule')}
                  >
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2">
                      {isEditing ? (
                        <>
                          <EditFieldRow label="Start Date" value={editFields.scheduled_date} onChange={(v) => setEditFields(f => ({ ...f, scheduled_date: v }))} type="date" />
                          <EditFieldRow label="End Date" value={editFields.end_date} onChange={(v) => setEditFields(f => ({ ...f, end_date: v }))} type="date" />
                          <EditFieldRow label="Arrival Time" value={editFields.arrival_time} onChange={(v) => setEditFields(f => ({ ...f, arrival_time: v }))} type="time" />
                        </>
                      ) : (
                        <>
                          <FieldRow label="Start Date" value={formatDate(d?.scheduled_date || job.scheduled_date)} bold />
                          <FieldRow label="End Date" value={d?.end_date ? formatDate(d.end_date) : 'Same day'} />
                          <FieldRow label="Arrival Time" value={formatTime(d?.arrival_time || job.arrival_time) || '--'} bold />
                        </>
                      )}
                      <FieldRow label="Operator" value={d?.operator_name || operatorName || 'Unassigned'} bold />
                      <FieldRow label="Helper" value={d?.helper_name || helperName || 'None'} />
                      {job.day_label && <FieldRow label="Multi-Day" value={job.day_label} />}
                    </div>
                  </SectionCard>

                  {/* ---- Scope of Work ---- */}
                  <SectionCard
                    title="Scope of Work"
                    icon={<FileText className="w-4 h-4 text-emerald-600" />}
                    headerColor="bg-emerald-50 border-emerald-200"
                    expanded={expandedSections.scope}
                    onToggle={() => toggleSection('scope')}
                  >
                    <>
                      {isEditing ? (
                        <div className="mb-3">
                          <label className="text-[10px] font-bold text-gray-400 uppercase mb-1 block">Description</label>
                          <textarea
                            value={editFields.description}
                            onChange={(e) => setEditFields(f => ({ ...f, description: e.target.value }))}
                            className="w-full px-3 py-2 rounded-lg border-2 border-gray-200 focus:border-purple-500 focus:ring-2 focus:ring-purple-200 text-sm text-gray-900"
                            rows={3}
                          />
                        </div>
                      ) : (d?.description || job.description) ? (
                        <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed mb-3">
                          {d?.description || job.description}
                        </p>
                      ) : null}
                      {d?.scope_details && Object.keys(d.scope_details).length > 0 && (
                        <div className="border border-gray-200 rounded-lg overflow-hidden">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="bg-gray-50">
                                <th className="text-left px-3 py-2 text-xs font-bold text-gray-500 uppercase">Item</th>
                                <th className="text-left px-3 py-2 text-xs font-bold text-gray-500 uppercase">Details</th>
                              </tr>
                            </thead>
                            <tbody>
                              {Object.entries(d.scope_details).map(([key, val], i) => {
                                const formatScopeValue = (v: any): string => {
                                  if (Array.isArray(v)) {
                                    return v.map((item: any) => {
                                      if (item.qty && item.bit_size && item.depth) {
                                        return `${item.qty}x ${item.bit_size}" @ ${item.depth}" deep`;
                                      }
                                      return Object.entries(item).map(([k2, v2]) => `${k2.replace(/_/g, ' ')}: ${v2}`).join(', ');
                                    }).join(' | ');
                                  }
                                  if (typeof v === 'object' && v !== null) {
                                    return Object.entries(v as Record<string, any>)
                                      .filter(([, v2]) => v2 !== null && v2 !== undefined && v2 !== '' && v2 !== false)
                                      .map(([k2, v2]) => `${k2.replace(/_/g, ' ')}: ${v2}`)
                                      .join(', ');
                                  }
                                  return String(v ?? '--');
                                };
                                return (
                                  <tr key={key} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                                    <td className="px-3 py-2 text-gray-700 font-medium capitalize">{key.replace(/_/g, ' ')}</td>
                                    <td className="px-3 py-2 text-gray-900">{formatScopeValue(val)}</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </>
                  </SectionCard>

                  {/* ---- Equipment ---- */}
                  <SectionCard
                    title="Equipment"
                    icon={<Wrench className="w-4 h-4 text-indigo-600" />}
                    headerColor="bg-indigo-50 border-indigo-200"
                    badge={`${(d?.equipment_needed || job.equipment_needed || []).length + equipItems.length} items`}
                    expanded={expandedSections.equipment}
                    onToggle={() => toggleSection('equipment')}
                  >
                    <>
                      {/* Selected equipment */}
                      <div className="flex flex-wrap gap-1.5 mb-3">
                        {(d?.equipment_needed || job.equipment_needed || []).map((eq: string) => (
                          <span key={eq} className="px-3 py-1.5 bg-indigo-50 rounded-lg text-xs text-indigo-700 font-semibold border border-indigo-200 flex items-center gap-1">
                            <Wrench className="w-3 h-3" /> {getDisplayName(eq)}
                          </span>
                        ))}
                        {(d?.equipment_needed || job.equipment_needed || []).length === 0 && (
                          <span className="text-sm text-gray-400 italic">No equipment specified</span>
                        )}
                      </div>

                      {/* Equipment selections (recommended) */}
                      {equipItems.length > 0 && (
                        <div>
                          <div className="text-[10px] font-bold text-indigo-500 uppercase mb-1.5">Recommended Equipment</div>
                          <div className="flex flex-wrap gap-1.5">
                            {equipItems.map((item, i) => (
                              <span key={i} className="px-2.5 py-1 bg-emerald-50 rounded-lg text-xs text-emerald-700 font-semibold border border-emerald-200 flex items-center gap-1">
                                <Package className="w-3 h-3" />
                                {item.label}
                                {item.value && <span className="text-emerald-500 font-bold ml-0.5">({item.value})</span>}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Rentals */}
                      {d?.equipment_rentals && d.equipment_rentals.length > 0 && (
                        <div className="mt-3">
                          <div className="text-[10px] font-bold text-red-500 uppercase mb-1.5">Rentals</div>
                          <div className="flex flex-wrap gap-1.5">
                            {d.equipment_rentals.map((eq: string, i: number) => (
                              <span key={i} className="px-2.5 py-1 bg-red-50 rounded-lg text-xs text-red-700 font-semibold border border-red-200">
                                {eq}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  </SectionCard>

                  {/* ---- Work Conditions ---- */}
                  {conditions && conditionFlags.some(c => c.active) && (
                    <SectionCard
                      title="Work Conditions"
                      icon={<ClipboardList className="w-4 h-4 text-amber-600" />}
                      headerColor="bg-amber-50 border-amber-200"
                      badge={`${conditionFlags.filter(c => c.active).length} active`}
                      expanded={expandedSections.conditions}
                      onToggle={() => toggleSection('conditions')}
                    >
                      <>
                        {conditions.inside_outside ? (
                          <div className="mb-2 text-xs font-bold text-gray-600 uppercase">
                            Work Area: <span className="text-gray-900">{String(conditions.inside_outside)}</span>
                          </div>
                        ) : null}
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                          {conditionFlags.filter(c => c.active).map(cond => (
                            <div
                              key={cond.label}
                              className={`flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold ${
                                cond.warning
                                  ? 'bg-red-50 text-red-700 border border-red-200'
                                  : 'bg-white text-gray-700 border border-gray-200'
                              }`}
                            >
                              <span>{cond.label}</span>
                              {cond.detail && <span className="text-[10px] opacity-75 ml-1">{cond.detail}</span>}
                            </div>
                          ))}
                        </div>
                      </>
                    </SectionCard>
                  )}

                  {/* ---- Site Compliance ---- */}
                  {compliance && (compliance.orientation_required || compliance.badging_required || compliance.special_instructions) && (
                    <SectionCard
                      title="Site Compliance"
                      icon={<Shield className="w-4 h-4 text-blue-600" />}
                      headerColor="bg-blue-50 border-blue-200"
                      badge="Required"
                      expanded={expandedSections.compliance}
                      onToggle={() => toggleSection('compliance')}
                    >
                      <div className="space-y-2">
                        {compliance.orientation_required ? (
                          <div className="flex items-center gap-2 px-3 py-2 bg-white rounded-lg border border-blue-200">
                            <HardHat className="w-4 h-4 text-blue-600" />
                            <div>
                              <div className="text-xs font-bold text-blue-900">Orientation Required</div>
                              {compliance.orientation_datetime ? (
                                <div className="text-[10px] text-blue-600">{new Date(String(compliance.orientation_datetime)).toLocaleString()}</div>
                              ) : null}
                            </div>
                          </div>
                        ) : null}
                        {compliance.badging_required ? (
                          <div className="flex items-center gap-2 px-3 py-2 bg-white rounded-lg border border-blue-200">
                            <Shield className="w-4 h-4 text-blue-600" />
                            <div>
                              <div className="text-xs font-bold text-blue-900">Badging Required</div>
                              {compliance.badging_type ? (
                                <div className="text-[10px] text-blue-600">{String(compliance.badging_type)}</div>
                              ) : null}
                            </div>
                          </div>
                        ) : null}
                        {compliance.special_instructions ? (
                          <div className="px-3 py-2 bg-white rounded-lg border border-blue-200">
                            <div className="text-[10px] font-bold text-blue-500 uppercase mb-1">Special Instructions</div>
                            <p className="text-xs text-blue-900">{String(compliance.special_instructions)}</p>
                          </div>
                        ) : null}
                      </div>
                    </SectionCard>
                  )}

                  {/* ---- Difficulty Bar ---- */}
                  {difficulty > 0 && (
                    <div className="flex items-center gap-3 px-4 py-3 bg-gray-50 rounded-xl border border-gray-200">
                      <Gauge className="w-5 h-5 text-gray-500" />
                      <div className="flex-1">
                        <div className="text-[10px] font-bold text-gray-400 uppercase">Job Difficulty</div>
                        <div className="flex items-center gap-2 mt-1">
                          <div className="flex gap-0.5">
                            {Array.from({ length: 10 }, (_, i) => (
                              <div
                                key={i}
                                className={`w-6 h-3 rounded-sm ${
                                  i < difficulty
                                    ? i < 3 ? 'bg-green-400' : i < 5 ? 'bg-blue-400' : i < 7 ? 'bg-yellow-400' : i < 9 ? 'bg-orange-400' : 'bg-red-500'
                                    : 'bg-gray-200'
                                }`}
                              />
                            ))}
                          </div>
                          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${getDifficultyInfo(difficulty).bg} ${getDifficultyInfo(difficulty).color}`}>
                            {difficulty}/10 -- {getDifficultyInfo(difficulty).label}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* ---- Permits ---- */}
                  {d?.permit_required && d.permits && d.permits.length > 0 && (
                    <SectionCard
                      title="Permits Required"
                      icon={<AlertTriangle className="w-4 h-4 text-amber-600" />}
                      headerColor="bg-amber-50 border-amber-200"
                      expanded={expandedSections.permits}
                      onToggle={() => toggleSection('permits')}
                    >
                      <div className="flex flex-wrap gap-2">
                        {d.permits.map((p: { type: string; details?: string }, i: number) => {
                          const label = p.type === 'work_permit' ? 'Work Permit' :
                            p.type === 'hot_work' ? 'Hot Work Permit' :
                            p.type === 'excavation' ? 'Excavation Permit' :
                            p.type === 'confined_space' ? 'Confined Space Permit' :
                            p.details || 'Other';
                          return (
                            <span key={i} className="px-3 py-1.5 bg-amber-50 rounded-lg text-xs text-amber-800 font-semibold border border-amber-300">
                              {label}
                              {p.details && p.type !== 'other' && ` (${p.details})`}
                            </span>
                          );
                        })}
                      </div>
                    </SectionCard>
                  )}

                  {/* ---- Additional Notes ---- */}
                  {(d?.additional_info || d?.directions) && (
                    <SectionCard
                      title="Additional Notes"
                      icon={<FileText className="w-4 h-4 text-gray-500" />}
                      headerColor="bg-gray-50 border-gray-200"
                      expanded={expandedSections.notes}
                      onToggle={() => toggleSection('notes')}
                    >
                      <>
                        {isEditing ? (
                          <div className="mb-3">
                            <label className="text-[10px] font-bold text-gray-400 uppercase mb-1 block">Additional Info</label>
                            <textarea
                              value={editFields.additional_info}
                              onChange={(e) => setEditFields(f => ({ ...f, additional_info: e.target.value }))}
                              className="w-full px-3 py-2 rounded-lg border-2 border-gray-200 focus:border-purple-500 focus:ring-2 focus:ring-purple-200 text-sm text-gray-900"
                              rows={3}
                            />
                          </div>
                        ) : (
                          <>
                            {d?.additional_info && (
                              <div className="mb-3">
                                <div className="text-[10px] font-bold text-gray-400 uppercase mb-1">Notes</div>
                                <p className="text-sm text-gray-700 whitespace-pre-wrap">{d.additional_info}</p>
                              </div>
                            )}
                          </>
                        )}
                        {d?.directions && (
                          <div>
                            <div className="text-[10px] font-bold text-gray-400 uppercase mb-1">Directions</div>
                            <p className="text-sm text-gray-700 whitespace-pre-wrap">{d.directions}</p>
                          </div>
                        )}
                      </>
                    </SectionCard>
                  )}
                </div>

                {/* Right column — 30% notes sidebar */}
                <div className="lg:w-[30%] lg:border-l border-gray-200 p-5 bg-gray-50/50">
                  <div className="flex items-center gap-2 mb-3">
                    <MessageSquare className="w-4 h-4 text-purple-600" />
                    <h3 className="text-sm font-bold text-gray-900">Notes</h3>
                    <span className="text-[10px] px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded-full font-bold">
                      {jobNotes.length}
                    </span>
                  </div>

                  {/* Add note input */}
                  <div className="flex gap-2 mb-4">
                    <input
                      type="text"
                      value={newNote}
                      onChange={(e) => setNewNote(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleAddNote()}
                      placeholder="Add a note..."
                      className="flex-1 px-3 py-2 rounded-lg border border-gray-200 focus:border-purple-400 focus:ring-1 focus:ring-purple-200 text-sm text-gray-900 bg-white"
                    />
                    <button
                      onClick={handleAddNote}
                      disabled={addingNote || !newNote.trim()}
                      className="px-3 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors disabled:opacity-50"
                    >
                      {addingNote ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    </button>
                  </div>

                  {/* Notes feed */}
                  <div className="space-y-2 max-h-[60vh] overflow-y-auto">
                    {jobNotes.length === 0 ? (
                      <div className="text-center py-6">
                        <MessageSquare className="w-6 h-6 text-gray-300 mx-auto mb-1" />
                        <p className="text-xs text-gray-400">No notes yet</p>
                      </div>
                    ) : (
                      jobNotes.map((note) => (
                        <div key={note.id} className="bg-white rounded-lg border border-gray-200 p-3">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[10px] font-bold text-purple-600">{note.author_name}</span>
                            <span className="text-[10px] text-gray-400">
                              {new Date(note.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                              {' '}
                              {new Date(note.created_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                            </span>
                          </div>
                          <p className="text-xs text-gray-700">{note.content}</p>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

// ── Reusable Section Card ──
function SectionCard({
  title,
  icon,
  headerColor,
  badge,
  expanded,
  onToggle,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  headerColor: string;
  badge?: string;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className={`rounded-xl border overflow-hidden ${headerColor}`}>
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-black/5 transition-colors"
      >
        <div className="flex items-center gap-2">
          {icon}
          <span className="text-sm font-bold text-gray-900">{title}</span>
          {badge && (
            <span className="text-[10px] px-1.5 py-0.5 bg-white/70 text-gray-600 rounded-full font-bold border border-gray-200">
              {badge}
            </span>
          )}
        </div>
        {expanded ? <ChevronUp className="w-4 h-4 text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-500" />}
      </button>
      {expanded && (
        <div className="px-4 pb-4 bg-white">
          {children}
        </div>
      )}
    </div>
  );
}

// ── Reusable Field Row ──
function FieldRow({ label, value, bold }: { label: string; value?: string | null; bold?: boolean }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="text-xs font-bold text-gray-400 uppercase w-28 flex-shrink-0">{label}</span>
      <span className={`text-sm ${bold ? 'font-bold text-gray-900' : 'text-gray-700'}`}>{value || '--'}</span>
    </div>
  );
}

// ── Editable Field Row ──
function EditFieldRow({ label, value, onChange, type = 'text' }: { label: string; value: string; onChange: (v: string) => void; type?: string }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="text-xs font-bold text-gray-400 uppercase w-28 flex-shrink-0">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="flex-1 px-2 py-1 rounded-lg border-2 border-purple-300 focus:border-purple-500 focus:ring-1 focus:ring-purple-200 text-sm font-medium text-gray-900 bg-purple-50/30"
      />
    </div>
  );
}
