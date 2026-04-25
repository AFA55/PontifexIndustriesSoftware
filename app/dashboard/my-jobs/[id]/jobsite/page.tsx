'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, Loader2, MapPin, Phone, User, Navigation,
  AlertTriangle, FileText, Shield, Inbox, CheckCircle,
  Paperclip, Image, File, Eye
} from 'lucide-react';
import { supabase } from '@/lib/supabase';

export default function JobsitePage() {
  const router = useRouter();
  const params = useParams();
  const jobId = params.id as string;

  const [job, setJob] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [documents, setDocuments] = useState<any[]>([]);

  const fetchJob = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push('/login');
        return;
      }

      const res = await fetch(
        `/api/job-orders?id=${jobId}&include_helper_jobs=true&includeCompleted=true`,
        { headers: { Authorization: `Bearer ${session.access_token}` } }
      );

      if (res.ok) {
        const json = await res.json();
        if (json.success) {
          const found = (json.data || [])[0];
          if (found && found.id === jobId) {
            setJob(found);
            // If status is still in_route, update to in_progress (arrived at site)
            if (found.status === 'in_route') {
              fetch(`/api/job-orders/${jobId}/status`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${session.access_token}`,
                },
                body: JSON.stringify({ status: 'in_progress' }),
              }).catch(console.error);
            }
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

  useEffect(() => {
    fetchJob();
    fetchDocuments();
  }, [fetchJob, fetchDocuments]);

  const handleArrivedOnJobSite = () => {
    router.push(`/dashboard/job-schedule/${jobId}/work-performed`);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 dark:from-[#0b0618] dark:to-[#0e0720] flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-gray-600 text-lg font-medium">Loading jobsite info...</p>
        </div>
      </div>
    );
  }

  if (!job) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 dark:from-[#0b0618] dark:to-[#0e0720] flex items-center justify-center">
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

  // Parse jobsite conditions and site compliance from JSON fields
  const conditions: any = job.jobsite_conditions || {};
  const compliance: any = job.site_compliance || {};

  // Only show fields that have actual values (not empty/null/false/"")
  const filledConditions = Object.entries(conditions).filter(([, value]) => {
    if (value === null || value === undefined || value === '' || value === false) return false;
    if (typeof value === 'string' && value.trim() === '') return false;
    return true;
  });

  const filledCompliance = Object.entries(compliance).filter(([key, value]) => {
    if (key === 'attachment_urls') return false; // Handle separately
    if (value === null || value === undefined || value === '' || value === false) return false;
    if (typeof value === 'string' && value.trim() === '') return false;
    return true;
  });

  const hasConditions = filledConditions.length > 0;
  const hasCompliance = filledCompliance.length > 0;

  const conditionLabels: Record<string, string> = {
    surface_type: 'Surface Type',
    thickness: 'Thickness',
    reinforcement: 'Reinforcement',
    water_source: 'Water Source',
    power_source: 'Power Source',
    access_notes: 'Access Notes',
  };

  const categoryLabels: Record<string, string> = {
    site_photo: 'Site Photo', before_after: 'Before/After',
    permit: 'Permit', customer_doc: 'Customer Doc',
    scope: 'Scope', other: 'Other',
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 dark:from-[#0b0618] dark:to-[#0e0720]">
      {/* Header */}
      <div className="bg-gradient-to-r from-slate-900 via-blue-900 to-indigo-900 text-white sticky top-0 z-10 shadow-2xl">
        <div className="container mx-auto px-4 py-4 max-w-lg">
          <div className="flex items-center gap-3">
            <Link
              href={`/dashboard/my-jobs/${jobId}`}
              className="p-2 bg-white/10 backdrop-blur-sm rounded-xl border border-white/20 hover:bg-white/20 transition-all"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div className="w-10 h-10 bg-gradient-to-br from-orange-400 to-red-500 rounded-xl flex items-center justify-center shadow-lg">
              <MapPin className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-lg font-bold truncate">Jobsite</h1>
              <p className="text-blue-200 text-xs truncate">#{job.job_number} — {job.customer_name}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-5 max-w-lg space-y-4">

        {/* Jobsite Address */}
        <div className="bg-white/90 dark:bg-white/5 backdrop-blur-lg rounded-2xl shadow-xl border border-gray-200/50 dark:border-white/10 p-5">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 bg-red-100 rounded-xl flex items-center justify-center flex-shrink-0">
              <MapPin className="w-6 h-6 text-red-600" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-base font-bold text-gray-800 dark:text-white mb-1">Jobsite Address</h3>
              <p className="text-base text-gray-700 dark:text-white/80 font-medium">{job.address || job.location || 'No address provided'}</p>
              {job.location && job.address && job.location !== job.address && (
                <p className="text-sm text-gray-500 dark:text-white/60 mt-1">{job.location}</p>
              )}
            </div>
          </div>
          {job.address && (
            <a
              href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(job.address)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-50 text-blue-700 rounded-xl text-base font-bold hover:bg-blue-100 transition-colors border border-blue-200"
            >
              <Navigation className="w-5 h-5" /> Open in Maps
            </a>
          )}
        </div>

        {/* Contact Info */}
        {(job.foreman_name || job.customer_contact || job.site_contact_phone) && (
          <div className="bg-white/90 dark:bg-white/5 backdrop-blur-lg rounded-2xl shadow-xl border border-gray-200/50 dark:border-white/10 p-5">
            <div className="flex items-center gap-2 mb-3">
              <User className="w-5 h-5 text-blue-600" />
              <h3 className="text-base font-bold text-gray-800 dark:text-white">Site Contact</h3>
            </div>
            <div className="space-y-3">
              {job.foreman_name && (
                <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-white/5 rounded-xl">
                  <div>
                    <p className="text-xs text-gray-500 dark:text-white/60 dark:text-white/60 font-semibold uppercase tracking-wider">Foreman / Contact</p>
                    <p className="text-lg font-bold text-gray-900 dark:text-white">{job.foreman_name}</p>
                  </div>
                  {job.foreman_phone && (
                    <a
                      href={`tel:${job.foreman_phone}`}
                      className="flex items-center gap-2 px-5 py-3 bg-green-500 text-white rounded-xl text-sm font-bold hover:bg-green-600 transition-colors shadow-md"
                    >
                      <Phone className="w-4 h-4" /> Call
                    </a>
                  )}
                </div>
              )}
              {job.customer_contact && job.customer_contact !== job.foreman_name && (
                <div className="p-4 bg-gray-50 dark:bg-white/5 rounded-xl">
                  <p className="text-xs text-gray-500 dark:text-white/60 dark:text-white/60 font-semibold uppercase tracking-wider">Customer Contact</p>
                  <p className="text-lg font-bold text-gray-900 dark:text-white">{job.customer_contact}</p>
                </div>
              )}
              {job.site_contact_phone && (
                <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-white/5 rounded-xl">
                  <div>
                    <p className="text-xs text-gray-500 dark:text-white/60 dark:text-white/60 font-semibold uppercase tracking-wider">Site Phone</p>
                    <p className="text-lg font-bold text-gray-900 dark:text-white">{job.site_contact_phone}</p>
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
          </div>
        )}

        {/* Jobsite Conditions - Only shows filled fields */}
        {hasConditions && (
          <div className="bg-white/90 dark:bg-white/5 backdrop-blur-lg rounded-2xl shadow-xl border border-gray-200/50 dark:border-white/10 p-5">
            <div className="flex items-center gap-2 mb-4">
              <AlertTriangle className="w-5 h-5 text-amber-600" />
              <h3 className="text-base font-bold text-gray-800 dark:text-white">Jobsite Conditions</h3>
            </div>
            <div className="space-y-2">
              {filledConditions.map(([key, value]) => {
                const isLongText = key === 'access_notes' || (typeof value === 'string' && value.length > 50);
                const displayValue = typeof value === 'boolean'
                  ? (value ? 'Available' : 'Not Available')
                  : String(value);
                const label = conditionLabels[key] || key.replace(/_/g, ' ');

                if (isLongText) {
                  return (
                    <div key={key} className="p-4 bg-amber-50 rounded-xl border border-amber-100">
                      <p className="text-xs text-gray-600 dark:text-white/60 font-semibold uppercase tracking-wider mb-1">{label}</p>
                      <p className="text-base text-gray-800">{displayValue}</p>
                    </div>
                  );
                }

                return (
                  <div key={key} className="flex items-center justify-between p-3 bg-amber-50 rounded-xl border border-amber-100">
                    <span className="text-sm text-gray-600 dark:text-white/60 font-semibold capitalize">{label}</span>
                    <span className="text-base font-bold text-gray-900 dark:text-white">{displayValue}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Site Compliance - Only shows filled fields */}
        {hasCompliance && (
          <div className="bg-white/90 dark:bg-white/5 backdrop-blur-lg rounded-2xl shadow-xl border border-gray-200/50 dark:border-white/10 p-5">
            <div className="flex items-center gap-2 mb-4">
              <Shield className="w-5 h-5 text-indigo-600" />
              <h3 className="text-base font-bold text-gray-800 dark:text-white">Site Compliance</h3>
            </div>
            <div className="space-y-2">
              {filledCompliance.map(([key, value]) => (
                <div key={key} className="flex items-center justify-between p-3 bg-indigo-50 rounded-xl border border-indigo-100">
                  <span className="text-sm text-gray-600 dark:text-white/60 font-semibold capitalize">{key.replace(/_/g, ' ')}</span>
                  <span className="text-base font-bold text-gray-900 dark:text-white">
                    {typeof value === 'boolean' ? (value ? 'Yes' : 'No') : String(value)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Additional Notes from Schedule Form */}
        {(job.additional_info || job.special_equipment_notes || job.description) && (
          <div className="bg-white/90 dark:bg-white/5 backdrop-blur-lg rounded-2xl shadow-xl border border-gray-200/50 dark:border-white/10 p-5">
            <div className="flex items-center gap-2 mb-4">
              <FileText className="w-5 h-5 text-purple-600" />
              <h3 className="text-base font-bold text-gray-800 dark:text-white">Additional Notes</h3>
            </div>
            <div className="space-y-3">
              {job.description && (
                <div className="p-4 bg-gray-50 dark:bg-white/5 rounded-xl border border-gray-200">
                  <p className="text-xs text-gray-500 dark:text-white/60 font-semibold mb-1">Job Description</p>
                  <p className="text-base text-gray-800 dark:text-white/80 whitespace-pre-wrap">{job.description}</p>
                </div>
              )}
              {job.additional_info && (
                <div className="p-4 bg-purple-50 rounded-xl border border-purple-100">
                  <p className="text-xs text-purple-600 font-semibold mb-1">Additional Info</p>
                  <p className="text-base text-gray-800 dark:text-white/80 whitespace-pre-wrap">{job.additional_info}</p>
                </div>
              )}
              {job.special_equipment_notes && (
                <div className="p-4 bg-purple-50 rounded-xl border border-purple-100">
                  <p className="text-xs text-purple-600 font-semibold mb-1">Special Equipment Notes</p>
                  <p className="text-base text-gray-800 dark:text-white/80 whitespace-pre-wrap">{job.special_equipment_notes}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Admin Documents & Photos */}
        {documents.length > 0 && (
          <div className="bg-gradient-to-br from-indigo-50 to-blue-50 rounded-2xl shadow-xl border-2 border-indigo-200 p-5">
            <div className="flex items-center gap-2 mb-4">
              <Paperclip className="w-5 h-5 text-indigo-600" />
              <h3 className="text-base font-bold text-indigo-900">Job Documents & Photos</h3>
              <span className="text-xs px-2 py-0.5 bg-indigo-500 text-white rounded-full font-bold">
                {documents.length}
              </span>
            </div>
            <div className="space-y-3">
              {documents.map(doc => {
                const isImage = doc.file_type?.startsWith('image/');
                return (
                  <a
                    key={doc.id}
                    href={doc.file_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block bg-white dark:bg-white/5 rounded-2xl border border-gray-200 dark:border-white/10 shadow-sm p-4 hover:bg-gray-50 dark:hover:bg-white/10 transition-colors"
                  >
                    <div className="flex items-start gap-4">
                      <div className={`w-14 h-14 rounded-xl flex items-center justify-center flex-shrink-0 ${
                        isImage ? 'bg-indigo-100' : 'bg-gray-100'
                      }`}>
                        {isImage ? <Image className="w-7 h-7 text-indigo-500" /> : <File className="w-7 h-7 text-gray-400" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-base font-bold text-gray-900 dark:text-white truncate">{doc.file_name}</p>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          <span className="text-xs font-semibold text-white bg-indigo-500 px-2 py-0.5 rounded-full">
                            {categoryLabels[doc.category] || doc.category}
                          </span>
                          {doc.uploaded_by_name && (
                            <span className="text-xs text-gray-500 dark:text-white/60">by {doc.uploaded_by_name}</span>
                          )}
                        </div>
                        {doc.notes && (
                          <p className="text-sm text-gray-600 mt-1">{doc.notes}</p>
                        )}
                      </div>
                      <Eye className="w-5 h-5 text-blue-500 flex-shrink-0 mt-1" />
                    </div>
                  </a>
                );
              })}
            </div>
          </div>
        )}

        {/* Arrived on Job Site Button */}
        <div className="pt-2 pb-6">
          <button
            onClick={handleArrivedOnJobSite}
            className="w-full py-5 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white rounded-2xl font-bold text-lg transition-all shadow-lg flex items-center justify-center gap-3"
          >
            <CheckCircle className="w-6 h-6" />
            Arrived on Job Site
          </button>
        </div>

      </div>
    </div>
  );
}
