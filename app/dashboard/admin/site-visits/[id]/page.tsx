'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, Calendar, User as UserIcon, Briefcase, MapPin,
  Clock, Star, AlertTriangle, MessageSquare, Wrench, CheckCircle,
  ImageIcon, ChevronRight, Loader2, ExternalLink, Flag,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { getCurrentUser, type User } from '@/lib/auth';

interface EquipmentIssue {
  equipment_name: string;
  whats_wrong: string;
  action: 'maintenance' | 'replace';
  photo_urls: string[];
  status: string;
}

interface VisitDetail {
  id: string;
  visit_date: string;
  operator_id: string;
  operator_name: string;
  supervisor_id: string;
  supervisor_name: string;
  job_order_id: string | null;
  job_number: string | null;
  customer_name: string | null;
  arrival_time: string | null;
  departure_time: string | null;
  observations: string | null;
  issues_flagged: string | null;
  follow_up_required: boolean;
  follow_up_notes: string | null;
  performance_rating: number | null;
  safety_rating: number | null;
  cleanliness_rating: number | null;
  photo_urls: string[];
  equipment_issues: EquipmentIssue[];
  status: string;
  created_at: string;
}

const ALLOWED_ROLES = ['supervisor', 'admin', 'super_admin', 'operations_manager'];

function formatDate(dateStr: string) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  });
}

function formatTime(iso: string | null) {
  if (!iso) return null;
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function StarRow({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm font-medium text-gray-600 dark:text-slate-300">{label}</span>
      <div className="flex items-center gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <Star
            key={n}
            className={`w-5 h-5 ${n <= value ? color : 'text-gray-200 dark:text-white/15'}`}
            fill={n <= value ? 'currentColor' : 'none'}
          />
        ))}
        <span className="ml-1.5 text-sm font-semibold text-gray-900 dark:text-white">{value}/5</span>
      </div>
    </div>
  );
}

