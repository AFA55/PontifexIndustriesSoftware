'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, Briefcase, Loader2, MapPin, Phone, User, Navigation,
  AlertTriangle, FileText, Shield, ClipboardCheck, Inbox, CheckCircle
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { JobTicketData } from '../../_components/JobTicketCard';

export default function JobsitePage() {
  const router = useRouter();
  const params = useParams();
  const jobId = params.id as string;

  const [job, setJob] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [completing, setCompleting] = useState(false);

  const fetchJob = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push('/login');
        return;
      }

      const res = await fetch(
        `/api/job-orders?include_helper_jobs=true&includeCompleted=true`,
        { headers: { Authorization: `Bearer ${session.access_token}` } }
      );

      if (res.ok) {
        const json = await res.json();
        if (json.success) {
          const found = (json.data || []).find((j: any) => j.id === jobId);
          if (found) {
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

  useEffect(() => {
    fetchJob();
  }, [fetchJob]);

  const handleWorkCompleted = () => {
    router.push(`/dashboard/job-schedule/${jobId}/work-performed`);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-gray-600 text-lg font-medium">Loading jobsite info...</p>
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

  // Parse jobsite conditions and site compliance from JSON fields
  const conditions: any = job.jobsite_conditions || {};
  const compliance: any = job.site_compliance || {};
  const hasConditions = Object.keys(conditions).length > 0;
  const hasCompliance = Object.keys(compliance).length > 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
      {/* Header */}
      <div className="bg-gradient-to-r from-slate-900 via-blue-900 to-indigo-900 text-white sticky top-0 z-50 shadow-2xl">
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
        <div className="bg-white/90 backdrop-blur-lg rounded-2xl shadow-xl border border-gray-200/50 p-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center flex-shrink-0">
              <MapPin className="w-5 h-5 text-red-600" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-bold text-gray-800 mb-1">Jobsite Address</h3>
              <p className="text-gray-700 font-medium">{job.address || job.location || 'No address provided'}</p>
              {job.location && job.address && job.location !== job.address && (
                <p className="text-xs text-gray-500 mt-0.5">{job.location}</p>
              )}
            </div>
          </div>
          {job.address && (
            <a
              href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(job.address)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-50 text-blue-700 rounded-xl text-sm font-bold hover:bg-blue-100 transition-colors border border-blue-200"
            >
              <Navigation className="w-4 h-4" /> Open in Maps
            </a>
          )}
        </div>

        {/* Contact Info */}
        {(job.foreman_name || job.customer_contact || job.site_contact_phone) && (
          <div className="bg-white/90 backdrop-blur-lg rounded-2xl shadow-xl border border-gray-200/50 p-4">
            <div className="flex items-center gap-2 mb-3">
              <User className="w-4 h-4 text-blue-600" />
              <h3 className="text-sm font-bold text-gray-800">Site Contact</h3>
            </div>
            <div className="space-y-3">
              {job.foreman_name && (
                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                  <div>
                    <p className="text-xs text-gray-500 font-semibold uppercase tracking-wider">Foreman / Contact</p>
                    <p className="text-sm font-bold text-gray-900">{job.foreman_name}</p>
                  </div>
                  {job.foreman_phone && (
                    <a
                      href={`tel:${job.foreman_phone}`}
                      className="flex items-center gap-1.5 px-3 py-2 bg-green-500 text-white rounded-xl text-xs font-bold hover:bg-green-600 transition-colors"
                    >
                      <Phone className="w-3.5 h-3.5" /> Call
                    </a>
                  )}
                </div>
              )}
              {job.customer_contact && job.customer_contact !== job.foreman_name && (
                <div className="p-3 bg-gray-50 rounded-xl">
                  <p className="text-xs text-gray-500 font-semibold uppercase tracking-wider">Customer Contact</p>
                  <p className="text-sm font-bold text-gray-900">{job.customer_contact}</p>
                </div>
              )}
              {job.site_contact_phone && (
                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                  <div>
                    <p className="text-xs text-gray-500 font-semibold uppercase tracking-wider">Site Phone</p>
                    <p className="text-sm font-bold text-gray-900">{job.site_contact_phone}</p>
                  </div>
                  <a
                    href={`tel:${job.site_contact_phone}`}
                    className="flex items-center gap-1.5 px-3 py-2 bg-green-500 text-white rounded-xl text-xs font-bold hover:bg-green-600 transition-colors"
                  >
                    <Phone className="w-3.5 h-3.5" /> Call
                  </a>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Jobsite Conditions */}
        {hasConditions && (
          <div className="bg-white/90 backdrop-blur-lg rounded-2xl shadow-xl border border-gray-200/50 p-4">
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle className="w-4 h-4 text-amber-600" />
              <h3 className="text-sm font-bold text-gray-800">Jobsite Conditions</h3>
            </div>
            <div className="space-y-2">
              {conditions.surface_type && (
                <div className="flex items-center justify-between p-2.5 bg-amber-50 rounded-xl border border-amber-100">
                  <span className="text-xs text-gray-600 font-semibold">Surface Type</span>
                  <span className="text-sm font-bold text-gray-900">{conditions.surface_type}</span>
                </div>
              )}
              {conditions.thickness && (
                <div className="flex items-center justify-between p-2.5 bg-amber-50 rounded-xl border border-amber-100">
                  <span className="text-xs text-gray-600 font-semibold">Thickness</span>
                  <span className="text-sm font-bold text-gray-900">{conditions.thickness}</span>
                </div>
              )}
              {conditions.reinforcement && (
                <div className="flex items-center justify-between p-2.5 bg-amber-50 rounded-xl border border-amber-100">
                  <span className="text-xs text-gray-600 font-semibold">Reinforcement</span>
                  <span className="text-sm font-bold text-gray-900">{conditions.reinforcement}</span>
                </div>
              )}
              {conditions.water_source && (
                <div className="flex items-center justify-between p-2.5 bg-amber-50 rounded-xl border border-amber-100">
                  <span className="text-xs text-gray-600 font-semibold">Water Source</span>
                  <span className="text-sm font-bold text-gray-900">{conditions.water_source ? 'Available' : 'Not Available'}</span>
                </div>
              )}
              {conditions.power_source && (
                <div className="flex items-center justify-between p-2.5 bg-amber-50 rounded-xl border border-amber-100">
                  <span className="text-xs text-gray-600 font-semibold">Power Source</span>
                  <span className="text-sm font-bold text-gray-900">{conditions.power_source ? 'Available' : 'Not Available'}</span>
                </div>
              )}
              {conditions.access_notes && (
                <div className="p-3 bg-amber-50 rounded-xl border border-amber-100">
                  <p className="text-xs text-gray-600 font-semibold mb-1">Access Notes</p>
                  <p className="text-sm text-gray-800">{conditions.access_notes}</p>
                </div>
              )}
              {/* Render any other condition keys dynamically */}
              {Object.entries(conditions).filter(([k]) => !['surface_type','thickness','reinforcement','water_source','power_source','access_notes'].includes(k)).map(([key, value]) => (
                <div key={key} className="flex items-center justify-between p-2.5 bg-amber-50 rounded-xl border border-amber-100">
                  <span className="text-xs text-gray-600 font-semibold capitalize">{key.replace(/_/g, ' ')}</span>
                  <span className="text-sm font-bold text-gray-900">{String(value)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Site Compliance */}
        {hasCompliance && (
          <div className="bg-white/90 backdrop-blur-lg rounded-2xl shadow-xl border border-gray-200/50 p-4">
            <div className="flex items-center gap-2 mb-3">
              <Shield className="w-4 h-4 text-indigo-600" />
              <h3 className="text-sm font-bold text-gray-800">Site Compliance</h3>
            </div>
            <div className="space-y-2">
              {Object.entries(compliance).map(([key, value]) => (
                <div key={key} className="flex items-center justify-between p-2.5 bg-indigo-50 rounded-xl border border-indigo-100">
                  <span className="text-xs text-gray-600 font-semibold capitalize">{key.replace(/_/g, ' ')}</span>
                  <span className="text-sm font-bold text-gray-900">
                    {typeof value === 'boolean' ? (value ? 'Yes' : 'No') : String(value)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Additional Notes from Schedule Form */}
        {(job.additional_info || job.special_equipment_notes || job.description) && (
          <div className="bg-white/90 backdrop-blur-lg rounded-2xl shadow-xl border border-gray-200/50 p-4">
            <div className="flex items-center gap-2 mb-3">
              <FileText className="w-4 h-4 text-purple-600" />
              <h3 className="text-sm font-bold text-gray-800">Additional Notes</h3>
            </div>
            <div className="space-y-3">
              {job.description && (
                <div className="p-3 bg-gray-50 rounded-xl border border-gray-200">
                  <p className="text-xs text-gray-500 font-semibold mb-1">Job Description</p>
                  <p className="text-sm text-gray-800 whitespace-pre-wrap">{job.description}</p>
                </div>
              )}
              {job.additional_info && (
                <div className="p-3 bg-purple-50 rounded-xl border border-purple-100">
                  <p className="text-xs text-purple-600 font-semibold mb-1">Additional Info</p>
                  <p className="text-sm text-gray-800 whitespace-pre-wrap">{job.additional_info}</p>
                </div>
              )}
              {job.special_equipment_notes && (
                <div className="p-3 bg-purple-50 rounded-xl border border-purple-100">
                  <p className="text-xs text-purple-600 font-semibold mb-1">Special Equipment Notes</p>
                  <p className="text-sm text-gray-800 whitespace-pre-wrap">{job.special_equipment_notes}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Work Completed Button */}
        <div className="pt-2 pb-6">
          <button
            onClick={handleWorkCompleted}
            className="w-full py-4 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white rounded-2xl font-bold text-base transition-all shadow-lg flex items-center justify-center gap-2"
          >
            <CheckCircle className="w-5 h-5" />
            Work Completed
          </button>
        </div>

      </div>
    </div>
  );
}
