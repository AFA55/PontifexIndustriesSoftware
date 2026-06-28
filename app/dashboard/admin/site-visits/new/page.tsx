'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState, useMemo, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, ArrowRight, ClipboardCheck, User as UserIcon, Calendar,
  Briefcase, MessageSquare, AlertTriangle, Star, Loader2, CheckCircle,
  MapPin, Wrench, Plus, Trash2, Check, Camera, X, ImageIcon,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { getCurrentUser, type User } from '@/lib/auth';
import { useModuleGate } from '@/components/ModuleGuard';
import { CalendarPicker } from '@/components/ui/CalendarPicker';

interface OperatorOpt {
  id: string;
  name: string;
}
interface JobRow {
  id: string;
  job_number: string | null;
  customer_name: string | null;
  status: string;
  scheduled_date: string | null;
  end_date: string | null;
  address: string | null;
  location: string | null;
  job_type: string | null;
}
interface EquipmentIssue {
  equipment_name: string;
  whats_wrong: string;
  action: 'maintenance' | 'replace';
  photo_urls: string[];
  photoUploading?: boolean;
}

// Admins are read-only on visit reports (site_visits = 'view' in RBAC): they review
// via Previous Visits but cannot create. Only supervisors + senior oversight create.
const ALLOWED_ROLES = ['supervisor', 'super_admin', 'operations_manager'];

const STEPS = [
  { num: 1, title: 'Visit Details', icon: UserIcon, gradient: 'from-brand to-brand-secondary' },
  { num: 2, title: 'What You Saw', icon: MessageSquare, gradient: 'from-brand-secondary to-brand' },
  { num: 3, title: 'Equipment Issues', icon: Wrench, gradient: 'from-brand to-brand-accent' },
] as const;

function todayStr() {
  return new Date().toISOString().split('T')[0];
}

