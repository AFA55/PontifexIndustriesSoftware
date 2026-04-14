'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import {
  ChevronLeft, ChevronRight, Building2, Edit, Trash2, Plus, Mail, Phone, MapPin,
  DollarSign, Briefcase, Loader2, User, FileText, Save, Star, Shield,
  CreditCard, Globe, Hash, TrendingUp, Calendar, ArrowUpRight, Clock,
  CheckCircle2, AlertCircle, ExternalLink, RefreshCw
} from 'lucide-react';
import { getCurrentUser } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import CustomerForm from '../_components/CustomerForm';
import ContactForm from '../_components/ContactForm';
import JobHistoryDetailPanel from '@/components/jobs/JobHistoryDetailPanel';

interface Contact {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: string | null;
  is_primary: boolean;
  is_billing_contact: boolean;
  notes: string | null;
}

interface Job {
  id: string;
  job_number: string;
  title: string;
  job_type: string | null;
  status: string;
  scheduled_date: string | null;
  end_date: string | null;
  estimated_cost: number | null;
  created_at: string;
  project_name: string | null;
  address: string | null;
  location: string | null;
  contact_name: string | null;
  site_contact_phone: string | null;
  equipment_needed: string[] | null;
  description: string | null;
}

interface CustomerDetail {
  id: string;
  name: string;
  display_name: string | null;
  primary_contact_name: string | null;
  primary_contact_email: string | null;
  primary_contact_phone: string | null;
  billing_contact_name: string | null;
  billing_contact_email: string | null;
  billing_contact_phone: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  customer_type: string | null;
  payment_terms: number | string | null;
  payment_method: string | null;
  tax_id: string | null;
  website: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  contacts: Contact[];
  jobs: Job[];
  stats: {
    total_jobs: number;
    total_revenue: number;
    active_jobs: number;
  };
}

const STATUS_COLORS: Record<string, string> = {
  pending_approval: 'bg-yellow-100 text-yellow-700',
  approved: 'bg-blue-100 text-blue-700',
  assigned: 'bg-blue-100 text-blue-700',
  scheduled: 'bg-purple-100 text-purple-700',
  in_route: 'bg-yellow-100 text-yellow-700',
  in_progress: 'bg-orange-100 text-orange-700',
  completed: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-700',
  invoiced: 'bg-emerald-100 text-emerald-700',
  on_hold: 'bg-purple-100 text-purple-700',
};

const TYPE_LABELS: Record<string, string> = {
  general_contractor: 'General Contractor',
  subcontractor: 'Subcontractor',
  direct_client: 'Direct Client',
  government: 'Government',
  property_manager: 'Property Manager',
  homeowner: 'Homeowner',
  other: 'Other',
};

const ROLE_LABELS: Record<string, string> = {
  site_contact: 'Site Contact',
  project_manager: 'Project Manager',
  billing: 'Billing',
  owner: 'Owner',
  estimating: 'Estimating',
  other: 'Other',
};

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  check: 'Check',
  credit_card: 'Credit Card',
  ach: 'ACH / Bank Transfer',
  cash: 'Cash',
  wire: 'Wire Transfer',
  other: 'Other',
};

function formatPaymentTerms(terms: number | string | null | undefined): string {
  if (terms === null || terms === undefined || terms === '') return 'Not set';
  const t = String(terms);
  if (t === 'cod') return 'COD (Cash on Delivery)';
  if (t === '0') return 'Due on Receipt';
  return `Net ${t}`;
}

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

