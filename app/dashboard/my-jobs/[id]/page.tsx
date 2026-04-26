'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, Briefcase, Loader2, Clock, Wrench, FileText,
  ChevronDown, User, Users, Inbox, PlayCircle, Star, CheckCircle2, Printer,
  Paperclip, Upload, Trash2, PauseCircle, X, Image, File, MapPin, Phone, Eye,
  AlertTriangle, Shield, Lock
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import UnifiedEquipmentPanel from '../_components/UnifiedEquipmentPanel';
import HelperWorkLog from '../_components/HelperWorkLog';
import type { JobTicketData } from '../_components/JobTicketCard';
import { isMandatoryComplete } from '@/lib/equipment-map';
import { unifyEquipmentSelections, allItemsConfirmed as checkAllConfirmed } from '@/lib/equipment-unifier';
import ScopeDetailsDisplay from '@/components/ScopeDetailsDisplay';
import { PhotoViewer } from '@/components/PhotoUploader';

function toDateString(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function formatTime(time: string | null) {
  if (!time) return null;
  if (/[APap][Mm]/.test(time)) return time.trim();
  const parts = time.split(':');
  if (parts.length < 2) return time;
  const h = parseInt(parts[0]);
  const m = parts[1].padStart(2, '0');
  const ampm = h >= 12 ? 'PM' : 'AM';
  const displayH = h % 12 || 12;
  return `${displayH}:${m} ${ampm}`;
}

function getStatusStyle(status: string) {
  switch (status) {
    case 'assigned': return 'bg-blue-100 text-blue-700 border-blue-200';
    case 'in_route': return 'bg-yellow-100 text-yellow-700 border-yellow-200';
    case 'in_progress': return 'bg-orange-100 text-orange-700 border-orange-200';
    case 'on_hold': return 'bg-purple-100 text-purple-700 border-purple-200';
    case 'completed': return 'bg-green-100 text-green-700 border-green-200';
    default: return 'bg-gray-100 text-gray-700 border-gray-200';
  }
}

export default function JobDetailPage() {
  const router = useRouter();
  const params = useParams();
  const jobId = params.id as string;

  const [job, setJob] = useState<JobTicketData | null>(null);
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState<string>('operator');
  const [userId, setUserId] = useState<string>('');
  const [startingRoute, setStartingRoute] = useState(false);

  // Equipment checklist state
  const [checkedItems, setCheckedItems] = useState<Record<string, boolean>>({});
  const [workDetailsOpen, setWorkDetailsOpen] = useState(true);
  const [equipmentOpen, setEquipmentOpen] = useState(true);
  const [contactOpen, setContactOpen] = useState(true);
  const [crewOpen, setCrewOpen] = useState(true);
  const [conditionsOpen, setConditionsOpen] = useState(true);
  const [complianceOpen, setComplianceOpen] = useState(true);
  const [notesOpen, setNotesOpen] = useState(true);

  // Documents state
  const [documents, setDocuments] = useState<any[]>([]);
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [docCategory, setDocCategory] = useState('other');
  const [docNotes, setDocNotes] = useState('');
  const [previewDoc, setPreviewDoc] = useState<any | null>(null);

  const isHelper = userRole === 'apprentice';

  // Recent approved change orders for scope-update banner
  const [recentChangeOrders, setRecentChangeOrders] = useState<Array<{ id: string; version: number; scope_description: string; created_at: string }>>([]);

  const fetchJob = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push('/login');
        return;
      }

      const uid = session.user.id;
      setUserId(uid);

      // Fetch only this specific job by ID for efficiency
      const res = await fetch(
        `/api/job-orders?id=${jobId}&include_helper_jobs=true&includeCompleted=true`,
        { headers: { Authorization: `Bearer ${session.access_token}` } }
      );

      if (res.ok) {
        const json = await res.json();
        if (json.success) {
          if (json.user_role) setUserRole(json.user_role);
          const found = (json.data || [])[0];
          if (found && found.id === jobId) {
            setJob({
              ...found,
              isHelper: found.helper_assigned_to === uid && found.assigned_to !== uid,
            });
          } else {
            router.push('/dashboard/my-jobs');
          }
        }
      }
    } catch (err) {
      console.error('Error fetching job:', err);
    } finally {
      setLoading(false);
    }
  }, [jobId, router]);

  const fetchDocuments = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const res = await fetch(`/api/job-orders/${jobId}/documents`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (res.ok) {
        const json = await res.json();
        setDocuments(json.data || []);
      }
    } catch {
      // silent
    }
  }, [jobId]);

  const fetchChangeOrders = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const res = await fetch(`/api/admin/jobs/${jobId}/change-orders`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (res.ok) {
        const json = await res.json();
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
        const recent = (json.data || []).filter(
          (co: { status: string; created_at: string }) =>
            co.status === 'approved' && co.created_at >= sevenDaysAgo,
        );
        setRecentChangeOrders(recent);
      }
    } catch {
      // silent
    }
  }, [jobId]);

  useEffect(() => {
    fetchJob();
    fetchDocuments();
    fetchChangeOrders();
  }, [fetchJob, fetchDocuments, fetchChangeOrders]);

  const toggleEquipment = (item: string) => {
    setCheckedItems(prev => ({ ...prev, [item]: !prev[item] }));
  };

  // Equipment logic — unified panel
  const mandatoryItems = job?.mandatory_equipment || [];
  const allEquipment = job?.equipment_needed || [];
  const mandatoryComplete = isMandatoryComplete(mandatoryItems, checkedItems);

  // Unified equipment items (deduplicated, categorized)
  const unifiedItems = useMemo(
    () => unifyEquipmentSelections(job?.equipment_selections, job?.equipment_needed, job?.mandatory_equipment),
    [job?.equipment_selections, job?.equipment_needed, job?.mandatory_equipment],
  );

  const hasEquipmentSelections = !!(job?.equipment_selections &&
    Object.keys(job.equipment_selections).length > 0);

  const hasOperatorConfirmedEquipment = (): boolean => {
    if (!job || !userId) return false;
    const confirmedBy = job.equipment_confirmed_by || [];
    return confirmedBy.includes(userId);
  };

  const equipmentAlreadyConfirmed = job ? hasOperatorConfirmedEquipment() : false;

  const canStartRoute = equipmentAlreadyConfirmed ||
    (hasEquipmentSelections
      ? checkAllConfirmed(unifiedItems, checkedItems)
      : mandatoryComplete);

  // Location & site contact unlock once equipment is confirmed AND job is in_route or further
  const equipmentAllChecked = equipmentAlreadyConfirmed ||
    (hasEquipmentSelections
      ? checkAllConfirmed(unifiedItems, checkedItems)
      : mandatoryComplete);
  const locationUnlocked = equipmentAllChecked &&
    ['in_route', 'on_site', 'in_progress', 'completed'].includes(job?.status || '');

  const isCompleted = job?.status === 'completed';
  const isOnHold = job?.status === 'on_hold';
  const isInProgress = job ? ['in_route', 'in_progress'].includes(job.status) : false;
  const jobIsHelper = job?.isHelper || isHelper;

  // Split documents into admin-attached and operator-uploaded
  const adminDocs = documents.filter(d => d.uploaded_by !== userId);
  const operatorDocs = documents.filter(d => d.uploaded_by === userId);

  const handleStartRoute = async () => {
    if (!canStartRoute || !job) return;
    setStartingRoute(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const currentConfirmed = job.equipment_confirmed_by || [];
      const updatedConfirmed = currentConfirmed.includes(userId)
        ? currentConfirmed
        : [...currentConfirmed, userId];

      await fetch(`/api/job-orders/${job.id}/status`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          status: 'in_route',
          equipment_confirmed_by: updatedConfirmed,
        }),
      });

      router.push(`/dashboard/my-jobs/${job.id}/jobsite`);
    } catch (err) {
      console.error('Error starting route:', err);
    } finally {
      setStartingRoute(false);
    }
  };

  const handleContinueJob = () => {
    if (!job) return;
    if (job.status === 'in_route') {
      router.push(`/dashboard/my-jobs/${job.id}/jobsite`);
    } else if (job.status === 'in_progress') {
      router.push(`/dashboard/job-schedule/${job.id}/work-performed`);
    }
  };

  const handleViewCompleted = () => {
    if (!job) return;
    router.push(`/dashboard/job-schedule/${job.id}/work-performed`);
  };

  const handleResumeJob = async () => {
    if (!job) return;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      await fetch(`/api/job-orders/${job.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ status: 'in_progress' }),
      });

      router.push(`/dashboard/job-schedule/${job.id}/work-performed`);
    } catch (err) {
      console.error('Error resuming job:', err);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !job) return;
    setUploadingDoc(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const path = `${jobId}/documents/${Date.now()}-${file.name}`;
      const { error: uploadError } = await supabase.storage
        .from('job-photos')
        .upload(path, file, { contentType: file.type });

      if (uploadError) {
        console.error('Upload error:', uploadError);
        return;
      }

      const { data: urlData } = supabase.storage.from('job-photos').getPublicUrl(path);
      const fileUrl = urlData?.publicUrl;

      const res = await fetch(`/api/job-orders/${jobId}/documents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({
          file_name: file.name,
          file_url: fileUrl,
          file_size: file.size,
          file_type: file.type,
          category: docCategory,
          notes: docNotes.trim() || null,
          uploaded_by_name: session.user.user_metadata?.full_name || '',
        }),
      });

      if (res.ok) {
        setDocNotes('');
        fetchDocuments();
      }
    } catch (err) {
      console.error('Error uploading document:', err);
    } finally {
      setUploadingDoc(false);
      e.target.value = '';
    }
  };

  const handleDeleteDocument = async (docId: string) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      await fetch(`/api/job-orders/${jobId}/documents/${docId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      setDocuments(prev => prev.filter(d => d.id !== docId));
    } catch (err) {
      console.error('Error deleting document:', err);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-gray-600 text-lg font-medium">Loading job details...</p>
        </div>
      </div>
    );
  }

  if (!job) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 flex items-center justify-center">
        <div className="text-center">
          <Inbox className="w-12 h-12 text-gray-400 mx-auto mb-3" />
          <p className="text-gray-600 text-lg font-medium">Job not found</p>
          <Link href="/dashboard/my-jobs" className="mt-3 inline-block text-blue-600 hover:underline font-semibold">
            Back to My Schedule
          </Link>
        </div>
      </div>
    );
  }

  const arrivalDisplay = formatTime(job.arrival_time);
  const shopArrival = formatTime(job.shop_arrival_time);
  const isMultiDay = job.end_date && job.end_date !== job.scheduled_date;

  // Jobsite conditions + site compliance (same as jobsite page)
  const conditions: Record<string, any> = job.jobsite_conditions || {};
  const compliance: Record<string, any> = job.site_compliance || {};
  const filledConditions = Object.entries(conditions).filter(([, value]) => {
    if (value === null || value === undefined || value === '' || value === false) return false;
    return true;
  });
  const filledCompliance = Object.entries(compliance).filter(([key, value]) => {
    if (key === 'attachment_urls') return false;
    if (value === null || value === undefined || value === '' || value === false) return false;
    return true;
  });
  const hasConditions = filledConditions.length > 0;
  const hasCompliance = filledCompliance.length > 0;
  const hasAdditionalNotes = !!(job.additional_info || job.special_equipment_notes || job.directions);

  const conditionLabels: Record<string, string> = {
    water_available: 'Water Available', water_available_ft: 'Water Dist.',
    electricity_available: 'Power Available', electricity_available_ft: 'Power Dist.',
    cord_480: '480 Cord Req\'d', cord_480_ft: '480 Cord Dist.',
    hyd_hose: 'Hyd Hose', hyd_hose_ft: 'Hyd Hose Dist.',
    water_control: 'Vac Water', plastic_needed: 'Hang Poly',
    clean_up_required: 'Cleanup Required', overcutting_allowed: 'Overcutting OK',
    high_work: 'High Work', high_work_ft: 'High Work Height',
    scaffolding_provided: 'Scaffold/Lift', manpower_provided: 'Manpower Prov\'d',
    proper_ventilation: 'Proper Ventilation', inside_outside: 'Work Area',
    surface_type: 'Surface Type', thickness: 'Thickness',
    reinforcement: 'Reinforcement', access_notes: 'Access Notes',
  };

  const categoryLabels: Record<string, string> = {
    site_photo: 'Site Photo', before_after: 'Before/After',
    permit: 'Permit', customer_doc: 'Customer Doc',
    scope: 'Scope', other: 'Other',
  };

  const renderDocCard = (doc: any, canDelete: boolean = false) => {
    const isImage = doc.file_type?.startsWith('image/');
    return (
      <div key={doc.id} className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        {/* Clickable preview area */}
        <a
          href={doc.file_url}
          target="_blank"
          rel="noopener noreferrer"
          className="block p-4 hover:bg-gray-50 transition-colors"
        >
          <div className="flex items-start gap-4">
            <div className={`w-14 h-14 rounded-xl flex items-center justify-center flex-shrink-0 ${
              isImage ? 'bg-indigo-100' : 'bg-gray-100'
            }`}>
              {isImage ? <Image className="w-7 h-7 text-indigo-500" /> : <File className="w-7 h-7 text-gray-400" />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-base font-bold text-gray-900 truncate">{doc.file_name}</p>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <span className="text-xs font-semibold text-white bg-indigo-500 px-2 py-0.5 rounded-full">
                  {categoryLabels[doc.category] || doc.category}
                </span>
                {doc.uploaded_by_name && (
                  <span className="text-xs text-gray-500">by {doc.uploaded_by_name}</span>
                )}
              </div>
              {doc.notes && (
                <p className="text-sm text-gray-600 mt-1">{doc.notes}</p>
              )}
            </div>
            <Eye className="w-5 h-5 text-blue-500 flex-shrink-0 mt-1" />
          </div>
        </a>
        {canDelete && (
          <div className="border-t border-gray-100 px-4 py-2">
            <button
              onClick={() => handleDeleteDocument(doc.id)}
              className="text-xs text-red-500 hover:text-red-700 font-semibold flex items-center gap-1"
            >
              <Trash2 className="w-3.5 h-3.5" /> Remove
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
      {/* Professional Header */}
      <div className="bg-gradient-to-r from-slate-900 via-blue-900 to-indigo-900 text-white sticky top-0 z-10 shadow-2xl">
        <div className="container mx-auto px-4 py-4 max-w-lg">
          <div className="flex items-center gap-3">
            <Link
              href="/dashboard/my-jobs"
              className="p-2 bg-white/10 backdrop-blur-sm rounded-xl border border-white/20 hover:bg-white/20 transition-all"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div className="w-10 h-10 bg-gradient-to-br from-blue-400 to-indigo-500 rounded-xl flex items-center justify-center shadow-lg">
              <Briefcase className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-lg font-bold truncate">Job #{job.job_number}</h1>
              <p className="text-blue-200 text-xs truncate">{job.customer_name}</p>
            </div>
            {jobIsHelper && (
              <span className="text-xs px-2.5 py-1 bg-emerald-500/30 border border-emerald-400/30 text-emerald-200 rounded-lg font-semibold flex-shrink-0">
                Team Member
              </span>
            )}
            <button
              onClick={async () => {
                try {
                  const { data: { session } } = await supabase.auth.getSession();
                  if (!session) return;
                  const url = `/api/job-orders/${jobId}/dispatch-pdf`;
                  const res = await fetch(url, {
                    headers: { Authorization: `Bearer ${session.access_token}` },
                  });
                  if (res.ok) {
                    const blob = await res.blob();
                    const pdfUrl = URL.createObjectURL(blob);
                    window.open(pdfUrl, '_blank');
                  }
                } catch (err) {
                  console.error('Error generating PDF:', err);
                }
              }}
              className="p-2 bg-white/10 backdrop-blur-sm rounded-xl border border-white/20 hover:bg-white/20 transition-all flex-shrink-0"
              title="Print Dispatch Ticket"
            >
              <Printer className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-5 max-w-lg space-y-4">

        {/* ── IN-ROUTE SIMPLIFIED VIEW ───────────────────────── */}
        {job.status === 'in_route' && (
          <>
            {/* Location */}
            {(job.address || job.location) && (
              <div className="bg-white/90 backdrop-blur-lg rounded-2xl shadow-xl border border-gray-200/50 p-5">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 bg-red-100 rounded-xl flex items-center justify-center flex-shrink-0">
                    <MapPin className="w-6 h-6 text-red-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-base font-bold text-gray-800 mb-1">Job Location</h3>
                    <p className="text-base text-gray-700 font-medium">{job.address || job.location}</p>
                  </div>
                </div>
                {job.address && (
                  <a
                    href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(job.address)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-3 w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white rounded-xl text-base font-bold hover:bg-blue-700 transition-colors shadow"
                  >
                    <MapPin className="w-5 h-5" /> Open in Maps
                  </a>
                )}
              </div>
            )}

            {/* Site Contact */}
            {(job.foreman_name || job.customer_contact || job.site_contact_phone || job.foreman_phone) && (
              <div className="bg-white/90 backdrop-blur-lg rounded-2xl shadow-xl border border-green-200/60 p-5">
                <div className="flex items-center gap-2 mb-3">
                  <Phone className="w-5 h-5 text-green-600" />
                  <h3 className="text-base font-bold text-gray-800">Site Contact</h3>
                </div>
                <div className="space-y-3">
                  {(job.foreman_name || job.customer_contact) && (
                    <div className="flex items-center justify-between p-4 bg-green-50 rounded-xl border border-green-100">
                      <div>
                        <p className="text-xs text-gray-500 font-semibold uppercase tracking-wider">Contact</p>
                        <p className="text-lg font-bold text-gray-900">{job.foreman_name || job.customer_contact}</p>
                      </div>
                      {(job.foreman_phone || job.site_contact_phone) && (
                        <a href={`tel:${job.foreman_phone || job.site_contact_phone}`}
                          className="flex items-center gap-2 px-5 py-3 bg-green-500 text-white rounded-xl text-sm font-bold hover:bg-green-600 transition-colors shadow-md">
                          <Phone className="w-4 h-4" /> Call
                        </a>
                      )}
                    </div>
                  )}
                  {!(job.foreman_name || job.customer_contact) && (job.site_contact_phone || job.foreman_phone) && (
                    <div className="flex items-center justify-between p-4 bg-green-50 rounded-xl border border-green-100">
                      <div>
                        <p className="text-xs text-gray-500 font-semibold uppercase tracking-wider">Site Phone</p>
                        <p className="text-lg font-bold text-gray-900">{job.site_contact_phone || job.foreman_phone}</p>
                      </div>
                      <a href={`tel:${job.site_contact_phone || job.foreman_phone}`}
                        className="flex items-center gap-2 px-5 py-3 bg-green-500 text-white rounded-xl text-sm font-bold hover:bg-green-600 transition-colors shadow-md">
                        <Phone className="w-4 h-4" /> Call
                      </a>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Arrived CTA */}
            <div className="pt-2 pb-6">
              <button
                onClick={() => router.push(`/dashboard/my-jobs/${job.id}/jobsite`)}
                className="w-full py-5 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white rounded-2xl font-bold text-lg transition-all shadow-lg flex items-center justify-center gap-3"
              >
                <CheckCircle2 className="w-6 h-6" /> Arrived — Start In Progress
              </button>
            </div>
          </>
        )}

        {/* ── FULL JOB VIEW (not in_route) ─────────────────────── */}
        {job.status !== 'in_route' && <>

        {/* Equipment already confirmed banner */}
        {equipmentAlreadyConfirmed && (
          <div className="bg-gradient-to-r from-purple-500 to-indigo-500 text-white px-4 py-3 rounded-xl text-base font-semibold flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5" />
            Equipment confirmed — checklist not required
          </div>
        )}

        {/* Special Arrival Time */}
        {(arrivalDisplay || shopArrival) && !isCompleted && (
          <div className="bg-gradient-to-r from-red-500 via-red-500 to-orange-500 text-white px-5 py-4 rounded-2xl flex items-center gap-4 shadow-lg">
            <Clock className="w-6 h-6 flex-shrink-0" />
            <div className="text-base font-bold">
              {shopArrival && <span>Shop: {shopArrival}</span>}
              {shopArrival && arrivalDisplay && <span className="mx-2">&bull;</span>}
              {arrivalDisplay && <span>Arrive: {arrivalDisplay}</span>}
            </div>
          </div>
        )}

        {/* Status & Priority Badges */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-sm px-3 py-1.5 rounded-full border font-bold ${getStatusStyle(job.status)}`}>
            {job.readable_status}
          </span>
          {isMultiDay && (
            <span className="text-sm px-3 py-1.5 bg-purple-100 text-purple-700 rounded-full font-bold border border-purple-200">
              Multi-Day
            </span>
          )}
          {jobIsHelper && (
            <span className="text-sm px-3 py-1.5 bg-emerald-100 text-emerald-700 rounded-full font-bold border border-emerald-200">
              Team Member
            </span>
          )}
          {job.priority === 'urgent' && (
            <span className="text-sm px-3 py-1.5 bg-red-500 text-white rounded-full font-bold">URGENT</span>
          )}
          {job.priority === 'high' && (
            <span className="text-sm px-3 py-1.5 bg-orange-500 text-white rounded-full font-bold">HIGH</span>
          )}
        </div>

        {/* Scope Updated Banner — recent approved change orders */}
        {recentChangeOrders.length > 0 && (
          <div className="bg-amber-50 border-2 border-amber-300 rounded-2xl p-5 shadow-sm">
            <div className="flex items-start gap-3 mb-3">
              <AlertTriangle className="w-6 h-6 text-amber-600 mt-0.5 flex-shrink-0" />
              <div className="flex-1">
                <p className="text-base font-bold text-amber-800">Scope has been updated on this job</p>
                <p className="text-sm text-amber-700 mt-0.5">Review with your supervisor before proceeding</p>
              </div>
            </div>
            <div className="space-y-2 pl-9">
              {recentChangeOrders.map(co => (
                <div key={co.id} className="bg-amber-100/70 rounded-xl px-3 py-2 border border-amber-200">
                  <span className="text-xs font-bold text-amber-700 mr-2">v{co.version}</span>
                  <span className="text-sm text-amber-900">{co.scope_description}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* On-Hold Banner */}
        {isOnHold && (
          <div className="bg-purple-50 border-2 border-purple-300 rounded-2xl p-5 shadow-sm">
            <div className="flex items-start gap-3">
              <PauseCircle className="w-6 h-6 text-purple-600 mt-0.5 flex-shrink-0" />
              <div className="flex-1">
                <p className="text-base font-bold text-purple-800">Job On Hold</p>
                {job.pause_reason && (
                  <p className="text-sm text-purple-600 mt-1">{job.pause_reason}</p>
                )}
                {job.return_date && (
                  <p className="text-sm text-purple-500 mt-1">Expected return: {job.return_date}</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Job Location Card */}
        {(job.address || job.location) && (
          locationUnlocked ? (
            <div className="bg-white/90 backdrop-blur-lg rounded-2xl shadow-xl border border-gray-200/50 p-5">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 bg-red-100 rounded-xl flex items-center justify-center flex-shrink-0">
                  <MapPin className="w-6 h-6 text-red-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-base font-bold text-gray-800 mb-1">Location</h3>
                  <p className="text-base text-gray-700 font-medium">{job.address || job.location}</p>
                </div>
              </div>
              {job.address && (
                <a
                  href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(job.address)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-50 text-blue-700 rounded-xl text-sm font-bold hover:bg-blue-100 transition-colors border border-blue-200"
                >
                  <MapPin className="w-4 h-4" /> Open in Maps
                </a>
              )}
            </div>
          ) : (
            <div className="bg-gray-100 dark:bg-white/5 rounded-xl p-4 flex items-center gap-3 text-gray-400">
              <Lock className="w-5 h-5 flex-shrink-0" />
              <p className="text-sm">Complete equipment checklist and start your route to view location & site contact</p>
            </div>
          )
        )}

        {/* Site Contact Card — only show once location is unlocked */}
        {locationUnlocked && (job.foreman_name || job.customer_contact || job.site_contact_phone || job.foreman_phone) && (
          <div className="bg-white/90 backdrop-blur-lg rounded-2xl shadow-xl border border-green-200/60 overflow-hidden">
            <button
              onClick={() => setContactOpen(!contactOpen)}
              className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-center gap-2">
                <Phone className="w-5 h-5 text-green-600" />
                <span className="text-base font-bold text-gray-800">Site Contact</span>
              </div>
              <ChevronDown className={`w-5 h-5 text-gray-400 transition-transform ${contactOpen ? 'rotate-180' : ''}`} />
            </button>
            {contactOpen && <div className="px-5 pb-5 space-y-3">
            <div className="space-y-3">
              {/* Primary contact name row */}
              {(job.foreman_name || job.customer_contact) && (
                <div className="flex items-center justify-between p-4 bg-green-50 rounded-xl border border-green-100">
                  <div>
                    <p className="text-xs text-gray-500 font-semibold uppercase tracking-wider">Contact</p>
                    <p className="text-lg font-bold text-gray-900">{job.foreman_name || job.customer_contact}</p>
                  </div>
                  {(job.foreman_phone || job.site_contact_phone) && (
                    <a
                      href={`tel:${job.foreman_phone || job.site_contact_phone}`}
                      className="flex items-center gap-2 px-5 py-3 bg-green-500 text-white rounded-xl text-sm font-bold hover:bg-green-600 transition-colors shadow-md"
                    >
                      <Phone className="w-4 h-4" /> Call
                    </a>
                  )}
                </div>
              )}
              {/* Secondary contact if both foreman_name and customer_contact are set and different */}
              {job.foreman_name && job.customer_contact && job.customer_contact !== job.foreman_name && (
                <div className="p-4 bg-gray-50 rounded-xl border border-gray-200">
                  <p className="text-xs text-gray-500 font-semibold uppercase tracking-wider">Also</p>
                  <p className="text-base font-bold text-gray-900">{job.customer_contact}</p>
                </div>
              )}
              {/* Phone-only row when no name is set */}
              {!(job.foreman_name || job.customer_contact) && (job.site_contact_phone || job.foreman_phone) && (
                <div className="flex items-center justify-between p-4 bg-green-50 rounded-xl border border-green-100">
                  <div>
                    <p className="text-xs text-gray-500 font-semibold uppercase tracking-wider">Site Phone</p>
                    <p className="text-lg font-bold text-gray-900">{job.site_contact_phone || job.foreman_phone}</p>
                  </div>
                  <a
                    href={`tel:${job.site_contact_phone || job.foreman_phone}`}
                    className="flex items-center gap-2 px-5 py-3 bg-green-500 text-white rounded-xl text-sm font-bold hover:bg-green-600 transition-colors shadow-md"
                  >
                    <Phone className="w-4 h-4" /> Call
                  </a>
                </div>
              )}
              {/* Separate site phone row if name IS set and a different site phone also exists */}
              {(job.foreman_name || job.customer_contact) && job.site_contact_phone && job.site_contact_phone !== job.foreman_phone && (
                <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl border border-gray-200">
                  <div>
                    <p className="text-xs text-gray-500 font-semibold uppercase tracking-wider">Site Phone</p>
                    <p className="text-lg font-bold text-gray-900">{job.site_contact_phone}</p>
                  </div>
                  <a
                    href={`tel:${job.site_contact_phone}`}
                    className="flex items-center gap-2 px-5 py-3 bg-green-500 text-white rounded-xl text-sm font-bold hover:bg-green-600 transition-colors shadow-md"
                  >
                    <Phone className="w-4 h-4" /> Call
                  </a>
                </div>
              )}
            </div>
            </div>}
          </div>
        )}

        {/* Crew Info - collapsible */}
        <div className="bg-white/90 backdrop-blur-lg rounded-2xl shadow-xl border border-gray-200/50 overflow-hidden">
          <button
            onClick={() => setCrewOpen(!crewOpen)}
            className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors"
          >
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5 text-blue-600" />
              <span className="text-base font-bold text-gray-800">Crew</span>
            </div>
            <ChevronDown className={`w-5 h-5 text-gray-400 transition-transform ${crewOpen ? 'rotate-180' : ''}`} />
          </button>
          {crewOpen && <div className="px-5 pb-5">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex items-center gap-3 p-3 bg-blue-50 rounded-xl border border-blue-100">
              <div className="w-11 h-11 bg-blue-500 text-white rounded-full flex items-center justify-center text-base font-bold flex-shrink-0">
                {(job.operator_name || 'O')[0].toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="text-xs text-blue-600 font-semibold uppercase tracking-wider">Operator</p>
                <p className="text-base font-bold text-gray-900 truncate">{job.operator_name || 'Unassigned'}</p>
              </div>
            </div>
            {job.helper_name && (
              <div className="flex items-center gap-3 p-3 bg-emerald-50 rounded-xl border border-emerald-100">
                <div className="w-11 h-11 bg-emerald-500 text-white rounded-full flex items-center justify-center text-base font-bold flex-shrink-0">
                  {job.helper_name[0].toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-emerald-600 font-semibold uppercase tracking-wider">Team Member</p>
                  <p className="text-base font-bold text-gray-900 truncate">{job.helper_name}</p>
                </div>
              </div>
            )}
          </div>
          </div>}
        </div>

        {/* Work Details Panel - Bigger text */}
        <div className="bg-white/90 backdrop-blur-lg rounded-2xl shadow-xl border border-gray-200/50 overflow-hidden">
          <button
            onClick={() => setWorkDetailsOpen(!workDetailsOpen)}
            className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors"
          >
            <div className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-blue-600" />
              <span className="text-base font-bold text-gray-800">Work Details</span>
            </div>
            <ChevronDown className={`w-5 h-5 text-gray-400 transition-transform ${workDetailsOpen ? 'rotate-180' : ''}`} />
          </button>
          {workDetailsOpen && (
            <div className="px-5 pb-5 space-y-4">
              <div className="flex items-center gap-3 flex-wrap">
                <span className="px-4 py-1.5 bg-purple-100 text-purple-700 rounded-lg text-base font-bold">
                  {job.job_type}
                </span>
                {job.estimated_hours && (
                  <span className="text-base text-gray-500">Est. {job.estimated_hours} hrs</span>
                )}
                {job.po_number && (
                  <span className="text-sm text-gray-500 bg-gray-100 px-2 py-1 rounded-lg">PO: {job.po_number}</span>
                )}
              </div>
              <div className="p-4 bg-gray-50 border border-gray-200 rounded-xl">
                <p className="text-base text-gray-800 whitespace-pre-wrap leading-relaxed">
                  {job.description || 'No description provided'}
                </p>
              </div>
              {/* Scope Details (quantities) */}
              {job.scope_details && Object.keys(job.scope_details).length > 0 && (
                <div>
                  <p className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-2">Scope Quantities</p>
                  <ScopeDetailsDisplay scopeDetails={job.scope_details} />
                </div>
              )}
              {/* Scope Reference Photos */}
              {job.scope_photo_urls && job.scope_photo_urls.length > 0 && (
                <PhotoViewer photos={job.scope_photo_urls} label="Scope Reference Photos" />
              )}
              {/* Site Compliance Attachments */}
              {job.site_compliance?.attachment_urls && job.site_compliance.attachment_urls.length > 0 && (
                <PhotoViewer photos={job.site_compliance.attachment_urls} label="Compliance Documents" />
              )}
              {(job.salesman_name || job.created_by_name) && (
                <div className="flex items-center gap-2 text-base text-gray-600">
                  <User className="w-4 h-4" />
                  <span>Submitted by: <strong>{job.salesman_name || job.created_by_name}</strong></span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Jobsite Conditions — collapsible */}
        {hasConditions && (
          <div className="bg-white/90 backdrop-blur-lg rounded-2xl shadow-xl border border-amber-200/60 overflow-hidden">
            <button
              onClick={() => setConditionsOpen(!conditionsOpen)}
              className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-600" />
                <span className="text-base font-bold text-gray-800">Jobsite Conditions</span>
                <span className="text-xs px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full font-bold">{filledConditions.length}</span>
              </div>
              <ChevronDown className={`w-5 h-5 text-gray-400 transition-transform ${conditionsOpen ? 'rotate-180' : ''}`} />
            </button>
            {conditionsOpen && (
              <div className="px-5 pb-5">
                <div className="grid grid-cols-2 gap-2">
                  {filledConditions.map(([key, value]) => {
                    const displayValue = typeof value === 'boolean' ? 'Yes' : String(value);
                    const label = conditionLabels[key] || key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
                    const isWarning = key === 'cord_480' || key === 'high_work';
                    return (
                      <div key={key} className={`flex items-center justify-between px-3 py-2.5 rounded-xl border text-sm ${isWarning ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-100'}`}>
                        <span className={`font-semibold ${isWarning ? 'text-red-700' : 'text-gray-700'}`}>{label}</span>
                        <span className={`font-bold ml-2 ${isWarning ? 'text-red-900' : 'text-gray-900'}`}>{displayValue}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Site Compliance — collapsible */}
        {hasCompliance && (
          <div className="bg-white/90 backdrop-blur-lg rounded-2xl shadow-xl border border-indigo-200/60 overflow-hidden">
            <button
              onClick={() => setComplianceOpen(!complianceOpen)}
              className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-center gap-2">
                <Shield className="w-5 h-5 text-indigo-600" />
                <span className="text-base font-bold text-gray-800">Site Compliance</span>
                <span className="text-xs px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded-full font-bold">Required</span>
              </div>
              <ChevronDown className={`w-5 h-5 text-gray-400 transition-transform ${complianceOpen ? 'rotate-180' : ''}`} />
            </button>
            {complianceOpen && (
              <div className="px-5 pb-5 space-y-2">
                {filledCompliance.map(([key, value]) => {
                  const label = key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
                  const displayValue = typeof value === 'boolean' ? (value ? 'Required' : 'Not Required') : String(value);
                  return (
                    <div key={key} className="flex items-center justify-between p-3 bg-indigo-50 rounded-xl border border-indigo-100">
                      <span className="text-sm font-semibold text-indigo-800">{label}</span>
                      <span className="text-sm font-bold text-indigo-900 ml-2">{displayValue}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Additional Notes & Directions — collapsible */}
        {hasAdditionalNotes && (
          <div className="bg-white/90 backdrop-blur-lg rounded-2xl shadow-xl border border-purple-200/60 overflow-hidden">
            <button
              onClick={() => setNotesOpen(!notesOpen)}
              className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-purple-600" />
                <span className="text-base font-bold text-gray-800">Additional Notes</span>
              </div>
              <ChevronDown className={`w-5 h-5 text-gray-400 transition-transform ${notesOpen ? 'rotate-180' : ''}`} />
            </button>
            {notesOpen && (
              <div className="px-5 pb-5 space-y-3">
                {job.additional_info && (
                  <div className="p-4 bg-purple-50 rounded-xl border border-purple-100">
                    <p className="text-xs text-purple-600 font-semibold uppercase mb-1">Notes</p>
                    <p className="text-base text-gray-800 whitespace-pre-wrap leading-relaxed">{job.additional_info}</p>
                  </div>
                )}
                {job.directions && (
                  <div className="p-4 bg-blue-50 rounded-xl border border-blue-100">
                    <p className="text-xs text-blue-600 font-semibold uppercase mb-1">Directions</p>
                    <p className="text-base text-gray-800 whitespace-pre-wrap leading-relaxed">{job.directions}</p>
                  </div>
                )}
                {job.special_equipment_notes && (
                  <div className="p-4 bg-purple-50 rounded-xl border border-purple-100">
                    <p className="text-xs text-purple-600 font-semibold uppercase mb-1">Special Equipment Notes</p>
                    <p className="text-base text-gray-800 whitespace-pre-wrap leading-relaxed">{job.special_equipment_notes}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Equipment Confirmation Panel */}
        {unifiedItems.length > 0 && (
          <div className="bg-white/90 backdrop-blur-lg rounded-2xl shadow-xl border border-gray-200/50 overflow-hidden">
            <button
              onClick={() => setEquipmentOpen(!equipmentOpen)}
              className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-center gap-2">
                <Wrench className="w-5 h-5 text-green-600" />
                <span className="text-base font-bold text-gray-800">Equipment Confirmation</span>
                {!equipmentAlreadyConfirmed && !isCompleted && (
                  <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                    canStartRoute ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                  }`}>
                    {canStartRoute ? 'Ready' : 'Confirm All'}
                  </span>
                )}
              </div>
              <ChevronDown className={`w-5 h-5 text-gray-400 transition-transform ${equipmentOpen ? 'rotate-180' : ''}`} />
            </button>
            {equipmentOpen && (
              <div className="px-5 pb-5">
                <UnifiedEquipmentPanel
                  equipmentSelections={job.equipment_selections}
                  equipmentNeeded={allEquipment}
                  mandatoryEquipment={mandatoryItems}
                  specialEquipment={job.special_equipment}
                  checkedItems={checkedItems}
                  onToggle={toggleEquipment}
                  disabled={isCompleted || equipmentAlreadyConfirmed}
                />
              </div>
            )}
          </div>
        )}

        {/* Team Member Work Log (for helpers/team members only) */}
        {jobIsHelper && !isCompleted && (
          <HelperWorkLog
            jobId={job.id}
            jobNumber={job.job_number}
            customerName={job.customer_name}
            jobTitle={job.title}
            job={job}
          />
        )}

        {/* Completed job: show helper description as collapsible */}
        {jobIsHelper && isCompleted && (
          <div className="bg-white/90 backdrop-blur-lg rounded-2xl shadow-xl border border-green-200 p-4">
            <HelperWorkLog
              jobId={job.id}
              jobNumber={job.job_number}
              customerName={job.customer_name}
              jobTitle={job.title}
              job={job}
            />
          </div>
        )}

        {/* Admin Documents & Photos - Prominent section */}
        {adminDocs.length > 0 && (
          <div className="bg-gradient-to-br from-indigo-50 to-blue-50 rounded-2xl shadow-xl border-2 border-indigo-200 p-5">
            <div className="flex items-center gap-2 mb-4">
              <Paperclip className="w-5 h-5 text-indigo-600" />
              <h3 className="text-base font-bold text-indigo-900">Job Documents & Photos</h3>
              <span className="text-xs px-2 py-0.5 bg-indigo-500 text-white rounded-full font-bold">
                {adminDocs.length}
              </span>
            </div>
            <div className="space-y-3">
              {adminDocs.map(doc => renderDocCard(doc, false))}
            </div>
          </div>
        )}

        {/* Action Buttons */}
        {!isCompleted && !isOnHold && !jobIsHelper && (
          <div className="pt-2">
            {isInProgress ? (
              <button
                onClick={handleContinueJob}
                className="w-full py-5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-2xl font-bold text-base transition-all shadow-lg flex items-center justify-center gap-3"
              >
                <PlayCircle className="w-6 h-6" />
                {job.status === 'in_route' ? 'Continue to Jobsite' : 'Continue Work'}
              </button>
            ) : (
              <button
                onClick={handleStartRoute}
                disabled={!canStartRoute || startingRoute}
                className={`w-full py-5 rounded-2xl font-bold text-base transition-all shadow-lg flex items-center justify-center gap-3 ${
                  canStartRoute
                    ? 'bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white'
                    : 'bg-gray-200 text-gray-500 cursor-not-allowed'
                }`}
              >
                {startingRoute ? (
                  <><Loader2 className="w-6 h-6 animate-spin" /> Starting...</>
                ) : canStartRoute ? (
                  <><PlayCircle className="w-6 h-6" /> Start In Route</>
                ) : (
                  <><Wrench className="w-6 h-6" /> Complete Required Equipment First</>
                )}
              </button>
            )}
          </div>
        )}

        {/* Resume On-Hold Job */}
        {isOnHold && !jobIsHelper && (
          <div className="pt-2">
            <button
              onClick={handleResumeJob}
              className="w-full py-5 bg-gradient-to-r from-purple-600 to-violet-600 hover:from-purple-700 hover:to-violet-700 text-white rounded-2xl font-bold text-base transition-all shadow-lg flex items-center justify-center gap-3"
            >
              <PlayCircle className="w-6 h-6" />
              Resume This Job
            </button>
          </div>
        )}

        {/* View completed job details */}
        {isCompleted && (
          <div className="pt-2">
            <button
              onClick={handleViewCompleted}
              className="w-full py-4 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-2xl font-semibold text-base transition-all flex items-center justify-center gap-2"
            >
              <FileText className="w-5 h-5" /> View Work Performed
            </button>
          </div>
        )}

        </> /* end full job view */}

      </div>
    </div>
  );
}
