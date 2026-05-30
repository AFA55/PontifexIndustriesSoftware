'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState, useRef, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, ArrowRight, Wrench, Search, Camera, CheckCircle2,
  ChevronDown, AlertTriangle, Loader2, Home,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/auth';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Equipment {
  id: string;
  name: string;
  unit_number: string | null;
}

type Priority = 'low' | 'medium' | 'high' | 'critical';

const PRIORITY_CONFIG: Record<Priority, { label: string; color: string; bg: string; ring: string }> = {
  low:      { label: 'Low',      color: 'text-slate-700 dark:text-slate-200',  bg: 'bg-slate-100 dark:bg-slate-700',   ring: 'ring-slate-400' },
  medium:   { label: 'Medium',   color: 'text-amber-700 dark:text-amber-200',  bg: 'bg-amber-50 dark:bg-amber-900/40', ring: 'ring-amber-400' },
  high:     { label: 'High',     color: 'text-orange-700 dark:text-orange-200',bg: 'bg-orange-50 dark:bg-orange-900/40',ring: 'ring-orange-400'},
  critical: { label: 'Critical', color: 'text-rose-700 dark:text-rose-200',    bg: 'bg-rose-50 dark:bg-rose-900/40',   ring: 'ring-rose-500' },
};

// Roles allowed to access this page
const ALLOWED_ROLES = ['operator', 'apprentice', 'supervisor', 'shop_help', 'shop_manager', 'admin', 'super_admin', 'operations_manager'];

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function MaintenanceNewPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [authChecked, setAuthChecked] = useState(false);

  // Step 1 — equipment
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [equipSearch, setEquipSearch] = useState('');
  const [selectedEquipment, setSelectedEquipment] = useState<Equipment | null>(null);
  const [freeTextName, setFreeTextName] = useState('');
  const [useFreeName, setUseFreeName] = useState(false);
  const [equipLoading, setEquipLoading] = useState(true);

  // Step 2 — description + photo
  const [description, setDescription] = useState('');
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);
  const [photoUploading, setPhotoUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Step 3 — priority + submit
  const [priority, setPriority] = useState<Priority>('medium');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState('');

  // ── Auth guard ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const user = getCurrentUser();
    if (!user) { router.replace('/login'); return; }
    if (!ALLOWED_ROLES.includes(user.role)) { router.replace('/dashboard'); return; }
    setAuthChecked(true);
  }, [router]);

  // ── Load equipment list ─────────────────────────────────────────────────────
  const loadEquipment = useCallback(async () => {
    setEquipLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const res = await fetch('/api/admin/equipment?limit=200', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (res.ok) {
        const j = await res.json();
        setEquipment(j.data ?? []);
      }
    } catch { /* silent */ }
    finally { setEquipLoading(false); }
  }, []);

  useEffect(() => { if (authChecked) loadEquipment(); }, [authChecked, loadEquipment]);

  // ── Photo upload ────────────────────────────────────────────────────────────
  async function handlePhotoSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoUploading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const ext = file.name.split('.').pop() ?? 'jpg';
      const path = `maintenance/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

      const { error: upErr } = await supabase.storage
        .from('maintenance-photos')
        .upload(path, file, { contentType: file.type, upsert: false });

      if (upErr) throw upErr;

      const { data: signed } = await supabase.storage
        .from('maintenance-photos')
        .createSignedUrl(path, 60 * 60 * 24 * 30); // 30-day URL

      if (signed?.signedUrl) {
        setPhotoUrls(prev => [...prev, signed.signedUrl]);
      }
    } catch (err: any) {
      console.error('Photo upload failed:', err);
    } finally {
      setPhotoUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  // ── Submit ──────────────────────────────────────────────────────────────────
  async function handleSubmit() {
    if (!description.trim()) return;
    setSubmitting(true);
    setSubmitError('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Session expired');

      const body: Record<string, unknown> = {
        description: description.trim(),
        priority,
        photo_urls: photoUrls,
      };

      if (selectedEquipment && !useFreeName) {
        body.equipment_id = selectedEquipment.id;
        body.equipment_name = selectedEquipment.name + (selectedEquipment.unit_number ? ` #${selectedEquipment.unit_number}` : '');
      } else if (useFreeName && freeTextName.trim()) {
        body.equipment_name = freeTextName.trim();
      }

      const res = await fetch('/api/maintenance-requests', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(body),
      });

      const j = await res.json();
      if (!res.ok) throw new Error(j.error || 'Submission failed');

      setSubmitted(true);
    } catch (err: any) {
      setSubmitError(err.message || 'Failed to submit. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  // ── Derived ─────────────────────────────────────────────────────────────────
  const filteredEquipment = equipment.filter(e => {
    const q = equipSearch.toLowerCase();
    return (
      e.name.toLowerCase().includes(q) ||
      (e.unit_number ?? '').toLowerCase().includes(q)
    );
  });

  const step1Valid = useFreeName ? freeTextName.trim().length > 0 : selectedEquipment !== null;
  const step2Valid = description.trim().length > 0;

  if (!authChecked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-slate-900">
        <Loader2 className="w-8 h-8 animate-spin text-violet-500" />
      </div>
    );
  }

  // ── Success screen ──────────────────────────────────────────────────────────
  if (submitted) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-slate-900 flex items-center justify-center p-4">
        <div className="max-w-sm w-full text-center space-y-5">
          <div className="w-20 h-20 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-10 h-10 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Request Submitted!</h1>
            <p className="text-sm text-gray-500 dark:text-slate-400 mt-2">
              Your shop manager has been notified and will triage this issue.
            </p>
          </div>
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-violet-600 hover:bg-violet-700 text-white font-semibold text-sm transition-colors min-h-[44px]"
          >
            <Home className="w-4 h-4" />
            Back to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-900 p-4 sm:p-6 pb-10">
      <div className="max-w-lg mx-auto space-y-5">

        {/* Back nav */}
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1.5 text-sm text-gray-600 dark:text-slate-300 hover:text-violet-600 dark:hover:text-violet-400 min-h-[44px]"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to dashboard
        </Link>

        {/* Header card */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-violet-600 via-purple-600 to-indigo-700 p-5 sm:p-6 shadow-xl shadow-violet-500/30 text-white">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center ring-1 ring-white/30 flex-shrink-0">
              <Wrench className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold">Report Equipment Issue</h1>
              <p className="text-sm text-white/75 mt-0.5">Notify the shop manager</p>
            </div>
          </div>
        </div>

        {/* Progress bar */}
        <div className="flex items-center gap-2">
          {[1, 2, 3].map(s => (
            <div key={s} className="flex-1">
              <div className={`h-2 rounded-full transition-all ${s <= step ? 'bg-violet-600' : 'bg-gray-200 dark:bg-slate-700'}`} />
              <p className={`text-xs mt-1 text-center font-medium ${s === step ? 'text-violet-600 dark:text-violet-400' : 'text-gray-400 dark:text-slate-500'}`}>
                {s === 1 ? 'Equipment' : s === 2 ? 'Issue' : 'Priority'}
              </p>
            </div>
          ))}
        </div>

        {/* ── Step 1: Which equipment? ─────────────────────────────────────── */}
        {step === 1 && (
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-700 p-5 space-y-4">
            <h2 className="text-base font-semibold text-gray-900 dark:text-white">Which equipment has an issue?</h2>

            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={equipSearch}
                onChange={e => setEquipSearch(e.target.value)}
                placeholder="Search by name or unit #..."
                className="w-full pl-9 pr-4 py-3 rounded-xl border border-gray-200 dark:border-slate-600 bg-gray-50 dark:bg-slate-900 text-base sm:text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500"
              />
            </div>

            {/* Equipment list */}
            {!useFreeName && (
              <div className="max-h-64 overflow-y-auto space-y-1.5 -mx-1 px-1">
                {equipLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-5 h-5 animate-spin text-violet-500" />
                  </div>
                ) : filteredEquipment.length === 0 ? (
                  <p className="text-sm text-gray-400 dark:text-slate-500 text-center py-6">
                    {equipment.length === 0 ? 'No equipment on file.' : 'No matches found.'}
                  </p>
                ) : (
                  filteredEquipment.map(eq => (
                    <button
                      key={eq.id}
                      onClick={() => setSelectedEquipment(eq)}
                      className={`w-full text-left px-4 py-3 rounded-xl border transition-all min-h-[44px] ${
                        selectedEquipment?.id === eq.id
                          ? 'border-violet-500 bg-violet-50 dark:bg-violet-900/30 ring-2 ring-violet-500/40'
                          : 'border-gray-200 dark:border-slate-600 bg-gray-50 dark:bg-slate-900 hover:border-violet-300 dark:hover:border-violet-700'
                      }`}
                    >
                      <p className="text-sm font-semibold text-gray-900 dark:text-white">{eq.name}</p>
                      {eq.unit_number && (
                        <p className="text-xs text-gray-500 dark:text-slate-400">Unit #{eq.unit_number}</p>
                      )}
                    </button>
                  ))
                )}
              </div>
            )}

            {/* Divider */}
            <div className="flex items-center gap-3">
              <div className="flex-1 h-px bg-gray-200 dark:bg-slate-600" />
              <span className="text-xs text-gray-400 dark:text-slate-500">OR</span>
              <div className="flex-1 h-px bg-gray-200 dark:bg-slate-600" />
            </div>

            {/* Free-text toggle */}
            <button
              onClick={() => { setUseFreeName(v => !v); setSelectedEquipment(null); }}
              className={`w-full text-left px-4 py-3 rounded-xl border transition-all min-h-[44px] text-sm ${
                useFreeName
                  ? 'border-violet-500 bg-violet-50 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300'
                  : 'border-gray-200 dark:border-slate-600 bg-gray-50 dark:bg-slate-900 text-gray-700 dark:text-slate-300 hover:border-violet-300 dark:hover:border-violet-700'
              }`}
            >
              <span className="flex items-center gap-2">
                <ChevronDown className={`w-4 h-4 transition-transform ${useFreeName ? 'rotate-180' : ''}`} />
                Don't know the unit number? Describe it instead
              </span>
            </button>

            {useFreeName && (
              <input
                type="text"
                value={freeTextName}
                onChange={e => setFreeTextName(e.target.value)}
                placeholder="e.g. 'Big blue slab saw near dock 2'"
                className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-slate-600 bg-gray-50 dark:bg-slate-900 text-base sm:text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500"
                autoFocus
              />
            )}

            <button
              onClick={() => setStep(2)}
              disabled={!step1Valid}
              className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-violet-600 hover:bg-violet-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold text-sm transition-colors min-h-[44px]"
            >
              Next: Describe the issue
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* ── Step 2: What's wrong? ────────────────────────────────────────── */}
        {step === 2 && (
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-700 p-5 space-y-4">
            {/* Selected equipment reminder */}
            <div className="flex items-center gap-2 p-3 rounded-xl bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-800/50">
              <Wrench className="w-4 h-4 text-violet-600 dark:text-violet-400 flex-shrink-0" />
              <p className="text-sm font-medium text-violet-700 dark:text-violet-300 truncate">
                {useFreeName
                  ? freeTextName
                  : selectedEquipment?.name + (selectedEquipment?.unit_number ? ` #${selectedEquipment.unit_number}` : '')}
              </p>
            </div>

            <h2 className="text-base font-semibold text-gray-900 dark:text-white">What's wrong?</h2>

            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Describe the issue in detail... (e.g. 'Blade wobbles at high RPM, making a grinding noise')"
              rows={5}
              className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-slate-600 bg-gray-50 dark:bg-slate-900 text-base sm:text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500 resize-none"
              autoFocus
            />

            {/* Photo capture */}
            <div>
              <p className="text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">Add a photo (optional)</p>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handlePhotoSelect}
                className="hidden"
              />

              {photoUrls.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-2">
                  {photoUrls.map((url, i) => (
                    <img
                      key={i}
                      src={url}
                      alt={`Photo ${i + 1}`}
                      className="w-16 h-16 rounded-lg object-cover border border-gray-200 dark:border-slate-600"
                    />
                  ))}
                </div>
              )}

              <button
                onClick={() => fileRef.current?.click()}
                disabled={photoUploading}
                className="flex items-center gap-2 px-4 py-3 rounded-xl border-2 border-dashed border-gray-300 dark:border-slate-600 hover:border-violet-400 dark:hover:border-violet-600 text-sm text-gray-600 dark:text-slate-400 hover:text-violet-600 dark:hover:text-violet-400 transition-colors w-full justify-center min-h-[44px]"
              >
                {photoUploading ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Uploading...</>
                ) : (
                  <><Camera className="w-4 h-4" /> {photoUrls.length > 0 ? 'Add another photo' : 'Take or upload a photo'}</>
                )}
              </button>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setStep(1)}
                className="flex items-center gap-1.5 px-4 py-3 rounded-xl border border-gray-200 dark:border-slate-600 text-sm text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors min-h-[44px]"
              >
                <ArrowLeft className="w-4 h-4" />
                Back
              </button>
              <button
                onClick={() => setStep(3)}
                disabled={!step2Valid}
                className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-violet-600 hover:bg-violet-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold text-sm transition-colors min-h-[44px]"
              >
                Next: Set priority
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* ── Step 3: Priority + Submit ────────────────────────────────────── */}
        {step === 3 && (
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-700 p-5 space-y-5">
            <h2 className="text-base font-semibold text-gray-900 dark:text-white">How urgent is this?</h2>

            <div className="grid grid-cols-2 gap-3">
              {(Object.entries(PRIORITY_CONFIG) as [Priority, typeof PRIORITY_CONFIG[Priority]][]).map(([key, cfg]) => (
                <button
                  key={key}
                  onClick={() => setPriority(key)}
                  className={`flex flex-col items-center justify-center gap-1.5 p-4 rounded-xl border-2 transition-all min-h-[80px] ${
                    priority === key
                      ? `${cfg.bg} ${cfg.ring} ring-2 border-transparent`
                      : 'border-gray-200 dark:border-slate-600 hover:border-gray-300 dark:hover:border-slate-500'
                  }`}
                >
                  <span className={`text-base font-bold ${cfg.color}`}>{cfg.label}</span>
                  <span className="text-xs text-gray-500 dark:text-slate-400 text-center">
                    {key === 'low' && 'Not urgent'}
                    {key === 'medium' && 'Fix soon'}
                    {key === 'high' && 'Fix today'}
                    {key === 'critical' && 'Safety issue'}
                  </span>
                </button>
              ))}
            </div>

            {/* Summary */}
            <div className="p-4 rounded-xl bg-gray-50 dark:bg-slate-900/50 border border-gray-200 dark:border-slate-700 space-y-2 text-sm">
              <p className="text-xs uppercase tracking-wide font-semibold text-gray-400 dark:text-slate-500">Review</p>
              <p className="text-gray-700 dark:text-slate-300">
                <span className="font-medium">Equipment:</span>{' '}
                {useFreeName ? freeTextName : (selectedEquipment?.name ?? '—') + (selectedEquipment?.unit_number ? ` #${selectedEquipment.unit_number}` : '')}
              </p>
              <p className="text-gray-700 dark:text-slate-300 line-clamp-2">
                <span className="font-medium">Issue:</span> {description}
              </p>
              {photoUrls.length > 0 && (
                <p className="text-gray-500 dark:text-slate-400">{photoUrls.length} photo{photoUrls.length !== 1 ? 's' : ''} attached</p>
              )}
            </div>

            {submitError && (
              <div className="flex items-start gap-2 p-3 rounded-xl bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800/50 text-sm text-rose-700 dark:text-rose-300">
                <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                {submitError}
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => setStep(2)}
                className="flex items-center gap-1.5 px-4 py-3 rounded-xl border border-gray-200 dark:border-slate-600 text-sm text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors min-h-[44px]"
              >
                <ArrowLeft className="w-4 h-4" />
                Back
              </button>
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white font-semibold text-sm transition-colors min-h-[44px]"
              >
                {submitting ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Submitting...</>
                ) : (
                  'Submit Report'
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
