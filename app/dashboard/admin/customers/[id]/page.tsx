'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import {
  ChevronLeft, Building2, Edit, Trash2, Plus, Mail, Phone, MapPin,
  DollarSign, Briefcase, Loader2, User, FileText, Save, Star, Shield
} from 'lucide-react';
import { getCurrentUser } from '@/lib/auth';
import CustomerForm from '../_components/CustomerForm';
import ContactForm from '../_components/ContactForm';

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
  estimated_cost: number | null;
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
  notes: string | null;
  is_active: boolean;
  contacts: Contact[];
  jobs: Job[];
  stats: {
    total_jobs: number;
    total_revenue: number;
    active_jobs: number;
  };
}

const STATUS_COLORS: Record<string, string> = {
  pending_approval: 'bg-yellow-500/20 text-yellow-300',
  approved: 'bg-blue-500/20 text-blue-300',
  scheduled: 'bg-purple-500/20 text-purple-300',
  in_progress: 'bg-orange-500/20 text-orange-300',
  completed: 'bg-green-500/20 text-green-300',
  cancelled: 'bg-red-500/20 text-red-300',
  invoiced: 'bg-emerald-500/20 text-emerald-300',
};

const TYPE_LABELS: Record<string, string> = {
  general_contractor: 'General Contractor',
  subcontractor: 'Subcontractor',
  direct_client: 'Direct Client',
  government: 'Government',
  other: 'Other',
};

const ROLE_LABELS: Record<string, string> = {
  site_contact: 'Site Contact',
  project_manager: 'Project Manager',
  billing: 'Billing',
  owner: 'Owner',
  other: 'Other',
};

