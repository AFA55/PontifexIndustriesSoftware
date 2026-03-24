'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, Briefcase, Loader2, Clock, Wrench, FileText,
  ChevronDown, User, Users, Inbox, PlayCircle, Star, CheckCircle2, Printer
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

  const isHelper = userRole === 'apprentice';

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

      const res = await fetch(
        `/api/job-orders?include_helper_jobs=true&includeCompleted=true`,
        { headers: { Authorization: `Bearer ${session.access_token}` } }
      );

      if (res.ok) {
        const json = await res.json();
        if (json.success) {
          if (json.user_role) setUserRole(json.user_role);
          const found = (json.data || []).find((j: any) => j.id === jobId);
          if (found) {
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

  useEffect(() => {
    fetchJob();
  }, [fetchJob]);

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

  // Per-operator equipment confirmation check
  // Skip checklist if this operator has already confirmed equipment for this job
  const hasOperatorConfirmedEquipment = (): boolean => {
    if (!job || !userId) return false;
    const confirmedBy = job.equipment_confirmed_by || [];
    return confirmedBy.includes(userId);
  };

  const equipmentAlreadyConfirmed = job ? hasOperatorConfirmedEquipment() : false;

  // New-style jobs (schedule form): ALL items must be confirmed
  // Old-style jobs (quick add): only mandatory items gate the button
  const canStartRoute = equipmentAlreadyConfirmed ||
    (hasEquipmentSelections
      ? checkAllConfirmed(unifiedItems, checkedItems)
      : mandatoryComplete);
  const isCompleted = job?.status === 'completed';
  const isInProgress = job ? ['in_route', 'in_progress'].includes(job.status) : false;
  const jobIsHelper = job?.isHelper || isHelper;

  const handleStartRoute = async () => {
    if (!canStartRoute || !job) return;
    setStartingRoute(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      // Build the updated equipment_confirmed_by array
      // Append current userId if not already present
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

      // Navigate to jobsite page
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
      {/* Professional Header */}
      <div className="bg-gradient-to-r from-slate-900 via-blue-900 to-indigo-900 text-white sticky top-0 z-50 shadow-2xl">
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
            {/* Print Dispatch Ticket */}
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

        {/* Equipment already confirmed banner */}
        {equipmentAlreadyConfirmed && (
          <div className="bg-gradient-to-r from-purple-500 to-indigo-500 text-white px-4 py-2.5 rounded-xl text-sm font-semibold flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4" />
            Equipment already confirmed — checklist not required
          </div>
        )}

        {/* Special Arrival Time */}
        {(arrivalDisplay || shopArrival) && !isCompleted && (
          <div className="bg-gradient-to-r from-red-500 via-red-500 to-orange-500 text-white px-4 py-3 rounded-2xl flex items-center gap-3 shadow-lg">
            <Clock className="w-5 h-5 flex-shrink-0" />
            <div className="text-sm font-bold">
              {shopArrival && <span>Shop: {shopArrival}</span>}
              {shopArrival && arrivalDisplay && <span className="mx-1.5">&bull;</span>}
              {arrivalDisplay && <span>Arrive: {arrivalDisplay}</span>}
            </div>
          </div>
        )}

        {/* Status Badges */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-xs px-2.5 py-1 rounded-full border font-semibold ${getStatusStyle(job.status)}`}>
            {job.readable_status}
          </span>
          {isMultiDay && (
            <span className="text-xs px-2.5 py-1 bg-purple-100 text-purple-700 rounded-full font-semibold border border-purple-200">
              Multi-Day
            </span>
          )}
          {jobIsHelper && (
            <span className="text-xs px-2.5 py-1 bg-emerald-100 text-emerald-700 rounded-full font-semibold border border-emerald-200">
              Team Member
            </span>
          )}
          {job.priority === 'urgent' && (
            <span className="text-xs px-2.5 py-1 bg-red-500 text-white rounded-full font-bold">URGENT</span>
          )}
          {job.priority === 'high' && (
            <span className="text-xs px-2.5 py-1 bg-orange-500 text-white rounded-full font-bold">HIGH</span>
          )}
        </div>

        {/* Crew Info */}
        <div className="bg-white/90 backdrop-blur-lg rounded-2xl shadow-xl border border-gray-200/50 p-4">
          <div className="flex items-center gap-2 mb-3">
            <Users className="w-4 h-4 text-blue-600" />
            <h3 className="text-sm font-bold text-gray-800">Crew</h3>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex items-center gap-2 p-2.5 bg-blue-50 rounded-xl border border-blue-100">
              <div className="w-8 h-8 bg-blue-500 text-white rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0">
                {(job.operator_name || 'O')[0].toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="text-[10px] text-blue-600 font-semibold uppercase tracking-wider">Operator</p>
                <p className="text-sm font-bold text-gray-900 truncate">{job.operator_name || 'Unassigned'}</p>
              </div>
            </div>
            {job.helper_name && (
              <div className="flex items-center gap-2 p-2.5 bg-emerald-50 rounded-xl border border-emerald-100">
                <div className="w-8 h-8 bg-emerald-500 text-white rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0">
                  {job.helper_name[0].toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] text-emerald-600 font-semibold uppercase tracking-wider">Team Member</p>
                  <p className="text-sm font-bold text-gray-900 truncate">{job.helper_name}</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Work Details Panel */}
        <div className="bg-white/90 backdrop-blur-lg rounded-2xl shadow-xl border border-gray-200/50 overflow-hidden">
          <button
            onClick={() => setWorkDetailsOpen(!workDetailsOpen)}
            className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors"
          >
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-blue-600" />
              <span className="text-sm font-bold text-gray-800">Work Details</span>
            </div>
            <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${workDetailsOpen ? 'rotate-180' : ''}`} />
          </button>
          {workDetailsOpen && (
            <div className="px-4 pb-4 space-y-3">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="px-3 py-1 bg-purple-100 text-purple-700 rounded-lg text-sm font-bold">
                  {job.job_type}
                </span>
                {job.estimated_hours && (
                  <span className="text-sm text-gray-500">Est. {job.estimated_hours} hrs</span>
                )}
                {job.po_number && (
                  <span className="text-xs text-gray-500">PO: {job.po_number}</span>
                )}
              </div>
              <div className="p-3 bg-gray-50 border border-gray-200 rounded-xl">
                <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">
                  {job.description || 'No description provided'}
                </p>
              </div>
              {/* Scope Details (quantities) */}
              {job.scope_details && Object.keys(job.scope_details).length > 0 && (
                <div>
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Scope Quantities</p>
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
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <User className="w-3.5 h-3.5" />
                  <span>Submitted by: <strong>{job.salesman_name || job.created_by_name}</strong></span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Equipment Confirmation Panel */}
        {unifiedItems.length > 0 && (
          <div className="bg-white/90 backdrop-blur-lg rounded-2xl shadow-xl border border-gray-200/50 overflow-hidden">
            <button
              onClick={() => setEquipmentOpen(!equipmentOpen)}
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-center gap-2">
                <Wrench className="w-4 h-4 text-green-600" />
                <span className="text-sm font-bold text-gray-800">Equipment Confirmation</span>
                {!equipmentAlreadyConfirmed && !isCompleted && (
                  <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                    canStartRoute ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                  }`}>
                    {canStartRoute ? 'Ready' : 'Confirm All'}
                  </span>
                )}
              </div>
              <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${equipmentOpen ? 'rotate-180' : ''}`} />
            </button>
            {equipmentOpen && (
              <div className="px-4 pb-4">
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

        {/* Action Buttons */}
        {!isCompleted && !jobIsHelper && (
          <div className="pt-2">
            {isInProgress ? (
              <button
                onClick={handleContinueJob}
                className="w-full py-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-2xl font-bold text-sm transition-all shadow-lg flex items-center justify-center gap-2"
              >
                <PlayCircle className="w-5 h-5" />
                {job.status === 'in_route' ? 'Continue to Jobsite' : 'Continue Work'}
              </button>
            ) : (
              <button
                onClick={handleStartRoute}
                disabled={!canStartRoute || startingRoute}
                className={`w-full py-4 rounded-2xl font-bold text-sm transition-all shadow-lg flex items-center justify-center gap-2 ${
                  canStartRoute
                    ? 'bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white'
                    : 'bg-gray-200 text-gray-500 cursor-not-allowed'
                }`}
              >
                {startingRoute ? (
                  <><Loader2 className="w-5 h-5 animate-spin" /> Starting...</>
                ) : canStartRoute ? (
                  <><PlayCircle className="w-5 h-5" /> Start In Route</>
                ) : (
                  <><Wrench className="w-5 h-5" /> Complete Required Equipment First</>
                )}
              </button>
            )}
          </div>
        )}

        {/* View completed job details */}
        {isCompleted && (
          <div className="pt-2">
            <button
              onClick={handleViewCompleted}
              className="w-full py-3.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-2xl font-semibold text-sm transition-all flex items-center justify-center gap-2"
            >
              <FileText className="w-4 h-4" /> View Work Performed
            </button>
          </div>
        )}

      </div>
    </div>
  );
}
