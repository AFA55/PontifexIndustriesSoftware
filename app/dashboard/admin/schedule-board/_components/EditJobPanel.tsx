'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  X, Calendar, Clock, MapPin, Wrench, Phone, FileText, Edit3, Save, Trash2,
  AlertTriangle, MessageSquare, ChevronRight, Plus, Users, Printer, Loader2,
  Copy, Upload, User, Mail, Building2, ChevronDown, Check, Paperclip
} from 'lucide-react';
import type { JobCardData } from './JobCard';
import { EQUIPMENT_ABBREVIATIONS, getDisplayName } from '@/lib/equipment-map';
import SkillMatchIndicator from './SkillMatchIndicator';

interface Contact {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  role: string | null;
  is_primary: boolean;
}

interface JobDocument {
  id: string;
  name: string;
  url: string;
  type: string;
  uploaded_at: string;
}

interface EditJobPanelProps {
  job: JobCardData;
  canEdit: boolean;
  allOperators: string[];
  allHelpers: string[];
  currentOperatorName: string | null;
  currentHelperName: string | null;
  busyOperators: Record<string, string>;
  busyHelpers: Record<string, string>;
  operatorSkillMap?: Record<string, number | null>;
  onSave: (updates: Partial<JobCardData> & { newOperatorName?: string | null; newHelperName?: string | null; customer_contact?: string; site_contact_phone?: string }) => void;
  onClose: () => void;
  onViewNotes: () => void;
  onMakeWillCall?: () => void;
  onRemoveFromSchedule?: () => void;
  onDuplicate?: (jobId: string, scheduledDate: string, endDate?: string) => void;
  onRefresh?: () => void;
}