export default function CustomerDetailPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;

  const [customer, setCustomer] = useState<CustomerDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showContactForm, setShowContactForm] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [notes, setNotes] = useState('');
  const [savingNotes, setSavingNotes] = useState(false);
  const [userRole, setUserRole] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState('');
  const [expandedProjects, setExpandedProjects] = useState<Record<string, boolean>>({});
  const toggleProject = (name: string) => setExpandedProjects(prev => ({ ...prev, [name]: !prev[name] }));
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);

  useEffect(() => {
    const currentUser = getCurrentUser();
    if (!currentUser) { router.push('/login'); return; }
    if (!['admin', 'super_admin', 'operations_manager', 'salesman'].includes(currentUser.role || '')) {
      router.push('/dashboard');
    }
    setUserRole(currentUser.role || '');
  }, [router]);

  const fetchCustomer = useCallback(async () => {
    try {
      const res = await apiFetch(`/api/admin/customers/${id}`);
      if (res.ok) {
        const json = await res.json();
        setCustomer(json.data);
        setNotes(json.data.notes || '');
      } else {
        router.push('/dashboard/admin/customers');
      }
    } catch (err) {
      console.error('Failed to fetch customer:', err);
    } finally {
      setLoading(false);
    }
  }, [id, router]);

  useEffect(() => { fetchCustomer(); }, [fetchCustomer]);

  const handleEditCustomer = async (data: Record<string, any>) => {
    const res = await apiFetch(`/api/admin/customers/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ ...data, propagate: true }),
    });
    if (!res.ok) {
      const json = await res.json();
      throw new Error(json.error || 'Failed to update customer');
    }
    setShowEditModal(false);
    fetchCustomer();
  };

  const handleSyncToJobs = async () => {
    setSyncing(true);
    setSyncMessage('');
    try {
      const res = await apiFetch(`/api/admin/customers/${id}/sync`, { method: 'POST' });
      if (res.ok) {
        const json = await res.json();
        setSyncMessage(`Updated ${json.updated || 0} job(s) with latest customer info`);
      } else {
        setSyncMessage('Sync failed — try again');
      }
    } catch {
      setSyncMessage('Sync failed');
    } finally {
      setSyncing(false);
      setTimeout(() => setSyncMessage(''), 4000);
    }
  };

  const handleSaveNotes = async () => {
    setSavingNotes(true);
    try {
      await apiFetch(`/api/admin/customers/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ notes }),
      });
    } catch (err) {
      console.error('Failed to save notes:', err);
    } finally {
      setSavingNotes(false);
    }
  };

  const handleAddContact = async (data: Record<string, any>) => {
    const res = await apiFetch(`/api/admin/customers/${id}/contacts`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const json = await res.json();
      throw new Error(json.error || 'Failed to add contact');
    }
    setShowContactForm(false);
    fetchCustomer();
  };

  const handleEditContact = async (data: Record<string, any>) => {
    if (!editingContact) return;
    const res = await apiFetch(`/api/admin/customers/${id}/contacts/${editingContact.id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const json = await res.json();
      throw new Error(json.error || 'Failed to update contact');
    }
    setEditingContact(null);
    fetchCustomer();
  };

  const handleDeleteContact = async (contactId: string) => {
    if (!confirm('Delete this contact?')) return;
    await apiFetch(`/api/admin/customers/${id}/contacts/${contactId}`, {
      method: 'DELETE',
    });
    fetchCustomer();
  };

  const handleDeleteCustomer = async () => {
    if (!confirm('Are you sure you want to delete this customer? This cannot be undone.')) return;
    const res = await apiFetch(`/api/admin/customers/${id}`, { method: 'DELETE' });
    if (res.ok) {
      router.push('/dashboard/admin/customers');
    }
  };

  const formatDate = (d: string | null) => {
    if (!d) return '--';
    return new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-purple-600" />
      </div>
    );
  }

  if (!customer) return null;

  // Computed stats
  const completedJobs = customer.jobs.filter(j => j.status === 'completed' || j.status === 'invoiced');
  const activeJobs = customer.jobs.filter(j => !['completed', 'cancelled', 'invoiced'].includes(j.status));
  const avgJobValue = customer.stats.total_jobs > 0 ? customer.stats.total_revenue / customer.stats.total_jobs : 0;
  const jobTypes = customer.jobs.reduce((acc, j) => {
    const type = j.job_type || 'Other';
    acc[type] = (acc[type] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  const topJobType = Object.entries(jobTypes).sort(([, a], [, b]) => b - a)[0];
  const customerSince = customer.created_at
    ? new Date(customer.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    : null;

  // Group jobs by project name for the project history section
  const jobsByProject: Record<string, Job[]> = {};
  for (const job of (customer?.jobs || [])) {
    const key = job.project_name?.trim() || '(No Project Name)';
    if (!jobsByProject[key]) jobsByProject[key] = [];
    jobsByProject[key].push(job);
  }
  const projectNames = Object.keys(jobsByProject).sort((a, b) => {
    if (a === '(No Project Name)') return 1;
    if (b === '(No Project Name)') return -1;
    // Sort by most recent job date
    const latestA = jobsByProject[a][0]?.scheduled_date || '';
    const latestB = jobsByProject[b][0]?.scheduled_date || '';
    return latestB.localeCompare(latestA);
  });

  const handleAddJobForProject = (projectName: string, representativeJob?: Job) => {
    // Store prefill data so the schedule form can pick it up
    const prefill = {
      customer_id: customer!.id,
      customer_name: customer!.name || customer!.display_name || '',
      project_name: projectName === '(No Project Name)' ? '' : projectName,
      address: representativeJob?.address || customer!.address || '',
      location: representativeJob?.location || '',
      contact_name: representativeJob?.contact_name || customer!.primary_contact_name || '',
      contact_phone: representativeJob?.site_contact_phone || customer!.primary_contact_phone || '',
      equipment_needed: representativeJob?.equipment_needed || [],
    };
    localStorage.setItem('schedule-form-customer-prefill', JSON.stringify(prefill));
    router.push('/dashboard/admin/schedule-form');
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 md:px-6 py-6 max-w-6xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Link href="/dashboard/admin/customers" className="p-2 hover:bg-gray-100 rounded-xl transition-colors">
              <ChevronLeft className="w-5 h-5 text-gray-600" />
            </Link>
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center shadow-lg">
              <span className="text-white font-bold text-lg">
                {customer.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
              </span>
            </div>
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2 text-gray-900">
                {customer.name}
              </h1>
              <div className="flex items-center gap-2 mt-1">
                {customer.customer_type && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-700">
                    {TYPE_LABELS[customer.customer_type] || customer.customer_type}
                  </span>
                )}
                {customer.is_active === false && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-700">Inactive</span>
                )}
                {customerSince && (
                  <span className="text-[10px] text-gray-500">Customer since {customerSince}</span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleSyncToJobs}
              disabled={syncing}
              className="px-3 py-2 bg-cyan-50 hover:bg-cyan-100 border border-cyan-200 rounded-xl text-sm font-bold text-cyan-700 transition-all flex items-center gap-1.5 disabled:opacity-50"
              title="Push customer info to all linked jobs"
            >
              <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
              Sync to Jobs
            </button>
            <button onClick={() => setShowEditModal(true)} className="px-3 py-2 bg-white hover:bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold text-gray-700 transition-all flex items-center gap-1.5">
              <Edit className="w-4 h-4" /> Edit
            </button>
            {userRole === 'super_admin' && (
              <button onClick={handleDeleteCustomer} className="px-3 py-2 bg-red-50 hover:bg-red-100 border border-red-200 rounded-xl text-sm font-bold text-red-600 transition-all flex items-center gap-1.5">
                <Trash2 className="w-4 h-4" /> Delete
              </button>
            )}
          </div>
        </div>

        {/* Sync message */}
        {syncMessage && (
          <div className="mb-4 p-3 bg-cyan-50 border border-cyan-200 rounded-xl text-sm text-cyan-700 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4" /> {syncMessage}
          </div>
        )}

        {/* Stats Bar — 5 cards */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
          <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
            <p className="text-2xl font-bold text-purple-600">{customer.stats.total_jobs}</p>
            <p className="text-xs text-gray-500">Total Jobs</p>
          </div>
          <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
            <p className="text-2xl font-bold text-emerald-600">${customer.stats.total_revenue.toLocaleString()}</p>
            <p className="text-xs text-gray-500">Total Revenue</p>
          </div>
          <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
            <p className="text-2xl font-bold text-cyan-600">{customer.stats.active_jobs}</p>
            <p className="text-xs text-gray-500">Active Jobs</p>
          </div>
          <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
            <p className="text-2xl font-bold text-orange-600">${avgJobValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
            <p className="text-xs text-gray-500">Avg Job Value</p>
          </div>
          <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
            <p className="text-lg font-bold text-yellow-600 truncate">{topJobType ? topJobType[0] : '--'}</p>
            <p className="text-xs text-gray-500">{topJobType ? `${topJobType[1]} jobs` : 'Top Service'}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Left Column — 2/3 */}
          <div className="lg:col-span-2 space-y-5">

            {/* Contacts Section */}
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-bold text-gray-900 flex items-center gap-2">
                  <User className="w-4 h-4 text-purple-600" /> Contacts ({customer.contacts.length})
                </h2>
                <button onClick={() => { setEditingContact(null); setShowContactForm(true); }} className="px-3 py-1.5 bg-purple-50 hover:bg-purple-100 text-purple-700 rounded-lg text-xs font-bold transition-all flex items-center gap-1 border border-purple-200">
                  <Plus className="w-3 h-3" /> Add Contact
                </button>
              </div>
              {customer.contacts.length === 0 ? (
                <div className="text-center py-8 text-gray-400">
                  <User className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                  <p className="text-sm">No contacts yet — add site contacts, billing contacts, and more</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {customer.contacts.map(contact => (
                    <div key={contact.id} className="bg-gray-50 rounded-xl p-4 flex items-start justify-between group hover:bg-gray-100 transition-colors border border-gray-100">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-bold text-sm text-gray-900">{contact.name}</p>
                          {contact.is_primary && (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-purple-100 text-purple-700 flex items-center gap-0.5">
                              <Star className="w-2.5 h-2.5" /> Primary
                            </span>
                          )}
                          {contact.is_billing_contact && (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-100 text-emerald-700 flex items-center gap-0.5">
                              <DollarSign className="w-2.5 h-2.5" /> Billing
                            </span>
                          )}
                          {contact.role && (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-blue-100 text-blue-700">
                              {ROLE_LABELS[contact.role] || contact.role}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-4 mt-1.5">
                          {contact.email && (
                            <a href={`mailto:${contact.email}`} className="text-xs text-gray-500 hover:text-purple-600 flex items-center gap-1 transition-colors">
                              <Mail className="w-3 h-3" /> {contact.email}
                            </a>
                          )}
                          {contact.phone && (
                            <a href={`tel:${contact.phone}`} className="text-xs text-gray-500 hover:text-purple-600 flex items-center gap-1 transition-colors">
                              <Phone className="w-3 h-3" /> {contact.phone}
                            </a>
                          )}
                        </div>
                        {contact.notes && (
                          <p className="text-xs text-gray-400 mt-1">{contact.notes}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity ml-2">
                        <button onClick={() => { setEditingContact(contact); setShowContactForm(true); }} className="p-1.5 hover:bg-gray-200 rounded-lg transition-colors">
                          <Edit className="w-3.5 h-3.5 text-gray-500" />
                        </button>
                        <button onClick={() => handleDeleteContact(contact.id)} className="p-1.5 hover:bg-red-100 rounded-lg transition-colors">
                          <Trash2 className="w-3.5 h-3.5 text-gray-400 hover:text-red-500" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Project History — grouped by project name */}
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-bold text-gray-900 flex items-center gap-2">
                  <Briefcase className="w-4 h-4 text-purple-600" />
                  Project History
                  <span className="text-sm font-normal text-gray-400">({customer.jobs.length} jobs · {projectNames.length} projects)</span>
                </h2>
                <button
                  onClick={() => handleAddJobForProject('', undefined)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold rounded-lg transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" /> New Job
                </button>
              </div>

              {customer.jobs.length === 0 ? (
                <div className="text-center py-8 text-gray-400">
                  <Briefcase className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                  <p className="text-sm">No projects yet</p>
                  <button
                    onClick={() => handleAddJobForProject('', undefined)}
                    className="mt-3 px-4 py-2 bg-purple-600 text-white text-sm font-semibold rounded-lg hover:bg-purple-700 transition-colors"
                  >
                    + Create First Job
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {projectNames.map((projectName) => {
                    const projectJobs = jobsByProject[projectName];
                    const isExpanded = expandedProjects[projectName] ?? false;
                    const totalValue = projectJobs.reduce((s, j) => s + (Number(j.estimated_cost) || 0), 0);
                    const latestJob = projectJobs[0];
                    const activeCount = projectJobs.filter(j => !['completed', 'cancelled', 'invoiced'].includes(j.status)).length;
                    const representativeJob = projectJobs[0];

                    return (
                      <div key={projectName} className="border border-gray-200 rounded-xl overflow-hidden">
                        {/* Project Header Row */}
                        <div
                          className="flex items-center gap-3 px-4 py-3 bg-gray-50 hover:bg-gray-100 cursor-pointer transition-colors"
                          onClick={() => toggleProject(projectName)}
                        >
                          <ChevronRight className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-bold text-gray-900 text-sm truncate">{projectName}</span>
                              {activeCount > 0 && (
                                <span className="px-1.5 py-0.5 bg-orange-100 text-orange-700 text-[10px] font-bold rounded-full">{activeCount} active</span>
                              )}
                            </div>
                            <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-500">
                              <span>{projectJobs.length} job{projectJobs.length !== 1 ? 's' : ''}</span>
                              {latestJob?.scheduled_date && <span>Last: {formatDate(latestJob.scheduled_date)}</span>}
                            </div>
                          </div>
                          <div className="flex items-center gap-3 flex-shrink-0">
                            <span className="text-sm font-bold text-emerald-600">${totalValue.toLocaleString()}</span>
                            <button
                              onClick={(e) => { e.stopPropagation(); handleAddJobForProject(projectName, representativeJob); }}
                              className="flex items-center gap-1 px-2.5 py-1.5 bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold rounded-lg transition-colors whitespace-nowrap"
                            >
                              <Plus className="w-3 h-3" /> Add Job
                            </button>
                          </div>
                        </div>

                        {/* Expanded Job List */}
                        {isExpanded && (
                          <div className="border-t border-gray-200">
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="text-left text-[11px] text-gray-400 uppercase tracking-wide border-b border-gray-100 bg-white">
                                  <th className="px-4 py-2">Job #</th>
                                  <th className="px-4 py-2">Type</th>
                                  <th className="px-4 py-2">Date</th>
                                  <th className="px-4 py-2">Status</th>
                                  <th className="px-4 py-2 text-right">Cost</th>
                                </tr>
                              </thead>
                              <tbody>
                                {projectJobs.map((job, jIdx) => (
                                  <tr
                                    key={job.id}
                                    className={`border-b border-gray-50 hover:bg-purple-50 cursor-pointer transition-colors ${jIdx === projectJobs.length - 1 ? 'border-0' : ''} ${selectedJobId === job.id ? 'bg-purple-50 ring-1 ring-purple-300' : ''}`}
                                    onClick={() => setSelectedJobId(job.id)}
                                  >
                                    <td className="px-4 py-2.5 font-mono text-xs text-purple-600 font-semibold">{job.job_number}</td>
                                    <td className="px-4 py-2.5 text-gray-700 text-xs">{job.job_type || '--'}</td>
                                    <td className="px-4 py-2.5 text-gray-500 text-xs">{formatDate(job.scheduled_date)}</td>
                                    <td className="px-4 py-2.5">
                                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${STATUS_COLORS[job.status] || 'bg-gray-100 text-gray-600'}`}>
                                        {job.status.replace(/_/g, ' ')}
                                      </span>
                                    </td>
                                    <td className="px-4 py-2.5 text-right text-gray-700 text-xs font-semibold">
                                      {job.estimated_cost ? `$${Number(job.estimated_cost).toLocaleString()}` : '--'}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                            <div className="px-4 py-2.5 bg-gray-50 border-t border-gray-100 flex justify-between items-center">
                              <span className="text-xs text-gray-500">{projectJobs.length} job{projectJobs.length !== 1 ? 's' : ''}</span>
                              <span className="text-xs font-bold text-emerald-700">Total: ${totalValue.toLocaleString()}</span>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {/* Grand Total */}
                  <div className="flex justify-between items-center px-4 py-3 bg-emerald-50 border border-emerald-200 rounded-xl">
                    <span className="text-sm font-bold text-gray-700">All Projects Total</span>
                    <span className="text-sm font-bold text-emerald-700">${customer.stats.total_revenue.toLocaleString()}</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right Column — 1/3 */}
          <div className="space-y-5">

            {/* Payment & Billing Card */}
            <div className="bg-white rounded-xl border border-emerald-200 shadow-sm p-5">
              <h2 className="font-bold text-emerald-700 flex items-center gap-2 mb-4">
                <CreditCard className="w-4 h-4" /> Payment & Billing
              </h2>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500">Payment Terms</span>
                  <span className="text-sm font-bold text-gray-900">{formatPaymentTerms(customer.payment_terms)}</span>
                </div>
                {customer.payment_method && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-500">Payment Method</span>
                    <span className="text-sm font-bold text-gray-900">{PAYMENT_METHOD_LABELS[customer.payment_method] || customer.payment_method}</span>
                  </div>
                )}
                {customer.tax_id && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-500">Tax ID / EIN</span>
                    <span className="text-sm font-mono text-gray-900">{customer.tax_id}</span>
                  </div>
                )}
                <div className="border-t border-gray-100 pt-3 mt-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-gray-500">Total Invoiced</span>
                    <span className="text-lg font-bold text-emerald-600">${customer.stats.total_revenue.toLocaleString()}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-500">Active Jobs Value</span>
                    <span className="text-sm font-bold text-cyan-600">
                      ${activeJobs.reduce((sum, j) => sum + (Number(j.estimated_cost) || 0), 0).toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>

              {/* Billing Contact quick view */}
              {(customer.billing_contact_name || customer.billing_contact_email) && (
                <div className="mt-4 pt-3 border-t border-gray-100">
                  <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider mb-1.5">Billing Contact</p>
                  {customer.billing_contact_name && <p className="text-sm text-gray-900 font-medium">{customer.billing_contact_name}</p>}
                  {customer.billing_contact_email && (
                    <a href={`mailto:${customer.billing_contact_email}`} className="text-xs text-emerald-600 hover:text-emerald-700 flex items-center gap-1 mt-0.5 transition-colors">
                      <Mail className="w-3 h-3" /> {customer.billing_contact_email}
                    </a>
                  )}
                  {customer.billing_contact_phone && (
                    <a href={`tel:${customer.billing_contact_phone}`} className="text-xs text-emerald-600 hover:text-emerald-700 flex items-center gap-1 mt-0.5 transition-colors">
                      <Phone className="w-3 h-3" /> {customer.billing_contact_phone}
                    </a>
                  )}
                </div>
              )}
            </div>

            {/* Customer Details Card */}
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
              <h2 className="font-bold text-gray-900 flex items-center gap-2 mb-3">
                <Building2 className="w-4 h-4 text-purple-600" /> Company Details
              </h2>
              <div className="space-y-3 text-sm">
                {customer.address && (
                  <div className="flex items-start gap-2">
                    <MapPin className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-gray-700">{customer.address}</p>
                      {(customer.city || customer.state || customer.zip) && (
                        <p className="text-gray-500">{[customer.city, customer.state, customer.zip].filter(Boolean).join(', ')}</p>
                      )}
                    </div>
                  </div>
                )}
                {customer.primary_contact_name && (
                  <div className="flex items-center gap-2">
                    <User className="w-4 h-4 text-gray-400 flex-shrink-0" />
                    <span className="text-gray-700">{customer.primary_contact_name}</span>
                  </div>
                )}
                {customer.primary_contact_phone && (
                  <div className="flex items-center gap-2">
                    <Phone className="w-4 h-4 text-gray-400 flex-shrink-0" />
                    <a href={`tel:${customer.primary_contact_phone}`} className="text-gray-700 hover:text-purple-600 transition-colors">{customer.primary_contact_phone}</a>
                  </div>
                )}
                {customer.primary_contact_email && (
                  <div className="flex items-center gap-2">
                    <Mail className="w-4 h-4 text-gray-400 flex-shrink-0" />
                    <a href={`mailto:${customer.primary_contact_email}`} className="text-gray-700 hover:text-purple-600 transition-colors truncate">{customer.primary_contact_email}</a>
                  </div>
                )}
                {customer.website && (
                  <div className="flex items-center gap-2">
                    <Globe className="w-4 h-4 text-gray-400 flex-shrink-0" />
                    <a href={customer.website} target="_blank" rel="noopener noreferrer" className="text-gray-700 hover:text-purple-600 transition-colors truncate flex items-center gap-1">
                      {customer.website.replace(/^https?:\/\//, '')} <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                )}
                {customer.customer_type && (
                  <div className="flex items-center gap-2">
                    <Shield className="w-4 h-4 text-gray-400 flex-shrink-0" />
                    <span className="text-gray-700">{TYPE_LABELS[customer.customer_type] || customer.customer_type}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Notes */}
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
              <h2 className="font-bold text-gray-900 flex items-center gap-2 mb-3">
                <FileText className="w-4 h-4 text-purple-600" /> Internal Notes
              </h2>
              <textarea
                className="w-full px-3 py-2.5 text-gray-900 bg-white border border-gray-300 rounded-xl text-sm focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 transition-all placeholder-gray-400 min-h-[100px] resize-y"
                placeholder="Internal notes about this customer..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
              <button
                onClick={handleSaveNotes}
                disabled={savingNotes}
                className="mt-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 disabled:opacity-50"
              >
                {savingNotes ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                Save Notes
              </button>
            </div>
          </div>
        </div>
      </div>

      {showEditModal && (
        <CustomerForm
          customer={customer}
          onSubmit={handleEditCustomer}
          onClose={() => setShowEditModal(false)}
        />
      )}

      {showContactForm && (
        <ContactForm
          contact={editingContact}
          onSubmit={editingContact ? handleEditContact : handleAddContact}
          onClose={() => { setShowContactForm(false); setEditingContact(null); }}
        />
      )}

      {/* Job History Detail Panel */}
      {selectedJobId && (
        <JobHistoryDetailPanel
          jobId={selectedJobId}
          onClose={() => setSelectedJobId(null)}
        />
      )}
    </div>
  );
}