export default function SiteVisitDetailPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const [user, setUser] = useState<User | null>(null);
  const [visit, setVisit] = useState<VisitDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  useEffect(() => {
    const cu = getCurrentUser();
    if (!cu) { router.push('/login'); return; }
    if (!ALLOWED_ROLES.includes(cu.role)) { router.push('/dashboard/admin'); return; }
    setUser(cu);
  }, [router]);

  useEffect(() => {
    if (!user || !id) return;
    (async () => {
      setLoading(true);
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;
        const res = await fetch(`/api/admin/supervisor-visits/${id}`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          setError(j.error || 'Visit not found');
          return;
        }
        const json = await res.json();
        setVisit(json.data);
      } catch {
        setError('Failed to load visit');
      } finally {
        setLoading(false);
      }
    })();
  }, [user, id]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-[#1e1b4b] flex items-center justify-center">
        <Loader2 className="w-7 h-7 animate-spin text-brand" />
      </div>
    );
  }

  if (error || !visit) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-[#1e1b4b] flex flex-col items-center justify-center gap-4">
        <p className="text-gray-500 dark:text-slate-400">{error || 'Visit not found'}</p>
        <Link href="/dashboard/admin/site-visits" className="text-sm font-semibold text-brand hover:underline">
          Back to visits
        </Link>
      </div>
    );
  }

  const hasRatings = visit.performance_rating || visit.safety_rating || visit.cleanliness_rating;
  const avgRating = hasRatings
    ? Math.round(
        ([visit.performance_rating, visit.safety_rating, visit.cleanliness_rating]
          .filter(Boolean) as number[])
          .reduce((a, b) => a + b, 0) /
          [visit.performance_rating, visit.safety_rating, visit.cleanliness_rating].filter(Boolean).length
      )
    : null;

  const arrivalFmt = formatTime(visit.arrival_time);
  const departureFmt = formatTime(visit.departure_time);

  const sitePhotos: string[] = Array.isArray(visit.photo_urls) ? visit.photo_urls : [];
  const issues: EquipmentIssue[] = Array.isArray(visit.equipment_issues) ? visit.equipment_issues : [];

  return (
    <>
      {/* Lightbox */}
      {lightboxUrl && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          onClick={() => setLightboxUrl(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={lightboxUrl}
            alt="Visit photo"
            className="max-w-full max-h-full rounded-xl object-contain"
            onClick={(e) => e.stopPropagation()}
          />
          <button
            onClick={() => setLightboxUrl(null)}
            className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 text-white flex items-center justify-center hover:bg-white/20 transition"
            aria-label="Close"
          >
            ✕
          </button>
        </div>
      )}

      <div className="min-h-screen bg-gray-50 dark:bg-[#1e1b4b]">
        <div className="max-w-3xl mx-auto p-4 sm:p-6 space-y-5 pb-12">

          {/* Back */}
          <Link
            href="/dashboard/admin/site-visits"
            className="inline-flex items-center gap-1.5 min-h-[44px] -ml-1 pl-1 pr-2 text-sm font-medium text-gray-600 dark:text-slate-300 hover:text-brand dark:hover:text-brand transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            All Visits
          </Link>

          {/* Hero header */}
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-brand to-brand-accent p-6 sm:p-8 shadow-xl shadow-brand/25 text-white">
            <div className="absolute inset-0 opacity-10"
              style={{ backgroundImage: 'radial-gradient(circle at 80% 20%, white 0%, transparent 60%)' }}
            />
            <div className="absolute -right-8 -top-8 w-40 h-40 rounded-full bg-white/5 blur-2xl" />
            <div className="relative">
              <div className="flex items-start justify-between gap-4 flex-wrap mb-4">
                <div>
                  <p className="text-white/70 text-xs font-semibold uppercase tracking-widest mb-1">Site Visit Report</p>
                  <h1 className="text-2xl sm:text-3xl font-bold leading-tight">
                    {formatDate(visit.visit_date)}
                  </h1>
                </div>
                {visit.follow_up_required && (
                  <span className="inline-flex items-center gap-1.5 bg-amber-400/20 border border-amber-400/40 text-amber-200 text-xs font-semibold px-3 py-1.5 rounded-full">
                    <Flag className="w-3.5 h-3.5" />
                    Follow-up Required
                  </span>
                )}
              </div>

              {/* Who + Job */}
              <div className="grid sm:grid-cols-2 gap-3">
                <div className="bg-white/10 backdrop-blur-sm rounded-xl p-3 flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0">
                    <UserIcon className="w-4 h-4 text-white" />
                  </div>
                  <div>
                    <p className="text-white/60 text-[10px] uppercase font-semibold tracking-wide">Operator</p>
                    <p className="text-white font-semibold text-sm">{visit.operator_name}</p>
                  </div>
                </div>
                {visit.job_number ? (
                  <div className="bg-white/10 backdrop-blur-sm rounded-xl p-3 flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0">
                      <Briefcase className="w-4 h-4 text-white" />
                    </div>
                    <div>
                      <p className="text-white/60 text-[10px] uppercase font-semibold tracking-wide">Job</p>
                      <p className="text-white font-semibold text-sm">{visit.job_number} · {visit.customer_name || '—'}</p>
                    </div>
                  </div>
                ) : (
                  <div className="bg-white/10 backdrop-blur-sm rounded-xl p-3 flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0">
                      <MapPin className="w-4 h-4 text-white" />
                    </div>
                    <div>
                      <p className="text-white/60 text-[10px] uppercase font-semibold tracking-wide">Job</p>
                      <p className="text-white/50 text-sm">No job linked</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Time + Supervisor */}
              <div className="mt-3 flex items-center gap-4 flex-wrap text-sm text-white/70">
                {(arrivalFmt || departureFmt) && (
                  <span className="flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5" />
                    {arrivalFmt && departureFmt ? `${arrivalFmt} → ${departureFmt}` : arrivalFmt || departureFmt}
                  </span>
                )}
                <span>Filed by <span className="text-white/90 font-medium">{visit.supervisor_name}</span></span>
                {avgRating !== null && (
                  <span className="flex items-center gap-1">
                    <Star className="w-3.5 h-3.5 text-amber-300" fill="currentColor" />
                    <span className="text-amber-200 font-semibold">{avgRating}/5 avg</span>
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Ratings */}
          {hasRatings && (
            <section className="rounded-2xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/[0.03] p-5 sm:p-6 space-y-4">
              <h2 className="flex items-center gap-2 text-sm font-bold text-gray-900 dark:text-white uppercase tracking-widest">
                <Star className="w-4 h-4 text-brand" fill="currentColor" />
                Ratings
              </h2>
              <div className="divide-y divide-gray-100 dark:divide-white/10">
                {visit.performance_rating && (
                  <div className="py-2.5 first:pt-0 last:pb-0">
                    <StarRow label="Performance" value={visit.performance_rating} color="text-brand" />
                  </div>
                )}
                {visit.safety_rating && (
                  <div className="py-2.5 first:pt-0 last:pb-0">
                    <StarRow label="Safety" value={visit.safety_rating} color="text-emerald-500" />
                  </div>
                )}
                {visit.cleanliness_rating && (
                  <div className="py-2.5 first:pt-0 last:pb-0">
                    <StarRow label="Cleanliness" value={visit.cleanliness_rating} color="text-sky-500" />
                  </div>
                )}
              </div>
            </section>
          )}

          {/* Observations */}
          {visit.observations && (
            <section className="rounded-2xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/[0.03] p-5 sm:p-6 space-y-3">
              <h2 className="flex items-center gap-2 text-sm font-bold text-gray-900 dark:text-white uppercase tracking-widest">
                <MessageSquare className="w-4 h-4 text-brand" />
                Observations
              </h2>
              <p className="text-sm text-gray-700 dark:text-slate-200 whitespace-pre-wrap leading-relaxed">
                {visit.observations}
              </p>
            </section>
          )}

          {/* Issues */}
          {visit.issues_flagged && (
            <section className="bg-amber-50 dark:bg-amber-900/10 rounded-2xl border border-amber-200 dark:border-amber-800/40 p-5 sm:p-6 space-y-3">
              <h2 className="flex items-center gap-2 text-sm font-bold text-amber-800 dark:text-amber-300 uppercase tracking-widest">
                <AlertTriangle className="w-4 h-4" />
                Issues / Concerns
              </h2>
              <p className="text-sm text-amber-800 dark:text-amber-200 whitespace-pre-wrap leading-relaxed">
                {visit.issues_flagged}
              </p>
            </section>
          )}

          {/* Follow-up */}
          {visit.follow_up_required && (
            <section className="bg-amber-50/40 dark:bg-amber-900/10 rounded-2xl border-2 border-amber-300 dark:border-amber-700/60 p-5 sm:p-6 space-y-2">
              <h2 className="flex items-center gap-2 text-sm font-bold text-amber-700 dark:text-amber-300 uppercase tracking-widest">
                <Flag className="w-4 h-4" />
                Follow-up Required
              </h2>
              {visit.follow_up_notes ? (
                <p className="text-sm text-gray-700 dark:text-slate-200 whitespace-pre-wrap leading-relaxed">
                  {visit.follow_up_notes}
                </p>
              ) : (
                <p className="text-sm text-gray-400 dark:text-slate-500 italic">No notes added.</p>
              )}
            </section>
          )}

          {/* Jobsite Photos */}
          {sitePhotos.length > 0 && (
            <section className="rounded-2xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/[0.03] p-5 sm:p-6 space-y-3">
              <h2 className="flex items-center gap-2 text-sm font-bold text-gray-900 dark:text-white uppercase tracking-widest">
                <ImageIcon className="w-4 h-4 text-brand" />
                Jobsite Photos
                <span className="text-xs font-normal text-gray-400 normal-case tracking-normal ml-1">
                  {sitePhotos.length} photo{sitePhotos.length !== 1 ? 's' : ''}
                </span>
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                {sitePhotos.map((url, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setLightboxUrl(url)}
                    className="relative aspect-square rounded-xl overflow-hidden border border-gray-200 dark:border-white/10 hover:opacity-95 hover:ring-2 hover:ring-brand transition group"
                    aria-label={`View jobsite photo ${i + 1}`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt={`Site photo ${i + 1}`} className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition flex items-center justify-center">
                      <ExternalLink className="w-5 h-5 text-white opacity-0 group-hover:opacity-100 transition drop-shadow" />
                    </div>
                  </button>
                ))}
              </div>
            </section>
          )}

          {/* Equipment Issues */}
          {issues.length > 0 && (
            <section className="space-y-3">
              <h2 className="flex items-center gap-2 text-sm font-bold text-gray-900 dark:text-white uppercase tracking-widest px-1">
                <Wrench className="w-4 h-4 text-amber-500" />
                Equipment Issues
                <span className="text-xs font-normal text-gray-400 normal-case tracking-normal ml-1">
                  {issues.length} flagged
                </span>
              </h2>
              {issues.map((issue, i) => {
                const isMaint = issue.action !== 'replace';
                const issuePhotos: string[] = Array.isArray(issue.photo_urls) ? issue.photo_urls : [];
                return (
                  <div
                    key={i}
                    className={`rounded-2xl border bg-white dark:bg-white/[0.03] p-5 sm:p-6 space-y-3 ${
                      isMaint
                        ? 'border-amber-200 dark:border-amber-800/40'
                        : 'border-rose-200 dark:border-rose-800/40'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-slate-500 mb-0.5">
                          Issue #{i + 1}
                        </p>
                        <p className="text-base font-bold text-gray-900 dark:text-white">
                          {issue.equipment_name || 'Unnamed equipment'}
                        </p>
                      </div>
                      <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full ${
                        isMaint
                          ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-700/40'
                          : 'bg-rose-50 dark:bg-rose-900/20 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-700/40'
                      }`}>
                        {isMaint ? <Wrench className="w-3.5 h-3.5" /> : <AlertTriangle className="w-3.5 h-3.5" />}
                        {isMaint ? 'Maintenance' : 'Replace'}
                      </span>
                    </div>

                    {issue.whats_wrong && (
                      <p className="text-sm text-gray-700 dark:text-slate-200 leading-relaxed">
                        {issue.whats_wrong}
                      </p>
                    )}

                    {issue.status === 'converted' && (
                      <div className="flex items-center gap-2 text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                        <CheckCircle className="w-3.5 h-3.5" />
                        Maintenance request created
                      </div>
                    )}

                    {issuePhotos.length > 0 && (
                      <div className="grid grid-cols-3 gap-2">
                        {issuePhotos.map((url, pi) => (
                          <button
                            key={pi}
                            type="button"
                            onClick={() => setLightboxUrl(url)}
                            className="relative aspect-square rounded-lg overflow-hidden border border-gray-200 dark:border-white/10 hover:ring-2 hover:ring-brand transition group"
                            aria-label={`View issue photo ${pi + 1}`}
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={url} alt={`Issue ${i + 1} photo`} className="w-full h-full object-cover" />
                            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition" />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </section>
          )}

          {/* No content fallback */}
          {!visit.observations && !visit.issues_flagged && issues.length === 0 && sitePhotos.length === 0 && (
            <div className="text-center py-10 text-sm text-gray-400 dark:text-slate-500">
              No additional details recorded for this visit.
            </div>
          )}

        </div>
      </div>
    </>
  );
}