async function apiFetch(url: string, opts?: RequestInit) {
  const stored = typeof window !== 'undefined' ? localStorage.getItem('supabase-user') : null;
  const token = stored ? JSON.parse(stored).session?.access_token : null;
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
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const json = await res.json();
      throw new Error(json.error || 'Failed to update customer');
    }
    setShowEditModal(false);
    fetchCustomer();
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
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-purple-400" />
      </div>
    );
  }

  if (!customer) return null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white">
      <div className="container mx-auto px-4 md:px-6 py-6 max-w-5xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Link href="/dashboard/admin/customers" className="p-2 hover:bg-white/10 rounded-xl transition-colors">
              <ChevronLeft className="w-5 h-5" />
            </Link>
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <Building2 className="w-6 h-6 text-purple-400" />
                {customer.name}
              </h1>
              <div className="flex items-center gap-2 mt-1">
                {customer.customer_type && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-500/20 text-indigo-300">
                    {TYPE_LABELS[customer.customer_type] || customer.customer_type}
                  </span>
                )}
                {customer.is_active === false && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-500/20 text-red-300">Inactive</span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowEditModal(true)} className="px-3 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-sm font-bold transition-all flex items-center gap-1.5">
              <Edit className="w-4 h-4" /> Edit
            </button>
            {userRole === 'super_admin' && (
              <button onClick={handleDeleteCustomer} className="px-3 py-2 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 rounded-xl text-sm font-bold text-red-400 transition-all flex items-center gap-1.5">
                <Trash2 className="w-4 h-4" /> Delete
              </button>
            )}
          </div>
        </div>

        {/* Stats Bar */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          <div className="bg-white/5 rounded-xl p-4 border border-white/10">
            <p className="text-2xl font-bold text-purple-400">{customer.stats.total_jobs}</p>
            <p className="text-xs text-gray-400">Total Jobs</p>
          </div>
          <div className="bg-white/5 rounded-xl p-4 border border-white/10">
            <p className="text-2xl font-bold text-emerald-400">${customer.stats.total_revenue.toLocaleString()}</p>
            <p className="text-xs text-gray-400">Total Revenue</p>
          </div>
          <div className="bg-white/5 rounded-xl p-4 border border-white/10">
            <p className="text-2xl font-bold text-cyan-400">{customer.stats.active_jobs}</p>
            <p className="text-xs text-gray-400">Active Jobs</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Left Column */}
          <div className="lg:col-span-2 space-y-5">
            {/* Contacts */}
            <div className="bg-white/5 rounded-xl border border-white/10 p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-bold text-white flex items-center gap-2">
                  <User className="w-4 h-4 text-purple-400" /> Contacts
                </h2>
                <button onClick={() => { setEditingContact(null); setShowContactForm(true); }} className="px-3 py-1.5 bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 rounded-lg text-xs font-bold transition-all flex items-center gap-1">
                  <Plus className="w-3 h-3" /> Add Contact
                </button>
              </div>
              {customer.contacts.length === 0 ? (
                <p className="text-sm text-gray-500">No contacts yet</p>
              ) : (
                <div className="space-y-2">
                  {customer.contacts.map(contact => (
                    <div key={contact.id} className="bg-white/5 rounded-lg p-3 flex items-center justify-between group">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-bold text-sm text-white">{contact.name}</p>
                          {contact.is_primary && (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-purple-500/20 text-purple-300 flex items-center gap-0.5">
                              <Star className="w-2.5 h-2.5" /> Primary
                            </span>
                          )}
                          {contact.is_billing_contact && (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-500/20 text-emerald-300 flex items-center gap-0.5">
                              <DollarSign className="w-2.5 h-2.5" /> Billing
                            </span>
                          )}
                          {contact.role && (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-blue-500/20 text-blue-300">
                              {ROLE_LABELS[contact.role] || contact.role}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-4 mt-1">
                          {contact.email && (
                            <a href={`mailto:${contact.email}`} className="text-xs text-gray-400 hover:text-purple-300 flex items-center gap-1 transition-colors">
                              <Mail className="w-3 h-3" /> {contact.email}
                            </a>
                          )}
                          {contact.phone && (
                            <a href={`tel:${contact.phone}`} className="text-xs text-gray-400 hover:text-purple-300 flex items-center gap-1 transition-colors">
                              <Phone className="w-3 h-3" /> {contact.phone}
                            </a>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => { setEditingContact(contact); setShowContactForm(true); }} className="p-1.5 hover:bg-white/10 rounded-lg transition-colors">
                          <Edit className="w-3.5 h-3.5 text-gray-400" />
                        </button>
                        <button onClick={() => handleDeleteContact(contact.id)} className="p-1.5 hover:bg-red-500/20 rounded-lg transition-colors">
                          <Trash2 className="w-3.5 h-3.5 text-gray-400 hover:text-red-400" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Job History */}
            <div className="bg-white/5 rounded-xl border border-white/10 p-5">
              <h2 className="font-bold text-white flex items-center gap-2 mb-4">
                <FileText className="w-4 h-4 text-purple-400" /> Job History
              </h2>
              {customer.jobs.length === 0 ? (
                <p className="text-sm text-gray-500">No jobs yet</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-gray-400 border-b border-white/10">
                        <th className="pb-2 pr-3">Job #</th>
                        <th className="pb-2 pr-3">Type</th>
                        <th className="pb-2 pr-3">Date</th>
                        <th className="pb-2 pr-3">Status</th>
                        <th className="pb-2 text-right">Est. Cost</th>
                      </tr>
                    </thead>
                    <tbody>
                      {customer.jobs.map(job => (
                        <tr key={job.id} className="border-b border-white/5 hover:bg-white/5 cursor-pointer transition-colors" onClick={() => router.push(`/dashboard/admin/schedule-board`)}>
                          <td className="py-2.5 pr-3 font-mono text-xs text-purple-300">{job.job_number}</td>
                          <td className="py-2.5 pr-3 text-gray-300">{job.job_type || '--'}</td>
                          <td className="py-2.5 pr-3 text-gray-400">{formatDate(job.scheduled_date)}</td>
                          <td className="py-2.5 pr-3">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${STATUS_COLORS[job.status] || 'bg-gray-500/20 text-gray-300'}`}>
                              {job.status.replace(/_/g, ' ')}
                            </span>
                          </td>
                          <td className="py-2.5 text-right text-gray-300">{job.estimated_cost ? `$${Number(job.estimated_cost).toLocaleString()}` : '--'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          {/* Right Column */}
          <div className="space-y-5">
            {/* Billing Info */}
            {(customer.billing_contact_name || customer.billing_contact_email || customer.billing_contact_phone) && (
              <div className="bg-emerald-500/10 rounded-xl border border-emerald-500/20 p-5">
                <h2 className="font-bold text-emerald-300 flex items-center gap-2 mb-3">
                  <DollarSign className="w-4 h-4" /> Billing Contact
                </h2>
                {customer.billing_contact_name && (
                  <p className="text-sm text-white font-medium">{customer.billing_contact_name}</p>
                )}
                {customer.billing_contact_email && (
                  <a href={`mailto:${customer.billing_contact_email}`} className="text-sm text-emerald-300 hover:text-emerald-200 flex items-center gap-1.5 mt-1 transition-colors">
                    <Mail className="w-3.5 h-3.5" /> {customer.billing_contact_email}
                  </a>
                )}
                {customer.billing_contact_phone && (
                  <a href={`tel:${customer.billing_contact_phone}`} className="text-sm text-emerald-300 hover:text-emerald-200 flex items-center gap-1.5 mt-1 transition-colors">
                    <Phone className="w-3.5 h-3.5" /> {customer.billing_contact_phone}
                  </a>
                )}
              </div>
            )}

            {/* Customer Details */}
            <div className="bg-white/5 rounded-xl border border-white/10 p-5">
              <h2 className="font-bold text-white flex items-center gap-2 mb-3">
                <Building2 className="w-4 h-4 text-purple-400" /> Details
              </h2>
              <div className="space-y-3 text-sm">
                {customer.address && (
                  <div className="flex items-start gap-2">
                    <MapPin className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-gray-300">{customer.address}</p>
                      {(customer.city || customer.state || customer.zip) && (
                        <p className="text-gray-400">{[customer.city, customer.state, customer.zip].filter(Boolean).join(', ')}</p>
                      )}
                    </div>
                  </div>
                )}
                {customer.primary_contact_name && (
                  <div className="flex items-center gap-2">
                    <User className="w-4 h-4 text-gray-400 flex-shrink-0" />
                    <span className="text-gray-300">{customer.primary_contact_name}</span>
                  </div>
                )}
                {customer.primary_contact_phone && (
                  <div className="flex items-center gap-2">
                    <Phone className="w-4 h-4 text-gray-400 flex-shrink-0" />
                    <a href={`tel:${customer.primary_contact_phone}`} className="text-gray-300 hover:text-purple-300 transition-colors">{customer.primary_contact_phone}</a>
                  </div>
                )}
                {customer.primary_contact_email && (
                  <div className="flex items-center gap-2">
                    <Mail className="w-4 h-4 text-gray-400 flex-shrink-0" />
                    <a href={`mailto:${customer.primary_contact_email}`} className="text-gray-300 hover:text-purple-300 transition-colors truncate">{customer.primary_contact_email}</a>
                  </div>
                )}
                {customer.customer_type && (
                  <div className="flex items-center gap-2">
                    <Shield className="w-4 h-4 text-gray-400 flex-shrink-0" />
                    <span className="text-gray-300">{TYPE_LABELS[customer.customer_type] || customer.customer_type}</span>
                  </div>
                )}
                {customer.payment_terms !== null && customer.payment_terms !== undefined && (
                  <div className="flex items-center gap-2">
                    <DollarSign className="w-4 h-4 text-gray-400 flex-shrink-0" />
                    <span className="text-gray-300">
                      {customer.payment_terms === 0 || customer.payment_terms === '0' ? 'Due on Receipt' : `Net ${customer.payment_terms}`}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Notes */}
            <div className="bg-white/5 rounded-xl border border-white/10 p-5">
              <h2 className="font-bold text-white flex items-center gap-2 mb-3">
                <FileText className="w-4 h-4 text-purple-400" /> Notes
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
                className="mt-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 disabled:opacity-50"
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
    </div>
  );
}
