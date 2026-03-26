'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ClipboardList, Clock, CheckCircle2, XCircle, ArrowLeft,
  ChevronDown, ChevronRight, MapPin, Wrench, User, DollarSign,
  CalendarDays, FileText, RefreshCw, AlertTriangle, Send,
  Filter, Search
} from 'lucide-react';
import { getCurrentUser } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

// ─── Types ────────────────────────────────────────────────────────────────

interface SubmissionHistoryEntry {
  id: string;
  job_order_id: string;
  submitted_by: string;
  submitted_by_name: string | null;
  action: 'submitted' | 'approved' | 'rejected' | 'resubmitted' | 'edited';
  notes: string | null;
  created_at: string;
}

interface ScheduleForm {
  id: string;
  job_number: string;
  title: string;
  customer_name: string;
  job_type: string;
  location: string | null;
  address: string | null;
  status: string;
  scheduled_date: string | null;
  end_date: string | null;
  estimated_cost: number | null;
  description: string | null;
  equipment_needed: string[];
  created_by: string;
  created_by_name: string;
  created_at: string;
  updated_at: string;
  rejection_reason: string | null;
  rejection_notes: string | null;
  rejected_at: string | null;
  last_submitted_at: string | null;
  project_name: string | null;
  salesman_name: string | null;
  po_number: string | null;
  customer_contact: string | null;
  site_contact_phone: string | null;
  scope_details: any;
  equipment_selections: any;
  special_equipment_notes: string | null;
  scheduling_flexibility: any;
  site_compliance: any;
  permit_required: boolean;
  permits: any[];
  job_difficulty_rating: number | null;
  additional_info: string | null;
  jobsite_conditions: any;
  is_will_call: boolean;
  submission_history: SubmissionHistoryEntry[];
}

type TabKey = 'pending_approval' | 'scheduled' | 'rejected';

// ─── Helper Functions ─────────────────────────────────────────────────────

async function getToken() {
  const { data } = await supabase.auth.getSession();
  return data?.session?.access_token || '';
}

async function apiFetch(url: string, opts?: RequestInit) {
  const token = await getToken();
  return fetch(url, {
    ...opts,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...opts?.headers },
  });
}

const REJECTION_REASON_LABELS: Record<string, string> = {
  missing_info: 'Missing Information',
  incorrect_scope: 'Incorrect Scope',
  budget_issue: 'Budget Issue',
  scheduling_conflict: 'Scheduling Conflict',
  compliance_issue: 'Compliance Issue',
  other: 'Other',
};

const ACTION_LABELS: Record<string, { label: string; color: string; icon: typeof CheckCircle2 }> = {
  submitted: { label: 'Submitted', color: 'text-blue-600 bg-blue-50', icon: Send },
  approved: { label: 'Approved', color: 'text-green-600 bg-green-50', icon: CheckCircle2 },
  rejected: { label: 'Rejected', color: 'text-red-600 bg-red-50', icon: XCircle },
  resubmitted: { label: 'Resubmitted', color: 'text-indigo-600 bg-indigo-50', icon: RefreshCw },
  edited: { label: 'Edited', color: 'text-gray-600 bg-gray-50', icon: FileText },
};

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