export default function EditJobPanel({
  job, canEdit, allOperators, allHelpers,
  currentOperatorName, currentHelperName,
  busyOperators, busyHelpers, operatorSkillMap,
  onSave, onClose, onViewNotes, onMakeWillCall, onRemoveFromSchedule, onDuplicate, onRefresh,
}: EditJobPanelProps) {
  // ─── Core edit state ───
  const [scheduledDate, setScheduledDate] = useState(job.scheduled_date || '');
  const [arrivalTime, setArrivalTime] = useState(job.arrival_time || '');
  const [endDate, setEndDate] = useState(job.end_date || '');
  const [equipment, setEquipment] = useState<string[]>([...job.equipment_needed]);
  const [newEquipment, setNewEquipment] = useState('');
  const [selectedOperator, setSelectedOperator] = useState<string>(currentOperatorName || '');
  const [selectedHelper, setSelectedHelper] = useState<string>(currentHelperName || '');
  const [description, setDescription] = useState(job.description || '');
  const [poNumber, setPoNumber] = useState(job.po_number || '');
  const [hasChanges, setHasChanges] = useState(false);
  const [printingPdf, setPrintingPdf] = useState(false);

  // ─── Contact state ───
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selectedContact, setSelectedContact] = useState('');
  const [selectedContactPhone, setSelectedContactPhone] = useState('');
  const [showAddContact, setShowAddContact] = useState(false);
  const [newContact, setNewContact] = useState({ name: '', phone: '', email: '', role: '' });
  const [contactsLoading, setContactsLoading] = useState(false);
  const [showContactDropdown, setShowContactDropdown] = useState(false);

  // ─── Full detail state ───
  const [fullData, setFullData] = useState<Record<string, unknown> | null>(null);
  const [documents, setDocuments] = useState<JobDocument[]>([]);
  const [uploading, setUploading] = useState(false);

  // ─── Duplicate state ───
  const [showDuplicate, setShowDuplicate] = useState(false);
  const [dupDate, setDupDate] = useState('');
  const [dupEndDate, setDupEndDate] = useState('');
  const [duplicating, setDuplicating] = useState(false);

  // ─── Active tab ───
  const [activeTab, setActiveTab] = useState<'details' | 'documents'>('details');

  const markChanged = () => setHasChanges(true);

  // ─── Load full job data + contacts ───
  useEffect(() => {
    const loadData = async () => {
      const { supabase } = await import('@/lib/supabase');
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const headers = { Authorization: `Bearer ${session.access_token}` };

      // Fetch full job detail
      const detailRes = await fetch(`/api/job-orders/${job.id}/full-detail`, { headers });
      if (detailRes.ok) {
        const json = await detailRes.json();
        if (json.data) {
          setFullData(json.data);
          setSelectedContact(json.data.customer_contact || '');
          setSelectedContactPhone(json.data.site_contact_phone || '');
          setDescription(json.data.description || job.description || '');
          setPoNumber(json.data.po_number || job.po_number || '');
          // Load equipment from full data if our card data was empty
          if (json.data.equipment_needed?.length > 0 && equipment.length === 0) {
            setEquipment(json.data.equipment_needed);
          }
        }
      }

      // Fetch documents
      const docsRes = await fetch(`/api/job-orders/${job.id}/documents`, { headers });
      if (docsRes.ok) {
        const json = await docsRes.json();
        if (json.data) setDocuments(json.data);
      }
    };
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job.id]);

  // ─── Load contacts when we have customer_id ───
  useEffect(() => {
    if (!fullData) return;
    const customerId = fullData.customer_id as string | undefined;
    if (!customerId) return;

    const loadContacts = async () => {
      setContactsLoading(true);
      const { supabase } = await import('@/lib/supabase');
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setContactsLoading(false); return; }

      const res = await fetch(`/api/admin/customers/${customerId}/contacts`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (res.ok) {
        const json = await res.json();
        if (json.data) setContacts(json.data);
      }
      setContactsLoading(false);
    };
    loadContacts();
  }, [fullData]);

  // ─── Handlers ───
  const handlePrintDispatch = async () => {
    setPrintingPdf(true);
    try {
      const { supabase } = await import('@/lib/supabase');
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const res = await fetch(`/api/job-orders/${job.id}/dispatch-pdf`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (res.ok) {
        const blob = await res.blob();
        window.open(URL.createObjectURL(blob), '_blank');
      }
    } catch (err) {
      console.error('Error generating dispatch PDF:', err);
    } finally {
      setPrintingPdf(false);
    }
  };

  const addEquipment = (item: string) => {
    const trimmed = item.trim().toUpperCase();
    if (trimmed && !equipment.includes(trimmed)) {
      setEquipment(prev => [...prev, trimmed]);
      setNewEquipment('');
      markChanged();
    }
  };

  const removeEquipment = (item: string) => {
    setEquipment(prev => prev.filter(e => e !== item));
    markChanged();
  };

  const handleSelectContact = (contact: Contact) => {
    setSelectedContact(contact.name);
    setSelectedContactPhone(contact.phone || '');
    setShowContactDropdown(false);
    markChanged();
  };

  const handleAddNewContact = async () => {
    if (!newContact.name.trim()) return;
    const customerId = fullData?.customer_id as string | undefined;
    if (!customerId) return;

    const { supabase } = await import('@/lib/supabase');
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const res = await fetch(`/api/admin/customers/${customerId}/contacts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify(newContact),
    });

    if (res.ok) {
      const json = await res.json();
      if (json.data) {
        setContacts(prev => [...prev, json.data]);
        setSelectedContact(json.data.name);
        setSelectedContactPhone(json.data.phone || '');
        setNewContact({ name: '', phone: '', email: '', role: '' });
        setShowAddContact(false);
        markChanged();
      }
    }
  };

  const handleDuplicate = async () => {
    if (!dupDate) return;
    setDuplicating(true);
    try {
      const { supabase } = await import('@/lib/supabase');
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const res = await fetch(`/api/admin/job-orders/${job.id}/duplicate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ scheduled_date: dupDate, end_date: dupEndDate || undefined }),
      });

      if (res.ok) {
        setShowDuplicate(false);
        if (onDuplicate) onDuplicate(job.id, dupDate, dupEndDate || undefined);
        if (onRefresh) onRefresh();
        onClose();
      }
    } catch (err) {
      console.error('Error duplicating job:', err);
    } finally {
      setDuplicating(false);
    }
  };

  const handleUploadDocument = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length) return;
    setUploading(true);

    try {
      const { supabase } = await import('@/lib/supabase');
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      for (const file of Array.from(files)) {
        // Upload to Supabase Storage
        const path = `job-documents/${job.id}/${Date.now()}-${file.name}`;
        const { error: uploadError } = await supabase.storage.from('job-documents').upload(path, file);
        if (uploadError) {
          console.error('Upload error:', uploadError);
          continue;
        }
        const { data: { publicUrl } } = supabase.storage.from('job-documents').getPublicUrl(path);

        // Save to DB
        const res = await fetch(`/api/job-orders/${job.id}/documents`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
          body: JSON.stringify({ name: file.name, url: publicUrl, type: file.type }),
        });
        if (res.ok) {
          const json = await res.json();
          if (json.data) setDocuments(prev => [...prev, json.data]);
        }
      }
    } catch (err) {
      console.error('Error uploading document:', err);
    } finally {
      setUploading(false);
    }
  };

  const suggestions = EQUIPMENT_ABBREVIATIONS.filter(eq => !equipment.includes(eq));
  const operatorBusy = selectedOperator && selectedOperator !== currentOperatorName ? busyOperators[selectedOperator] : null;
  const helperBusy = selectedHelper && selectedHelper !== currentHelperName ? busyHelpers[selectedHelper] : null;

  const d = fullData;
  const customerName = (d?.customer_name as string) || job.customer_name;
  const location = (d?.location_name as string) || job.location;
  const address = (d?.site_address as string) || job.address;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[70]" onClick={onClose} />

      {/* Full-width modal */}
      <div className="fixed inset-4 sm:inset-6 lg:inset-x-[10%] lg:inset-y-6 bg-white rounded-2xl shadow-2xl z-[80] flex flex-col animate-in zoom-in-95 duration-200 overflow-hidden">
        {/* Header */}
        <div className={`px-6 py-4 text-white flex-shrink-0 ${canEdit
          ? 'bg-gradient-to-r from-purple-600 to-pink-500'
          : 'bg-gradient-to-r from-gray-600 to-gray-700'
        }`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div>
                <h2 className="text-lg font-bold flex items-center gap-2">
                  {canEdit ? <Edit3 className="w-5 h-5" /> : <FileText className="w-5 h-5" />}
                  {customerName}
                </h2>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-sm opacity-80">{job.job_number}</span>
                  <span className="px-2 py-0.5 bg-white/20 rounded-full text-xs font-bold">{job.job_type}</span>
                  {job.day_label && <span className="px-2 py-0.5 bg-white/20 rounded-full text-xs font-bold">{job.day_label}</span>}
                  {job.status && <span className="px-2 py-0.5 bg-white/20 rounded-full text-xs font-bold uppercase">{job.status}</span>}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {canEdit && (
                <button
                  onClick={() => setShowDuplicate(!showDuplicate)}
                  className="p-2 hover:bg-white/20 rounded-xl transition-colors"
                  title="Duplicate Job to New Date"
                >
                  <Copy className="w-5 h-5" />
                </button>
              )}
              <button
                onClick={handlePrintDispatch}
                disabled={printingPdf}
                className="p-2 hover:bg-white/20 rounded-xl transition-colors"
                title="Print Dispatch Ticket"
              >
                {printingPdf ? <Loader2 className="w-5 h-5 animate-spin" /> : <Printer className="w-5 h-5" />}
              </button>
              <button onClick={onClose} className="p-2 hover:bg-white/20 rounded-xl transition-colors">
                <X className="w-6 h-6" />
              </button>
            </div>
          </div>
        </div>

        {/* Duplicate job banner */}
        {showDuplicate && (
          <div className="px-6 py-3 bg-blue-50 border-b border-blue-200 flex items-center gap-3 flex-shrink-0">
            <Copy className="w-4 h-4 text-blue-600 flex-shrink-0" />
            <span className="text-sm font-semibold text-blue-800">Copy to:</span>
            <input type="date" value={dupDate} onChange={e => setDupDate(e.target.value)}
              className="px-3 py-1.5 border border-blue-300 rounded-lg text-sm text-gray-900 bg-white" />
            <input type="date" value={dupEndDate} onChange={e => setDupEndDate(e.target.value)}
              placeholder="End date (optional)"
              className="px-3 py-1.5 border border-blue-300 rounded-lg text-sm text-gray-900 bg-white" />
            <button onClick={handleDuplicate} disabled={!dupDate || duplicating}
              className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-bold transition-colors disabled:opacity-50 flex items-center gap-1.5">
              {duplicating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Copy className="w-3.5 h-3.5" />}
              Duplicate
            </button>
            <button onClick={() => setShowDuplicate(false)} className="p-1 hover:bg-blue-100 rounded-lg">
              <X className="w-4 h-4 text-blue-400" />
            </button>
          </div>
        )}

        {/* Tab bar */}
        <div className="px-6 border-b border-gray-200 flex gap-1 flex-shrink-0">
          {(['details', 'documents'] as const).map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={`px-4 py-3 text-sm font-semibold border-b-2 transition-colors capitalize ${
                activeTab === tab ? 'border-purple-500 text-purple-700' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}>
              {tab === 'documents' ? `Documents (${documents.length})` : 'Job Details'}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {activeTab === 'details' ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 p-6">
              {/* LEFT COLUMN — Job Info + Contact */}
              <div className="space-y-5">
                {/* Job Information */}
                <section className="bg-gray-50 rounded-xl p-4 border border-gray-200 space-y-3">
                  <h3 className="font-bold text-gray-900 flex items-center gap-2 text-sm uppercase tracking-wide">
                    <Building2 className="w-4 h-4 text-purple-500" /> Job Information
                  </h3>
                  {location && (
                    <div className="flex items-start gap-2 text-sm">
                      <MapPin className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="font-medium text-gray-900">{location}</p>
                        {address && <p className="text-xs text-gray-500">{address}</p>}
                      </div>
                    </div>
                  )}
                  {canEdit ? (
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 mb-1">SCOPE OF WORK</label>
                      <textarea value={description} onChange={e => { setDescription(e.target.value); markChanged(); }}
                        rows={3} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white resize-none focus:ring-2 focus:ring-purple-200 focus:border-purple-500" />
                    </div>
                  ) : (
                    description && (
                      <p className="text-sm text-gray-600 italic border-l-2 border-gray-300 pl-3">{description}</p>
                    )
                  )}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 mb-1">PO #</label>
                      {canEdit ? (
                        <input type="text" value={poNumber} onChange={e => { setPoNumber(e.target.value); markChanged(); }}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:ring-2 focus:ring-purple-200 focus:border-purple-500" />
                      ) : (
                        <p className="text-sm text-gray-900 font-medium">{poNumber || '--'}</p>
                      )}
                    </div>
                    {job.difficulty_rating && (
                      <div>
                        <label className="block text-xs font-semibold text-gray-500 mb-1">DIFFICULTY</label>
                        <div className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm font-bold ${
                          job.difficulty_rating >= 7 ? 'bg-red-100 text-red-700' :
                          job.difficulty_rating >= 4 ? 'bg-amber-100 text-amber-700' :
                          'bg-green-100 text-green-700'
                        }`}>
                          <AlertTriangle className="w-3.5 h-3.5" />
                          {job.difficulty_rating}/10
                        </div>
                      </div>
                    )}
                  </div>
                </section>

                {/* Site Contact */}
                <section className="bg-gray-50 rounded-xl p-4 border border-gray-200 space-y-3">
                  <h3 className="font-bold text-gray-900 flex items-center gap-2 text-sm uppercase tracking-wide">
                    <Phone className="w-4 h-4 text-purple-500" /> Site Contact
                  </h3>
                  {canEdit ? (
                    <div className="space-y-2">
                      {/* Contact selector */}
                      <div className="relative">
                        <button
                          onClick={() => setShowContactDropdown(!showContactDropdown)}
                          className="w-full flex items-center justify-between px-3 py-2.5 border border-gray-300 rounded-lg text-sm bg-white hover:border-purple-400 transition-colors"
                        >
                          <span className={selectedContact ? 'text-gray-900 font-medium' : 'text-gray-400'}>
                            {selectedContact || 'Select site contact...'}
                          </span>
                          <ChevronDown className="w-4 h-4 text-gray-400" />
                        </button>

                        {showContactDropdown && (
                          <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-xl z-10 max-h-48 overflow-y-auto">
                            {contactsLoading ? (
                              <div className="p-3 text-center text-sm text-gray-500">
                                <Loader2 className="w-4 h-4 animate-spin inline mr-1" /> Loading contacts...
                              </div>
                            ) : contacts.length > 0 ? (
                              contacts.map(c => (
                                <button key={c.id} onClick={() => handleSelectContact(c)}
                                  className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-purple-50 text-left transition-colors border-b border-gray-100 last:border-0">
                                  <User className="w-4 h-4 text-gray-400 flex-shrink-0" />
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-gray-900 truncate">{c.name}</p>
                                    <p className="text-xs text-gray-500 truncate">
                                      {c.phone || 'No phone'} {c.role && `· ${c.role}`}
                                    </p>
                                  </div>
                                  {c.is_primary && <span className="px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded text-[10px] font-bold">PRIMARY</span>}
                                  {selectedContact === c.name && <Check className="w-4 h-4 text-purple-600 flex-shrink-0" />}
                                </button>
                              ))
                            ) : (
                              <p className="p-3 text-sm text-gray-400 text-center">No contacts found</p>
                            )}
                            <button onClick={() => { setShowAddContact(true); setShowContactDropdown(false); }}
                              className="w-full flex items-center gap-2 px-3 py-2.5 text-purple-600 hover:bg-purple-50 text-sm font-semibold border-t border-gray-200">
                              <Plus className="w-4 h-4" /> Add New Contact
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Contact phone (auto-filled or manual) */}
                      <div className="flex gap-2">
                        <div className="flex-1">
                          <input type="text" value={selectedContact}
                            onChange={e => { setSelectedContact(e.target.value); markChanged(); }}
                            placeholder="Contact name"
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:ring-2 focus:ring-purple-200 focus:border-purple-500" />
                        </div>
                        <div className="flex-1">
                          <input type="tel" value={selectedContactPhone}
                            onChange={e => { setSelectedContactPhone(e.target.value); markChanged(); }}
                            placeholder="Phone number"
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:ring-2 focus:ring-purple-200 focus:border-purple-500" />
                        </div>
                      </div>

                      {/* Add new contact inline form */}
                      {showAddContact && (
                        <div className="bg-purple-50 rounded-lg p-3 border border-purple-200 space-y-2">
                          <p className="text-xs font-bold text-purple-700 uppercase">New Contact</p>
                          <div className="grid grid-cols-2 gap-2">
                            <input type="text" value={newContact.name} onChange={e => setNewContact(p => ({ ...p, name: e.target.value }))}
                              placeholder="Name *" className="px-2.5 py-1.5 border border-purple-200 rounded-lg text-sm bg-white" />
                            <input type="tel" value={newContact.phone} onChange={e => setNewContact(p => ({ ...p, phone: e.target.value }))}
                              placeholder="Phone" className="px-2.5 py-1.5 border border-purple-200 rounded-lg text-sm bg-white" />
                            <input type="email" value={newContact.email} onChange={e => setNewContact(p => ({ ...p, email: e.target.value }))}
                              placeholder="Email" className="px-2.5 py-1.5 border border-purple-200 rounded-lg text-sm bg-white" />
                            <input type="text" value={newContact.role} onChange={e => setNewContact(p => ({ ...p, role: e.target.value }))}
                              placeholder="Role (e.g. Foreman)" className="px-2.5 py-1.5 border border-purple-200 rounded-lg text-sm bg-white" />
                          </div>
                          <div className="flex gap-2 justify-end">
                            <button onClick={() => setShowAddContact(false)} className="px-3 py-1.5 text-xs text-gray-600 hover:text-gray-800">Cancel</button>
                            <button onClick={handleAddNewContact} disabled={!newContact.name.trim()}
                              className="px-3 py-1.5 bg-purple-600 text-white rounded-lg text-xs font-bold disabled:opacity-50">
                              Save & Select
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-1">
                      <p className="text-sm text-gray-900 font-medium">{selectedContact || (d?.customer_contact as string) || '--'}</p>
                      <p className="text-xs text-gray-500">{selectedContactPhone || (d?.site_contact_phone as string) || '--'}</p>
                    </div>
                  )}
                </section>

                {/* Equipment */}
                <section className="bg-gray-50 rounded-xl p-4 border border-gray-200 space-y-3">
                  <h3 className="font-bold text-gray-900 flex items-center gap-2 text-sm uppercase tracking-wide">
                    <Wrench className="w-4 h-4 text-purple-500" /> Equipment ({equipment.length})
                  </h3>
                  {canEdit ? (
                    <>
                      <div className="flex flex-wrap gap-1.5">
                        {equipment.map(eq => (
                          <span key={eq} className="inline-flex items-center gap-1 px-3 py-1.5 bg-indigo-50 rounded-lg text-sm text-indigo-700 font-semibold border border-indigo-200">
                            {eq} — {getDisplayName(eq)}
                            <button onClick={() => removeEquipment(eq)}
                              className="ml-0.5 p-0.5 hover:bg-indigo-200 rounded-full transition-colors">
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </span>
                        ))}
                        {equipment.length === 0 && <span className="text-sm text-gray-400 italic">No equipment added</span>}
                      </div>
                      <div className="flex gap-2">
                        <input type="text" value={newEquipment} onChange={e => setNewEquipment(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addEquipment(newEquipment); } }}
                          placeholder="Type equipment code..."
                          className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:ring-2 focus:ring-indigo-200 focus:border-indigo-500" />
                        <button onClick={() => addEquipment(newEquipment)} disabled={!newEquipment.trim()}
                          className="px-3 py-2 bg-indigo-500 hover:bg-indigo-600 text-white rounded-lg text-sm font-bold disabled:opacity-50">
                          <Plus className="w-4 h-4" />
                        </button>
                      </div>
                      {suggestions.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {suggestions.slice(0, 8).map(eq => (
                            <button key={eq} onClick={() => addEquipment(eq)}
                              className="px-2 py-1 bg-gray-100 hover:bg-indigo-100 rounded-lg text-xs text-gray-600 hover:text-indigo-700 border border-gray-200 hover:border-indigo-300 transition-all font-medium">
                              + {eq}
                            </button>
                          ))}
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {equipment.map(eq => (
                        <span key={eq} className="px-3 py-1 bg-indigo-50 rounded-lg text-sm text-indigo-700 font-medium border border-indigo-200">{getDisplayName(eq)}</span>
                      ))}
                      {equipment.length === 0 && <span className="text-sm text-gray-400 italic">No equipment specified</span>}
                    </div>
                  )}
                </section>
              </div>

              {/* RIGHT COLUMN — Schedule + Assignment + Actions */}
              <div className="space-y-5">
                {/* Schedule & Assignment */}
                <section className="bg-gray-50 rounded-xl p-4 border border-gray-200 space-y-4">
                  <h3 className="font-bold text-gray-900 flex items-center gap-2 text-sm uppercase tracking-wide">
                    <Calendar className="w-4 h-4 text-purple-500" /> Schedule & Assignment
                  </h3>
                  {canEdit ? (
                    <>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-semibold text-gray-500 mb-1">START DATE</label>
                          <input type="date" value={scheduledDate} onChange={e => { setScheduledDate(e.target.value); markChanged(); }}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:ring-2 focus:ring-purple-200 focus:border-purple-500" />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-gray-500 mb-1">END DATE</label>
                          <input type="date" value={endDate} onChange={e => { setEndDate(e.target.value); markChanged(); }}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:ring-2 focus:ring-purple-200 focus:border-purple-500" />
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-gray-500 mb-1">ARRIVAL TIME</label>
                        <input type="time" value={arrivalTime} onChange={e => { setArrivalTime(e.target.value); markChanged(); }}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:ring-2 focus:ring-purple-200 focus:border-purple-500" />
                      </div>

                      {/* Operator */}
                      <div>
                        <label className="block text-xs font-semibold text-gray-500 mb-1">OPERATOR</label>
                        <select value={selectedOperator} onChange={e => { setSelectedOperator(e.target.value); markChanged(); }}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:ring-2 focus:ring-purple-200 focus:border-purple-500">
                          <option value="">Unassigned</option>
                          {allOperators.map(name => {
                            const skill = operatorSkillMap?.[name];
                            const skillLabel = skill !== null && skill !== undefined ? ` [Skill: ${skill}]` : '';
                            return (
                              <option key={name} value={name}>
                                {name}{skillLabel}{busyOperators[name] && name !== currentOperatorName ? ` — On: ${busyOperators[name]}` : ''}
                              </option>
                            );
                          })}
                        </select>
                        {selectedOperator && operatorSkillMap && operatorSkillMap[selectedOperator] !== undefined && (
                          <div className="flex items-center gap-2 mt-1.5 px-2 py-1.5 bg-white rounded-lg border border-gray-200">
                            <span className="text-xs text-gray-600">Skill:</span>
                            <SkillMatchIndicator operatorSkill={operatorSkillMap[selectedOperator] ?? null} jobDifficulty={job.difficulty_rating} />
                          </div>
                        )}
                        {operatorBusy && (
                          <div className="flex items-center gap-1.5 mt-1.5 px-2 py-1.5 bg-amber-50 rounded-lg border border-amber-200">
                            <AlertTriangle className="w-3.5 h-3.5 text-amber-600 flex-shrink-0" />
                            <p className="text-xs text-amber-700">Already on <span className="font-bold">{operatorBusy}</span></p>
                          </div>
                        )}
                      </div>

                      {/* Helper */}
                      <div>
                        <label className="block text-xs font-semibold text-gray-500 mb-1">HELPER <span className="text-gray-400 font-normal">(optional)</span></label>
                        <select value={selectedHelper} onChange={e => { setSelectedHelper(e.target.value); markChanged(); }}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:ring-2 focus:ring-purple-200 focus:border-purple-500">
                          <option value="">No Helper</option>
                          {allHelpers.map(name => (
                            <option key={name} value={name}>
                              {name}{busyHelpers[name] && name !== currentHelperName ? ` — On: ${busyHelpers[name]}` : ''}
                            </option>
                          ))}
                        </select>
                        {helperBusy && (
                          <div className="flex items-center gap-1.5 mt-1.5 px-2 py-1.5 bg-amber-50 rounded-lg border border-amber-200">
                            <AlertTriangle className="w-3.5 h-3.5 text-amber-600 flex-shrink-0" />
                            <p className="text-xs text-amber-700">Already on <span className="font-bold">{helperBusy}</span></p>
                          </div>
                        )}
                      </div>
                    </>
                  ) : (
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between"><span className="text-gray-500">Date:</span><span className="font-medium">{scheduledDate}</span></div>
                      {endDate && <div className="flex justify-between"><span className="text-gray-500">End:</span><span className="font-medium">{endDate}</span></div>}
                      {arrivalTime && <div className="flex justify-between"><span className="text-gray-500">Arrival:</span><span className="font-medium">{arrivalTime}</span></div>}
                      <div className="flex justify-between"><span className="text-gray-500">Operator:</span><span className="font-medium">{currentOperatorName || 'Unassigned'}</span></div>
                      {currentHelperName && <div className="flex justify-between"><span className="text-gray-500">Helper:</span><span className="font-medium">{currentHelperName}</span></div>}
                    </div>
                  )}
                </section>

                {/* Quick Actions */}
                <section className="space-y-2">
                  <button onClick={onViewNotes}
                    className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 rounded-xl border border-gray-200 text-sm font-semibold text-gray-700 transition-colors">
                    <span className="flex items-center gap-2">
                      <MessageSquare className="w-4 h-4 text-green-600" /> View Notes
                      {job.notes_count > 0 && <span className="px-1.5 py-0.5 bg-green-100 text-green-700 rounded-full text-xs font-bold">{job.notes_count}</span>}
                    </span>
                    <ChevronRight className="w-4 h-4 text-gray-400" />
                  </button>

                  {canEdit && onMakeWillCall && !job.is_will_call && (
                    <button onClick={onMakeWillCall}
                      className="w-full flex items-center justify-between px-4 py-3 bg-amber-50 hover:bg-amber-100 rounded-xl border border-amber-200 text-sm font-semibold text-amber-700 transition-colors">
                      <span className="flex items-center gap-2"><Phone className="w-4 h-4" /> Move to Will Call</span>
                      <ChevronRight className="w-4 h-4 text-amber-400" />
                    </button>
                  )}

                  {canEdit && onRemoveFromSchedule && (
                    <button onClick={onRemoveFromSchedule}
                      className="w-full flex items-center justify-between px-4 py-3 bg-red-50 hover:bg-red-100 rounded-xl border border-red-200 text-sm font-semibold text-red-600 transition-colors">
                      <span className="flex items-center gap-2"><Trash2 className="w-4 h-4" /> Remove from Schedule</span>
                      <ChevronRight className="w-4 h-4 text-red-400" />
                    </button>
                  )}
                </section>
              </div>
            </div>
          ) : (
            /* Documents tab */
            <div className="p-6 space-y-4">
              {canEdit && (
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-2 px-4 py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-sm font-bold cursor-pointer transition-colors">
                    {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                    Upload Document
                    <input type="file" multiple onChange={handleUploadDocument} className="hidden" accept=".pdf,.doc,.docx,.jpg,.png,.jpeg" />
                  </label>
                  <p className="text-xs text-gray-400">PDF, Word, or images</p>
                </div>
              )}
              {documents.length > 0 ? (
                <div className="space-y-2">
                  {documents.map(doc => (
                    <a key={doc.id} href={doc.url} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-3 px-4 py-3 bg-gray-50 hover:bg-gray-100 rounded-xl border border-gray-200 transition-colors">
                      <Paperclip className="w-4 h-4 text-purple-500 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{doc.name}</p>
                        <p className="text-xs text-gray-400">{doc.type} · {new Date(doc.uploaded_at).toLocaleDateString()}</p>
                      </div>
                      <FileText className="w-4 h-4 text-gray-400" />
                    </a>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12">
                  <Paperclip className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                  <p className="text-sm text-gray-500 font-medium">No documents attached</p>
                  <p className="text-xs text-gray-400 mt-1">Upload plans, permits, photos, or other job documents</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        {canEdit && (
          <div className="border-t border-gray-200 px-6 py-4 flex items-center gap-3 bg-gray-50 flex-shrink-0">
            <button onClick={onClose}
              className="px-6 py-2.5 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-xl font-bold text-sm transition-all">
              Cancel
            </button>
            <div className="flex-1" />
            <button
              onClick={() => onSave({
                scheduled_date: scheduledDate,
                end_date: endDate || null,
                arrival_time: arrivalTime || null,
                equipment_needed: equipment,
                description: description || null,
                po_number: poNumber || null,
                newOperatorName: selectedOperator || null,
                newHelperName: selectedHelper || null,
                customer_contact: selectedContact || undefined,
                site_contact_phone: selectedContactPhone || undefined,
              })}
              disabled={!hasChanges}
              className="px-8 py-2.5 bg-gradient-to-r from-purple-600 to-pink-500 hover:from-purple-700 hover:to-pink-600 text-white rounded-xl font-bold text-sm transition-all shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2">
              <Save className="w-4 h-4" />
              Save Changes
            </button>
          </div>
        )}
      </div>
    </>
  );
}