export default function NewSiteVisitPage() {
  const moduleGate = useModuleGate('supervisor_visits');
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  // Wizard step
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Step 1 — Visit Details
  const [operatorId, setOperatorId] = useState('');
  const [visitDate, setVisitDate] = useState(todayStr());
  const [jobOrderId, setJobOrderId] = useState('');

  // Step 2 — What You Saw
  const [observations, setObservations] = useState('');
  const [issues, setIssues] = useState('');
  const [followUp, setFollowUp] = useState(false);
  const [followUpNotes, setFollowUpNotes] = useState('');
  const [performance, setPerformance] = useState<number | null>(null);
  const [safety, setSafety] = useState<number | null>(null);
  const [cleanliness, setCleanliness] = useState<number | null>(null);

  // Step 3 — Equipment Issues
  const [hasEquipmentIssues, setHasEquipmentIssues] = useState(false);
  const [equipmentIssues, setEquipmentIssues] = useState<EquipmentIssue[]>([]);

  // Photos — site visit (step 2) + per-issue (step 3)
  const [sitePhotoUrls, setSitePhotoUrls] = useState<string[]>([]);
  const [sitePhotoUploading, setSitePhotoUploading] = useState(false);
  const siteFileRef = useRef<HTMLInputElement>(null);
  const issueFileRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Lookup state
  const [operators, setOperators] = useState<OperatorOpt[]>([]);
  const [helpers, setHelpers] = useState<OperatorOpt[]>([]);
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [jobsLoading, setJobsLoading] = useState(false);

  // Submit state
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // ── auth guard ──────────────────────────────────────────────────────────
  useEffect(() => {
    const cu = getCurrentUser();
    if (!cu) { router.push('/login'); return; }
    if (!ALLOWED_ROLES.includes(cu.role)) { router.push('/dashboard/admin'); return; }
    setUser(cu);
    setAuthLoading(false);
  }, [router]);

  // ── load operators + helpers (people the supervisor can visit) ──────────
  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const res = await fetch('/api/admin/schedule-board/operators', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (res.ok) {
        const json = await res.json();
        setOperators(json.data?.operators ?? []);
        setHelpers(json.data?.helpers ?? []);
      }
    })();
  }, [user]);

  // ── load jobs when operator + date change ───────────────────────────────
  useEffect(() => {
    if (!operatorId || !visitDate) {
      setJobs([]);
      setJobOrderId('');
      return;
    }
    (async () => {
      setJobsLoading(true);
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;
        const res = await fetch(
          `/api/admin/operators/${operatorId}/active-jobs?date=${visitDate}`,
          { headers: { Authorization: `Bearer ${session.access_token}` } }
        );
        if (res.ok) {
          const json = await res.json();
          const list: JobRow[] = json.data?.jobs ?? [];
          setJobs(list);
          setJobOrderId(list.length === 1 ? list[0].id : '');
        } else {
          setJobs([]);
          setJobOrderId('');
        }
      } catch {
        setJobs([]);
        setJobOrderId('');
      } finally {
        setJobsLoading(false);
      }
    })();
  }, [operatorId, visitDate]);

  const selectedJob = useMemo(
    () => jobs.find((j) => j.id === jobOrderId) || null,
    [jobs, jobOrderId]
  );

  const peopleOptions = useMemo(() => {
    const all = [
      ...operators.map((o) => ({ ...o, role: 'operator' as const })),
      ...helpers.map((h) => ({ ...h, role: 'apprentice' as const })),
    ];
    return all.sort((a, b) => a.name.localeCompare(b.name));
  }, [operators, helpers]);

  // ── step validation ─────────────────────────────────────────────────────
  const canAdvanceFromStep = (s: 1 | 2 | 3): boolean => {
    if (s === 1) return !!operatorId;
    if (s === 2) return observations.trim().length > 0 || issues.trim().length > 0;
    return true;
  };

  async function uploadPhoto(file: File, pathPrefix: string): Promise<string | null> {
    const ext = file.name.split('.').pop() ?? 'jpg';
    const path = `${pathPrefix}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from('maintenance-photos')
      .upload(path, file, { contentType: file.type, upsert: false });
    if (upErr) { console.error('Photo upload failed:', upErr); return null; }
    const { data: signed } = await supabase.storage
      .from('maintenance-photos')
      .createSignedUrl(path, 60 * 60 * 24 * 30);
    return signed?.signedUrl ?? null;
  }

  async function handleSitePhotoSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setSitePhotoUploading(true);
    try {
      const url = await uploadPhoto(file, 'visits/site');
      if (url) setSitePhotoUrls((prev) => [...prev, url]);
    } finally {
      setSitePhotoUploading(false);
      if (siteFileRef.current) siteFileRef.current.value = '';
    }
  }

  async function handleIssuePhotoSelect(idx: number, e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    updateEquipmentIssue(idx, { photoUploading: true });
    try {
      const url = await uploadPhoto(file, 'visits/issues');
      if (url) {
        setEquipmentIssues((prev) => prev.map((it, i) =>
          i === idx ? { ...it, photo_urls: [...it.photo_urls, url], photoUploading: false } : it
        ));
      } else {
        updateEquipmentIssue(idx, { photoUploading: false });
      }
    } catch {
      updateEquipmentIssue(idx, { photoUploading: false });
    } finally {
      const ref = issueFileRefs.current[idx];
      if (ref) ref.value = '';
    }
  }

  function addEquipmentIssue() {
    setEquipmentIssues((prev) => [
      ...prev,
      { equipment_name: '', whats_wrong: '', action: 'maintenance', photo_urls: [] },
    ]);
  }
  function removeEquipmentIssue(idx: number) {
    setEquipmentIssues((prev) => prev.filter((_, i) => i !== idx));
  }
  function updateEquipmentIssue(idx: number, patch: Partial<EquipmentIssue>) {
    setEquipmentIssues((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  }

  async function handleSubmit() {
    setError(null);
    if (!operatorId) {
      setStep(1);
      setError('Please select an operator.');
      return;
    }
    if (!observations.trim() && !issues.trim()) {
      setStep(2);
      setError('Please add observations or flag at least one issue.');
      return;
    }

    const cleanedIssues = hasEquipmentIssues
      ? equipmentIssues.filter((it) => it.equipment_name.trim() || it.whats_wrong.trim())
      : [];

    setSubmitting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setError('Session expired. Please log in again.');
        return;
      }

      const res = await fetch('/api/admin/supervisor-visits', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          operator_id: operatorId,
          visit_date: visitDate,
          job_order_id: jobOrderId || null,
          observations: observations.trim() || null,
          issues_flagged: issues.trim() || null,
          follow_up_required: followUp,
          follow_up_notes: followUp ? (followUpNotes.trim() || null) : null,
          performance_rating: performance,
          safety_rating: safety,
          cleanliness_rating: cleanliness,
          photo_urls: sitePhotoUrls,
          equipment_issues: cleanedIssues.map(({ photoUploading: _, ...rest }) => rest),
        }),
      });

      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error || j.details || 'Failed to save visit.');
        return;
      }

      setSuccess(true);
      setTimeout(() => router.push('/dashboard/admin/site-visits'), 800);
    } catch (err: any) {
      setError(err.message || 'Failed to save visit.');
    } finally {
      setSubmitting(false);
    }
  }

  if (authLoading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-slate-900 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-brand" />
      </div>
    );
  }

  if (moduleGate.blocked) return moduleGate.fallback;

  if (success) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-slate-900 flex items-center justify-center p-6">
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg border border-emerald-200 dark:border-emerald-900/40 p-8 max-w-md w-full text-center">
          <div className="w-14 h-14 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-7 h-7 text-emerald-600 dark:text-emerald-400" />
          </div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">Visit report saved</h2>
          <p className="text-sm text-gray-500 dark:text-slate-400">Redirecting to your reports…</p>
        </div>
      </div>
    );
  }

  const currentStepMeta = STEPS[step - 1];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-900 pb-24">
      <div className="max-w-3xl mx-auto p-4 sm:p-6 space-y-5 sm:space-y-6">
        {/* Back link */}
        <Link
          href="/dashboard/admin/site-visits"
          className="inline-flex items-center gap-1.5 text-sm text-gray-600 dark:text-slate-300 hover:text-brand dark:hover:text-brand"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Visit Reports
        </Link>

        {/* Vibrant gradient hero header (matches current step's accent) */}
        <div
          className={`relative overflow-hidden rounded-2xl bg-gradient-to-br ${currentStepMeta.gradient} p-5 sm:p-7 shadow-xl shadow-brand/30 text-white transition-all`}
        >
          <div className="flex items-center gap-3 sm:gap-4">
            <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center ring-1 ring-white/30 flex-shrink-0">
              <currentStepMeta.icon className="w-7 h-7 text-white" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-white/75">
                Step {step} of 3
              </p>
              <h1 className="text-2xl sm:text-3xl font-bold leading-tight">
                {currentStepMeta.title}
              </h1>
            </div>
          </div>
        </div>

        {/* Step indicator dots — tappable on completed steps */}
        <div className="flex items-center gap-2">
          {STEPS.map((s) => {
            const isCurrent = s.num === step;
            const isCompleted = s.num < step;
            return (
              <button
                key={s.num}
                type="button"
                onClick={() => isCompleted && setStep(s.num as 1 | 2 | 3)}
                disabled={!isCompleted}
                className={`flex-1 h-2 rounded-full transition-all ${
                  isCurrent
                    ? `bg-gradient-to-r ${s.gradient}`
                    : isCompleted
                    ? 'bg-brand/40 dark:bg-brand/60 hover:bg-brand/50'
                    : 'bg-gray-200 dark:bg-slate-700'
                }`}
                aria-label={`${isCompleted ? 'Go back to' : 'Step'}: ${s.title}`}
              />
            );
          })}
        </div>

        {/* ── STEP 1: Visit Details ───────────────────────────────────────── */}
        {step === 1 && (
          <div className="space-y-5">
            <section className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-200 dark:border-slate-700 p-5 space-y-4">
              <div>
                <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 dark:text-slate-200 mb-1.5">
                  <UserIcon className="w-4 h-4 text-brand" /> Operator visited <span className="text-rose-500">*</span>
                </label>
                <select
                  value={operatorId}
                  onChange={(e) => setOperatorId(e.target.value)}
                  required
                  className="w-full min-w-0 max-w-full px-3 py-3 rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-white text-base sm:text-sm focus:ring-2 focus:ring-brand focus:border-brand"
                >
                  <option value="">Select operator…</option>
                  {peopleOptions.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} {p.role === 'apprentice' ? '(Helper)' : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 dark:text-slate-200 mb-1.5">
                  <Calendar className="w-4 h-4 text-brand" /> Date of visit
                </label>
                <CalendarPicker
                  value={visitDate}
                  onChange={setVisitDate}
                  icon={Calendar}
                />
              </div>
            </section>

            {operatorId && (
              <section className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-200 dark:border-slate-700 p-5 space-y-3">
                <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 dark:text-slate-200">
                  <Briefcase className="w-4 h-4 text-brand" /> Active job on that day
                </label>

                {jobsLoading ? (
                  <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-slate-400">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Loading jobs…
                  </div>
                ) : jobs.length === 0 ? (
                  <p className="text-sm text-gray-500 dark:text-slate-400 italic">
                    No active jobs found for this operator on {visitDate}. You can still file a report — it will be unlinked from a specific job.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {jobs.map((j) => (
                      <button
                        type="button"
                        key={j.id}
                        onClick={() => setJobOrderId(j.id === jobOrderId ? '' : j.id)}
                        className={`w-full text-left p-3 rounded-lg border-2 transition ${
                          j.id === jobOrderId
                            ? 'border-brand bg-brand/10 dark:bg-brand/20'
                            : 'border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 hover:border-brand/30'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-3 mb-0.5">
                          <span className="text-sm font-semibold text-gray-900 dark:text-white truncate min-w-0">
                            {j.job_number || 'Job'} — {j.customer_name || 'Customer'}
                          </span>
                          <span className="text-[10px] uppercase font-semibold tracking-wide text-brand dark:text-brand flex-shrink-0">
                            {j.status}
                          </span>
                        </div>
                        {(j.address || j.location) && (
                          <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-slate-400">
                            <MapPin className="w-3 h-3" />
                            <span className="truncate">{j.location || j.address}</span>
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                )}

                {selectedJob && (
                  <p className="text-xs text-brand dark:text-brand">
                    Linked to <strong>{selectedJob.job_number}</strong>
                  </p>
                )}
              </section>
            )}

          </div>
        )}

        {/* ── STEP 2: What You Saw ────────────────────────────────────────── */}
        {step === 2 && (
          <div className="space-y-5">
            <section className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-200 dark:border-slate-700 p-5 space-y-4">
              <div>
                <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 dark:text-slate-200 mb-1.5">
                  <MessageSquare className="w-4 h-4 text-brand" /> Observations
                </label>
                <textarea
                  value={observations}
                  onChange={(e) => setObservations(e.target.value)}
                  rows={4}
                  placeholder="What did you see? Crew working well, equipment status, customer interaction, etc."
                  className="w-full px-3 py-3 rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-white text-base sm:text-sm focus:ring-2 focus:ring-brand focus:border-brand"
                />
              </div>

              <div>
                <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 dark:text-slate-200 mb-1.5">
                  <AlertTriangle className="w-4 h-4 text-amber-500" /> Issues / Concerns
                </label>
                <textarea
                  value={issues}
                  onChange={(e) => setIssues(e.target.value)}
                  rows={3}
                  placeholder="Safety issues, performance concerns, customer complaints…"
                  className="w-full px-3 py-3 rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-white text-base sm:text-sm focus:ring-2 focus:ring-brand focus:border-brand"
                />
              </div>
            </section>

            <section className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-200 dark:border-slate-700 p-5 space-y-4">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Ratings (optional)</h3>
              <RatingRow label="Performance" value={performance} onChange={setPerformance} />
              <RatingRow label="Safety" value={safety} onChange={setSafety} />
              <RatingRow label="Cleanliness" value={cleanliness} onChange={setCleanliness} />
            </section>

            <section className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-200 dark:border-slate-700 p-5 space-y-3">
              <label className="flex items-center gap-3 text-sm font-semibold text-gray-700 dark:text-slate-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={followUp}
                  onChange={(e) => setFollowUp(e.target.checked)}
                  className="w-5 h-5 rounded border-gray-300 text-brand focus:ring-brand"
                />
                Follow-up required
              </label>
              {followUp && (
                <textarea
                  value={followUpNotes}
                  onChange={(e) => setFollowUpNotes(e.target.value)}
                  rows={2}
                  placeholder="What needs to happen next?"
                  className="w-full px-3 py-3 rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-white text-base sm:text-sm focus:ring-2 focus:ring-brand focus:border-brand"
                />
              )}
            </section>

            {/* Jobsite Photos */}
            <section className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-200 dark:border-slate-700 p-5 space-y-3">
              <p className="flex items-center gap-2 text-sm font-semibold text-gray-700 dark:text-slate-200">
                <ImageIcon className="w-4 h-4 text-brand" /> Jobsite Photos (optional)
              </p>
              {sitePhotoUrls.length > 0 && (
                <div className="grid grid-cols-3 gap-2">
                  {sitePhotoUrls.map((url, i) => (
                    <div key={i} className="relative group aspect-square rounded-lg overflow-hidden border border-gray-200 dark:border-slate-600">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={url} alt={`Site photo ${i + 1}`} className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={() => setSitePhotoUrls((prev) => prev.filter((_, j) => j !== i))}
                        className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition"
                        aria-label="Remove photo"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <input
                ref={siteFileRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={handleSitePhotoSelect}
              />
              <button
                type="button"
                onClick={() => siteFileRef.current?.click()}
                disabled={sitePhotoUploading}
                className="w-full inline-flex items-center justify-center gap-2 min-h-[44px] rounded-xl border-2 border-dashed border-brand/30 dark:border-brand/40 text-brand dark:text-brand hover:border-brand hover:bg-brand/10 dark:hover:bg-brand/20 transition text-sm font-semibold disabled:opacity-50"
              >
                {sitePhotoUploading ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Uploading…</>
                ) : (
                  <><Camera className="w-4 h-4" /> {sitePhotoUrls.length > 0 ? 'Add another photo' : 'Take or upload a jobsite photo'}</>
                )}
              </button>
            </section>
          </div>
        )}

        {/* ── STEP 3: Equipment Issues ────────────────────────────────────── */}
        {step === 3 && (
          <div className="space-y-5">
            <section className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-200 dark:border-slate-700 p-5 space-y-3">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={hasEquipmentIssues}
                  onChange={(e) => {
                    setHasEquipmentIssues(e.target.checked);
                    if (e.target.checked && equipmentIssues.length === 0) addEquipmentIssue();
                    if (!e.target.checked) setEquipmentIssues([]);
                  }}
                  className="w-5 h-5 rounded border-gray-300 text-brand focus:ring-brand mt-0.5"
                />
                <div>
                  <p className="text-sm font-semibold text-gray-900 dark:text-white">
                    I saw equipment issues today
                  </p>
                  <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">
                    Flag specific gear that needs attention. Each issue can be sent to the shop manager as a maintenance request OR a replacement request.
                  </p>
                </div>
              </label>
            </section>

            {hasEquipmentIssues && (
              <div className="space-y-3">
                {equipmentIssues.map((it, idx) => (
                  <div
                    key={idx}
                    className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-200 dark:border-slate-700 p-5 space-y-3"
                  >
                    <div className="flex items-start justify-between">
                      <p className="text-xs font-semibold uppercase tracking-wide text-brand dark:text-brand">
                        Issue #{idx + 1}
                      </p>
                      <button
                        type="button"
                        onClick={() => removeEquipmentIssue(idx)}
                        className="w-8 h-8 rounded-full text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 flex items-center justify-center transition"
                        aria-label="Remove issue"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    <div>
                      <label className="text-sm font-semibold text-gray-700 dark:text-slate-200 mb-1.5 block">
                        Equipment name
                      </label>
                      <input
                        type="text"
                        value={it.equipment_name}
                        onChange={(e) => updateEquipmentIssue(idx, { equipment_name: e.target.value })}
                        placeholder="e.g. Husqvarna FS5000 #2 or DFS-5"
                        className="w-full px-3 py-3 rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-white text-base sm:text-sm focus:ring-2 focus:ring-brand focus:border-brand"
                      />
                    </div>

                    <div>
                      <label className="text-sm font-semibold text-gray-700 dark:text-slate-200 mb-1.5 block">
                        What's wrong?
                      </label>
                      <textarea
                        value={it.whats_wrong}
                        onChange={(e) => updateEquipmentIssue(idx, { whats_wrong: e.target.value })}
                        rows={2}
                        placeholder="Brief description of the problem"
                        className="w-full px-3 py-3 rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-white text-base sm:text-sm focus:ring-2 focus:ring-brand focus:border-brand"
                      />
                    </div>

                    <div>
                      <p className="text-sm font-semibold text-gray-700 dark:text-slate-200 mb-2">
                        What should the shop manager do?
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => updateEquipmentIssue(idx, { action: 'maintenance' })}
                          className={`text-left p-3 rounded-lg border-2 transition flex items-start gap-2 ${
                            it.action === 'maintenance'
                              ? 'border-amber-500 bg-amber-50 dark:bg-amber-900/20'
                              : 'border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 hover:border-amber-300'
                          }`}
                        >
                          <Wrench className={`w-4 h-4 mt-0.5 flex-shrink-0 ${it.action === 'maintenance' ? 'text-amber-600' : 'text-gray-400'}`} />
                          <div>
                            <p className="text-sm font-semibold text-gray-900 dark:text-white">Repair / Maintenance</p>
                            <p className="text-xs text-gray-500 dark:text-slate-400">Send a maintenance request</p>
                          </div>
                        </button>
                        <button
                          type="button"
                          onClick={() => updateEquipmentIssue(idx, { action: 'replace' })}
                          className={`text-left p-3 rounded-lg border-2 transition flex items-start gap-2 ${
                            it.action === 'replace'
                              ? 'border-rose-500 bg-rose-50 dark:bg-rose-900/20'
                              : 'border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 hover:border-rose-300'
                          }`}
                        >
                          <AlertTriangle className={`w-4 h-4 mt-0.5 flex-shrink-0 ${it.action === 'replace' ? 'text-rose-600' : 'text-gray-400'}`} />
                          <div>
                            <p className="text-sm font-semibold text-gray-900 dark:text-white">Replace this unit</p>
                            <p className="text-xs text-gray-500 dark:text-slate-400">Get a different one out to the operator</p>
                          </div>
                        </button>
                      </div>
                    </div>

                    {/* Per-issue photo */}
                    <div>
                      <p className="text-sm font-semibold text-gray-700 dark:text-slate-200 mb-2">
                        Photo of issue (optional)
                      </p>
                      {it.photo_urls.length > 0 && (
                        <div className="grid grid-cols-3 gap-2 mb-2">
                          {it.photo_urls.map((url, pi) => (
                            <div key={pi} className="relative group aspect-square rounded-lg overflow-hidden border border-gray-200 dark:border-slate-600">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={url} alt={`Issue ${idx + 1} photo`} className="w-full h-full object-cover" />
                              <button
                                type="button"
                                onClick={() => setEquipmentIssues((prev) => prev.map((item, i) =>
                                  i === idx ? { ...item, photo_urls: item.photo_urls.filter((_, j) => j !== pi) } : item
                                ))}
                                className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition"
                                aria-label="Remove photo"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                      <input
                        ref={(el) => { issueFileRefs.current[idx] = el; }}
                        type="file"
                        accept="image/*"
                        capture="environment"
                        className="hidden"
                        onChange={(e) => handleIssuePhotoSelect(idx, e)}
                      />
                      <button
                        type="button"
                        onClick={() => issueFileRefs.current[idx]?.click()}
                        disabled={!!it.photoUploading}
                        className="w-full inline-flex items-center justify-center gap-2 min-h-[44px] rounded-xl border border-dashed border-gray-300 dark:border-slate-600 text-gray-600 dark:text-slate-300 hover:border-brand hover:text-brand transition text-sm font-medium disabled:opacity-50"
                      >
                        {it.photoUploading ? (
                          <><Loader2 className="w-4 h-4 animate-spin" /> Uploading…</>
                        ) : (
                          <><Camera className="w-4 h-4" /> {it.photo_urls.length > 0 ? 'Add another photo' : 'Photo of broken equipment'}</>
                        )}
                      </button>
                    </div>
                  </div>
                ))}

                <button
                  type="button"
                  onClick={addEquipmentIssue}
                  className="w-full inline-flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-dashed border-brand/30 dark:border-brand/40 text-brand dark:text-brand hover:border-brand hover:bg-brand/10 dark:hover:bg-brand/20 transition text-sm font-semibold"
                >
                  <Plus className="w-4 h-4" />
                  Add another issue
                </button>
              </div>
            )}

            {!hasEquipmentIssues && (
              <div className="text-center py-6 text-sm text-gray-500 dark:text-slate-400">
                No equipment issues. You can submit your report.
              </div>
            )}
          </div>
        )}

        {error && (
          <div className="rounded-lg bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800/40 p-3 text-sm text-rose-700 dark:text-rose-300">
            {error}
          </div>
        )}
      </div>

      {/* Sticky bottom action bar — keeps Next/Submit always reachable on mobile */}
      <div className="fixed bottom-0 inset-x-0 bg-white/95 dark:bg-slate-900/95 backdrop-blur border-t border-gray-200 dark:border-slate-700 shadow-lg z-30">
        <div className="max-w-3xl mx-auto p-3 sm:p-4 flex items-center gap-3">
          {step > 1 ? (
            <button
              type="button"
              onClick={() => { setError(null); setStep((step - 1) as 1 | 2 | 3); }}
              className="inline-flex items-center justify-center gap-1.5 min-h-[44px] px-4 rounded-xl text-sm font-semibold text-gray-700 dark:text-slate-200 bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 transition"
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </button>
          ) : (
            <div className="w-[88px] hidden sm:block" />
          )}

          <div className="flex-1 text-center text-xs text-gray-400 dark:text-slate-500 hidden sm:block">
            Step {step} of 3
          </div>

          {step < 3 ? (
            <button
              type="button"
              onClick={() => {
                setError(null);
                if (!canAdvanceFromStep(step)) {
                  setError(step === 1 ? 'Please select an operator first.' : 'Please add observations or flag at least one issue.');
                  return;
                }
                setStep((step + 1) as 1 | 2 | 3);
              }}
              className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 min-h-[44px] px-6 rounded-xl bg-gradient-to-br from-brand to-brand-secondary hover:from-brand-dark hover:to-brand-secondary text-white text-sm font-semibold shadow-lg shadow-brand/30 transition"
            >
              Continue
              <ArrowRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting}
              className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 min-h-[44px] px-6 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold shadow-lg shadow-emerald-500/30 transition"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Saving…
                </>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  Submit Report
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function RatingRow({
  label, value, onChange,
}: { label: string; value: number | null; onChange: (n: number | null) => void }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm font-medium text-gray-700 dark:text-slate-200">{label}</span>
      <div className="flex items-center gap-0.5">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onChange(value === n ? null : n)}
            className={`w-11 h-11 rounded-full flex items-center justify-center transition active:scale-95 ${
              value && n <= value
                ? 'text-amber-500'
                : 'text-gray-300 dark:text-slate-600 hover:text-amber-300'
            }`}
            aria-label={`${label} ${n} star${n > 1 ? 's' : ''}`}
          >
            <Star className="w-6 h-6" fill={value && n <= value ? 'currentColor' : 'none'} />
          </button>
        ))}
      </div>
    </div>
  );
}