function formatDateTime(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

// ─── Main Component ───────────────────────────────────────────────────────

export default function ScheduleFormHistoryPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabKey>('pending_approval');
  const [forms, setForms] = useState<ScheduleForm[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [userRole, setUserRole] = useState<string>('admin');
  const [resubmitting, setResubmitting] = useState<string | null>(null);

  // Auth check
  useEffect(() => {
    const user = getCurrentUser();
    if (!user) {
      router.push('/login');
      return;
    }
    if (!['admin', 'super_admin', 'operations_manager', 'salesman', 'supervisor'].includes(user.role)) {
      router.push('/dashboard');
      return;
    }
    setUserRole(user.role);
  }, [router]);

  // Fetch data
  const fetchForms = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch(`/api/admin/schedule-forms?status=${activeTab}`);
      if (!res.ok) throw new Error('Failed to fetch');
      const json = await res.json();
      setForms(json.data || []);
    } catch (err) {
      console.error('Error fetching schedule forms:', err);
      setForms([]);
    } finally {
      setLoading(false);
    }
  }, [activeTab]);

  useEffect(() => {
    fetchForms();
  }, [fetchForms]);

  // Filtered forms
  const filteredForms = forms.filter(f => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      f.job_number?.toLowerCase().includes(q) ||
      f.customer_name?.toLowerCase().includes(q) ||
      f.created_by_name?.toLowerCase().includes(q) ||
      f.location?.toLowerCase().includes(q)
    );
  });

  // Resubmit handler (navigates to schedule form with pre-filled data)
  const handleEditAndResubmit = (form: ScheduleForm) => {
    // Store form data in sessionStorage for the schedule form to pick up
    sessionStorage.setItem('resubmit_form_data', JSON.stringify({
      job_order_id: form.id,
      job_number: form.job_number,
      customer_name: form.customer_name,
      customer_contact: form.customer_contact,
      site_contact_phone: form.site_contact_phone,
      address: form.address,
      location: form.location,
      description: form.description,
      job_type: form.job_type,
      estimated_cost: form.estimated_cost,
      equipment_needed: form.equipment_needed,
      equipment_selections: form.equipment_selections,
      special_equipment_notes: form.special_equipment_notes,
      scheduled_date: form.scheduled_date,
      end_date: form.end_date,
      scheduling_flexibility: form.scheduling_flexibility,
      site_compliance: form.site_compliance,
      permit_required: form.permit_required,
      permits: form.permits,
      job_difficulty_rating: form.job_difficulty_rating,
      additional_info: form.additional_info,
      jobsite_conditions: form.jobsite_conditions,
      salesman_name: form.salesman_name,
      po_number: form.po_number,
      project_name: form.project_name,
      scope_details: form.scope_details,
    }));
    router.push(`/dashboard/admin/schedule-form?resubmit=${form.id}`);
  };

  // ─── Tab Counts ──────────────────────────────────────────────────────────
  const tabs: { key: TabKey; label: string; icon: typeof Clock; count?: number }[] = [
    { key: 'pending_approval', label: 'Pending Approval', icon: Clock },
    { key: 'scheduled', label: 'Approved', icon: CheckCircle2 },
    { key: 'rejected', label: 'Rejected', icon: XCircle },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-gradient-to-r from-orange-500 to-amber-600 px-4 sm:px-6 py-6">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center gap-3 mb-2">
            <Link href="/dashboard/admin" className="text-orange-100 hover:text-white transition-colors">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
              <ClipboardList className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">Schedule Form History</h1>
              <p className="text-orange-100 text-sm">Track submitted, approved, and rejected schedule forms</p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        {/* Tabs */}
        <div className="flex items-center gap-2 mb-6 overflow-x-auto pb-2">
          {tabs.map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => { setActiveTab(tab.key); setExpandedId(null); }}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all whitespace-nowrap ${
                  isActive
                    ? tab.key === 'pending_approval'
                      ? 'bg-orange-500 text-white shadow-lg'
                      : tab.key === 'scheduled'
                        ? 'bg-green-500 text-white shadow-lg'
                        : 'bg-red-500 text-white shadow-lg'
                    : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}

          {/* Search */}
          <div className="ml-auto relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search forms..."
              className="pl-9 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none w-48 sm:w-64"
            />
          </div>
        </div>

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full" />
          </div>
        )}

        {/* Empty state */}
        {!loading && filteredForms.length === 0 && (
          <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center">
            <ClipboardList className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-600 mb-1">No forms found</h3>
            <p className="text-sm text-gray-400">
              {searchQuery ? 'Try a different search term.' : `No ${activeTab.replace('_', ' ')} forms at this time.`}
            </p>
          </div>
        )}

        {/* Form list */}
        {!loading && filteredForms.length > 0 && (
          <div className="space-y-3">
            {filteredForms.map(form => {
              const isExpanded = expandedId === form.id;
              return (
                <div key={form.id} className="bg-white rounded-2xl border border-gray-200 overflow-hidden hover:shadow-md transition-shadow">
                  {/* Summary row */}
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : form.id)}
                    className="w-full p-4 sm:p-5 text-left"
                  >
                    <div className="flex items-center gap-3">
                      {/* Expand icon */}
                      <div className="text-gray-400">
                        {isExpanded ? <ChevronDown className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
                      </div>

                      {/* Main info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-gray-900 text-sm">{form.job_number}</span>
                          <span className="text-gray-300">|</span>
                          <span className="font-semibold text-gray-700 text-sm truncate">{form.customer_name}</span>
                          {form.last_submitted_at && form.status === 'pending_approval' && (
                            <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs font-bold rounded-full">
                              Resubmitted
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-purple-50 rounded text-purple-600 font-medium">
                            {form.job_type?.split(',')[0]?.trim()}
                          </span>
                          {form.location && (
                            <span className="flex items-center gap-1 truncate">
                              <MapPin className="w-3 h-3" />
                              {form.location}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Right side info */}
                      <div className="flex items-center gap-3 flex-shrink-0">
                        {form.estimated_cost && (
                          <span className="hidden sm:flex items-center gap-1 px-2 py-1 bg-green-50 text-green-700 text-xs font-bold rounded-lg">
                            <DollarSign className="w-3 h-3" />
                            {Number(form.estimated_cost).toLocaleString()}
                          </span>
                        )}
                        <div className="text-right">
                          <div className="flex items-center gap-1 text-xs text-gray-500">
                            <User className="w-3 h-3" />
                            {form.created_by_name}
                          </div>
                          <div className="text-xs text-gray-400 mt-0.5">
                            {formatDate(form.created_at)}
                          </div>
                        </div>

                        {/* Status badge */}
                        <div className={`px-3 py-1.5 rounded-lg text-xs font-bold ${
                          form.status === 'pending_approval'
                            ? 'bg-orange-100 text-orange-700'
                            : form.status === 'scheduled'
                              ? 'bg-green-100 text-green-700'
                              : form.status === 'rejected'
                                ? 'bg-red-100 text-red-700'
                                : 'bg-gray-100 text-gray-700'
                        }`}>
                          {form.status === 'pending_approval' ? 'Pending' :
                           form.status === 'scheduled' ? 'Approved' :
                           form.status === 'rejected' ? 'Rejected' :
                           form.status}
                        </div>
                      </div>
                    </div>
                  </button>

                  {/* Expanded detail */}
                  {isExpanded && (
                    <div className="border-t border-gray-100">
                      {/* Rejection banner */}
                      {form.status === 'rejected' && form.rejection_reason && (
                        <div className="px-5 py-4 bg-red-50 border-b border-red-100">
                          <div className="flex items-start gap-3">
                            <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                            <div className="flex-1">
                              <div className="font-semibold text-red-800 text-sm">
                                Rejection Reason: {REJECTION_REASON_LABELS[form.rejection_reason] || form.rejection_reason}
                              </div>
                              {form.rejection_notes && (
                                <p className="text-red-700 text-sm mt-1">{form.rejection_notes}</p>
                              )}
                              {form.rejected_at && (
                                <p className="text-red-400 text-xs mt-2">Rejected on {formatDateTime(form.rejected_at)}</p>
                              )}
                            </div>
                            {/* Edit & Resubmit button */}
                            {['admin', 'super_admin', 'operations_manager', 'salesman', 'supervisor'].includes(userRole) && (
                              <button
                                onClick={() => handleEditAndResubmit(form)}
                                className="px-4 py-2 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white rounded-xl text-sm font-bold transition-all shadow-lg hover:shadow-xl flex items-center gap-2 flex-shrink-0"
                              >
                                <RefreshCw className="w-4 h-4" />
                                Edit & Resubmit
                              </button>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Form details */}
                      <div className="p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        <DetailField label="Job Number" value={form.job_number} />
                        <DetailField label="Customer" value={form.customer_name} />
                        <DetailField label="Service Type" value={form.job_type} />
                        <DetailField label="Location" value={form.location || form.address || '--'} />
                        <DetailField label="Scheduled Date" value={form.scheduled_date ? formatDate(form.scheduled_date + 'T12:00:00') : '--'} />
                        {form.end_date && <DetailField label="End Date" value={formatDate(form.end_date + 'T12:00:00')} />}
                        <DetailField label="Estimated Cost" value={form.estimated_cost ? `$${Number(form.estimated_cost).toLocaleString()}` : '--'} />
                        <DetailField label="Submitted By" value={form.created_by_name || form.salesman_name || '--'} />
                        <DetailField label="PO Number" value={form.po_number || '--'} />
                        {form.project_name && <DetailField label="Project Name" value={form.project_name} />}
                        <DetailField label="Difficulty" value={form.job_difficulty_rating ? `${form.job_difficulty_rating}/10` : '--'} />
                        <DetailField label="Contact" value={form.customer_contact || '--'} />
                        <DetailField label="Contact Phone" value={form.site_contact_phone || '--'} />
                        {form.is_will_call && <DetailField label="Will Call" value="Yes" />}
                      </div>

                      {/* Equipment */}
                      {form.equipment_needed && form.equipment_needed.length > 0 && (
                        <div className="px-5 pb-3">
                          <h4 className="text-xs font-semibold text-gray-400 uppercase mb-2">Equipment</h4>
                          <div className="flex flex-wrap gap-1.5">
                            {form.equipment_needed.map((eq, idx) => (
                              <span key={idx} className="inline-flex items-center gap-1 px-2 py-1 bg-indigo-50 rounded-lg text-xs text-indigo-600 font-medium">
                                <Wrench className="w-3 h-3" />
                                {eq}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Description */}
                      {form.description && (
                        <div className="px-5 pb-3">
                          <h4 className="text-xs font-semibold text-gray-400 uppercase mb-1">Description</h4>
                          <p className="text-sm text-gray-600">{form.description}</p>
                        </div>
                      )}

                      {/* Additional notes */}
                      {form.additional_info && (
                        <div className="px-5 pb-3">
                          <h4 className="text-xs font-semibold text-gray-400 uppercase mb-1">Additional Notes</h4>
                          <p className="text-sm text-gray-600">{form.additional_info}</p>
                        </div>
                      )}

                      {/* Submission History Timeline */}
                      {form.submission_history.length > 0 && (
                        <div className="px-5 py-4 border-t border-gray-100 bg-gray-50">
                          <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Submission History</h4>
                          <div className="space-y-3">
                            {form.submission_history.map((entry, idx) => {
                              const actionInfo = ACTION_LABELS[entry.action] || ACTION_LABELS.edited;
                              const ActionIcon = actionInfo.icon;
                              return (
                                <div key={entry.id} className="flex items-start gap-3">
                                  {/* Timeline line */}
                                  <div className="flex flex-col items-center">
                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center ${actionInfo.color}`}>
                                      <ActionIcon className="w-4 h-4" />
                                    </div>
                                    {idx < form.submission_history.length - 1 && (
                                      <div className="w-0.5 h-6 bg-gray-200 mt-1" />
                                    )}
                                  </div>
                                  {/* Content */}
                                  <div className="flex-1 pb-2">
                                    <div className="flex items-center gap-2">
                                      <span className="font-semibold text-sm text-gray-900">{actionInfo.label}</span>
                                      <span className="text-xs text-gray-400">by {entry.submitted_by_name || 'Unknown'}</span>
                                    </div>
                                    {entry.notes && (
                                      <p className="text-xs text-gray-500 mt-0.5">{entry.notes}</p>
                                    )}
                                    <p className="text-xs text-gray-400 mt-0.5">{formatDateTime(entry.created_at)}</p>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
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
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────

function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-semibold text-gray-400 uppercase">{label}</dt>
      <dd className="text-sm text-gray-900 mt-0.5">{value}</dd>
    </div>
  );
}
