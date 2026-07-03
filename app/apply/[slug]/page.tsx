'use client';

export const dynamic = 'force-dynamic';

/**
 * /apply/[slug] — PUBLIC candidate application (Hireline-style).
 *
 * Mobile-first: candidates apply on their phones. Clean single column —
 * job header → stepped form (contact → screeners → optional resume) →
 * one submit. The success screen is IDENTICAL for auto-rejected candidates
 * (never reveal auto-rejection). All fixed UI strings render in Spanish when
 * the job's language is 'es' (inline dictionary — no i18n lib).
 *
 * Data: GET /api/hiring/public/jobs/[slug] (active jobs only; built by the
 * parallel API builder), POST /api/hiring/public/apply, resume via
 * POST /api/hiring/public/resume → resume_path.
 */

import { useState, useEffect, useMemo, useRef } from 'react';
import { useParams } from 'next/navigation';
import {
  MapPin,
  Clock,
  DollarSign,
  CheckCircle2,
  Check,
  Paperclip,
  X,
  ChevronLeft,
  Loader2,
  Briefcase,
} from 'lucide-react';

// ─── Types (tolerant of the public API's exact shape) ───────────────────────

interface PublicJob {
  title: string;
  description?: string | null;
  location?: string | null;
  pay_min?: number | null;
  pay_max?: number | null;
  pay_period?: string | null;
  schedule_text?: string | null;
  requirements?: string[];
  benefits?: string[];
  language?: string;
  slug?: string;
  company_name?: string | null;
  tenant_name?: string | null;
  company_logo_url?: string | null;
}

interface PublicScreener {
  id: string;
  position?: number;
  question: string;
  qtype: 'free_response' | 'single_choice';
  options?: string[];
  required?: boolean;
  is_followup?: boolean;
}

// ─── Fixed UI strings (en/es keyed by job.language) ─────────────────────────

const STRINGS = {
  en: {
    loading: 'Loading…',
    closedTitle: 'This position is no longer accepting applications',
    closedBody: 'The role may have been filled or paused. Check back later for new openings.',
    stepOf: (a: number, b: number) => `Step ${a} of ${b}`,
    contactTitle: 'How can we reach you?',
    fullNameQ: 'What is your full name?',
    phoneQ: 'What phone number should we use to contact you? We may contact you by text or call.',
    emailQ: 'What email should we use to contact you?',
    fullNamePh: 'First and last name',
    phonePh: '(555) 555-1234',
    emailPh: 'you@example.com',
    questionsTitle: 'A few quick questions',
    answerPh: 'Type your answer…',
    resumeTitle: 'Resume (optional)',
    resumeHint: 'PDF, Word, or a photo — max 10MB. You can skip this.',
    resumeButton: 'Attach a resume',
    remove: 'Remove',
    next: 'Next',
    back: 'Back',
    submit: 'Submit application',
    submitting: 'Submitting…',
    successTitle: 'Application received',
    successBody: (c: string | null) =>
      c ? `${c} will reach out.` : 'The hiring team will reach out.',
    requiredErr: 'This field is required.',
    emailErr: 'Please enter a valid email.',
    phoneErr: 'Please enter a valid phone number.',
    fileTypeErr: 'Please upload a PDF, Word document, or image.',
    fileSizeErr: 'That file is over 10MB. Please choose a smaller one.',
    submitErr: 'Something went wrong sending your application. Please try again.',
    pay: 'Pay',
    schedule: 'Schedule',
    aboutRole: 'About this job',
    requirements: 'Requirements',
    benefits: 'Benefits',
    perHour: '/hr',
    perDay: '/day',
    perWeek: '/wk',
    perYear: '/yr',
    perProject: '/project',
    from: 'From',
  },
  es: {
    loading: 'Cargando…',
    closedTitle: 'Esta posición ya no acepta solicitudes',
    closedBody: 'Es posible que el puesto se haya cubierto o pausado. Vuelve pronto para ver nuevas vacantes.',
    stepOf: (a: number, b: number) => `Paso ${a} de ${b}`,
    contactTitle: '¿Cómo podemos contactarte?',
    fullNameQ: '¿Cuál es tu nombre completo?',
    phoneQ: '¿A qué número de teléfono podemos contactarte? Podemos comunicarnos por mensaje de texto o llamada.',
    emailQ: '¿Qué correo electrónico debemos usar para contactarte?',
    fullNamePh: 'Nombre y apellido',
    phonePh: '(555) 555-1234',
    emailPh: 'tu@ejemplo.com',
    questionsTitle: 'Unas preguntas rápidas',
    answerPh: 'Escribe tu respuesta…',
    resumeTitle: 'Currículum (opcional)',
    resumeHint: 'PDF, Word o una foto — máx. 10MB. Puedes omitir este paso.',
    resumeButton: 'Adjuntar currículum',
    remove: 'Quitar',
    next: 'Siguiente',
    back: 'Atrás',
    submit: 'Enviar solicitud',
    submitting: 'Enviando…',
    successTitle: 'Solicitud recibida',
    successBody: (c: string | null) =>
      c ? `${c} se pondrá en contacto contigo.` : 'El equipo de contratación se pondrá en contacto contigo.',
    requiredErr: 'Este campo es obligatorio.',
    emailErr: 'Ingresa un correo electrónico válido.',
    phoneErr: 'Ingresa un número de teléfono válido.',
    fileTypeErr: 'Sube un PDF, documento de Word o imagen.',
    fileSizeErr: 'Ese archivo pesa más de 10MB. Elige uno más pequeño.',
    submitErr: 'Ocurrió un error al enviar tu solicitud. Inténtalo de nuevo.',
    pay: 'Pago',
    schedule: 'Horario',
    aboutRole: 'Sobre este trabajo',
    requirements: 'Requisitos',
    benefits: 'Beneficios',
    perHour: '/hora',
    perDay: '/día',
    perWeek: '/sem',
    perYear: '/año',
    perProject: '/proyecto',
    from: 'Desde',
  },
} as const;

type Dict = (typeof STRINGS)['en'];

const MAX_RESUME_BYTES = 10 * 1024 * 1024;
const RESUME_EXT_RE = /\.(pdf|doc|docx|jpe?g|png|webp|heic|heif)$/i;

function money(n: number): string {
  return `$${Number(n).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
}

function payText(job: PublicJob, L: Dict): string | null {
  const period =
    job.pay_period === 'year' ? L.perYear
    : job.pay_period === 'week' ? L.perWeek
    : job.pay_period === 'day' ? L.perDay
    : job.pay_period === 'project' ? L.perProject
    : L.perHour;
  if (job.pay_min != null && job.pay_max != null) {
    if (job.pay_min === job.pay_max) return `${money(job.pay_min)}${period}`;
    return `${money(job.pay_min)}–${money(job.pay_max)}${period}`;
  }
  if (job.pay_min != null) return `${L.from} ${money(job.pay_min)}${period}`;
  if (job.pay_max != null) return `${money(job.pay_max)}${period}`;
  return null;
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function ApplyPage() {
  const params = useParams<{ slug: string }>();
  const slug = typeof params?.slug === 'string' ? params.slug : '';

  const [loading, setLoading] = useState(true);
  const [closed, setClosed] = useState(false);
  const [job, setJob] = useState<PublicJob | null>(null);
  const [screeners, setScreeners] = useState<PublicScreener[]>([]);

  // form state
  const [step, setStep] = useState(0); // 0 contact · 1 questions · 2 resume/submit
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const topRef = useRef<HTMLDivElement | null>(null);

  const L: Dict = job?.language === 'es' ? (STRINGS.es as unknown as Dict) : STRINGS.en;

  const companyName: string | null = job?.company_name || job?.tenant_name || null;

  const visibleScreeners = useMemo(
    () =>
      screeners
        .filter((q) => !q.is_followup)
        .sort((a, b) => (a.position ?? 0) - (b.position ?? 0)),
    [screeners]
  );

  const totalSteps = visibleScreeners.length > 0 ? 3 : 2;

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/hiring/public/jobs/${encodeURIComponent(slug)}`);
        if (!res.ok) {
          if (!cancelled) setClosed(true);
          return;
        }
        const json = await res.json();
        const j: PublicJob | undefined = json?.data?.job;
        if (!j?.title) {
          if (!cancelled) setClosed(true);
          return;
        }
        if (!cancelled) {
          setJob(j);
          setScreeners(Array.isArray(json?.data?.screeners) ? json.data.screeners : []);
        }
      } catch {
        if (!cancelled) setClosed(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  const scrollTop = () => topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  // ── validation ──
  function validateContact(): boolean {
    const e: Record<string, string> = {};
    if (!fullName.trim()) e.fullName = L.requiredErr;
    const digits = phone.replace(/\D/g, '');
    if (digits.length < 7) e.phone = L.phoneErr;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) e.email = L.emailErr;
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function validateQuestions(): boolean {
    const e: Record<string, string> = {};
    for (const q of visibleScreeners) {
      if ((q.required ?? true) && !(answers[q.id] ?? '').trim()) e[q.id] = L.requiredErr;
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function onPickFile(f: File | null) {
    setErrors((prev) => ({ ...prev, resume: '' }));
    if (!f) {
      setResumeFile(null);
      return;
    }
    if (f.size > MAX_RESUME_BYTES) {
      setErrors((prev) => ({ ...prev, resume: L.fileSizeErr }));
      return;
    }
    if (!RESUME_EXT_RE.test(f.name) && !f.type.startsWith('image/') && f.type !== 'application/pdf') {
      setErrors((prev) => ({ ...prev, resume: L.fileTypeErr }));
      return;
    }
    setResumeFile(f);
  }

  function goNext() {
    if (step === 0) {
      if (!validateContact()) return;
      setStep(visibleScreeners.length > 0 ? 1 : 2);
    } else if (step === 1) {
      if (!validateQuestions()) return;
      setStep(2);
    }
    scrollTop();
  }

  function goBack() {
    setSubmitError(null);
    if (step === 2) setStep(visibleScreeners.length > 0 ? 1 : 0);
    else if (step === 1) setStep(0);
    scrollTop();
  }

  async function handleSubmit() {
    if (submitting) return;
    if (!validateContact()) {
      setStep(0);
      scrollTop();
      return;
    }
    if (visibleScreeners.length > 0 && !validateQuestions()) {
      setStep(1);
      scrollTop();
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      // 1. optional resume upload → storage path
      let resumePath: string | null = null;
      if (resumeFile) {
        const fd = new FormData();
        fd.append('file', resumeFile);
        fd.append('slug', slug);
        const upRes = await fetch('/api/hiring/public/resume', { method: 'POST', body: fd });
        const upJson = await upRes.json().catch(() => null);
        if (upRes.ok && upJson?.data?.path) {
          resumePath = upJson.data.path;
        }
        // Resume is optional — a failed upload never blocks the application.
      }

      // 2. the application itself
      const res = await fetch('/api/hiring/public/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug,
          full_name: fullName.trim(),
          phone: phone.trim(),
          email: email.trim().toLowerCase(),
          language: job?.language || 'en',
          resume_path: resumePath,
          answers: visibleScreeners.map((q) => ({
            question_id: q.id,
            answer: (answers[q.id] ?? '').trim(),
          })),
        }),
      });
      if (!res.ok) {
        setSubmitError(L.submitErr);
        return;
      }
      // Identical success screen whether auto-rejected or not — by design.
      setSubmitted(true);
      scrollTop();
    } catch {
      setSubmitError(L.submitErr);
    } finally {
      setSubmitting(false);
    }
  }

  // ── render states ──

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
        <div className="flex items-center gap-3 text-slate-500">
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
          <span className="text-base">{STRINGS.en.loading}</span>
        </div>
      </main>
    );
  }

  if (closed || !job) {
    return (
      <main className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
        <div className="w-full max-w-md rounded-2xl bg-white ring-1 ring-slate-200 p-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100">
            <Briefcase className="h-6 w-6 text-slate-400" aria-hidden />
          </div>
          <h1 className="text-lg font-semibold text-slate-900">{STRINGS.en.closedTitle}</h1>
          <p className="mt-2 text-sm text-slate-500">{STRINGS.es.closedTitle}.</p>
          <p className="mt-4 text-sm text-slate-500">{STRINGS.en.closedBody}</p>
        </div>
      </main>
    );
  }

  if (submitted) {
    return (
      <main className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
        <div className="w-full max-w-md rounded-2xl bg-white ring-1 ring-slate-200 p-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100">
            <CheckCircle2 className="h-8 w-8 text-emerald-600" aria-hidden />
          </div>
          <h1 className="text-xl font-semibold text-slate-900">{L.successTitle}</h1>
          <p className="mt-2 text-base text-slate-600">{L.successBody(companyName)}</p>
        </div>
      </main>
    );
  }

  const pay = payText(job, L);
  const stepNumber = step === 0 ? 1 : step === 1 ? 2 : totalSteps;

  const inputClass = (hasError: boolean) =>
    `w-full rounded-xl border px-4 py-3 text-base text-slate-900 placeholder-slate-400 bg-white outline-none transition focus:ring-2 focus:ring-violet-500 focus:border-violet-500 ${
      hasError ? 'border-rose-400' : 'border-slate-300'
    }`;

  return (
    <main className="min-h-screen bg-slate-50">
      <div ref={topRef} className="mx-auto w-full max-w-lg px-4 py-6 sm:py-10">
        {/* ── Job header ── */}
        <header className="rounded-2xl bg-white ring-1 ring-slate-200 p-5 sm:p-6">
          {companyName && (
            <p className="text-sm font-medium text-violet-700">{companyName}</p>
          )}
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">{job.title}</h1>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-sm text-slate-600">
            {job.location && (
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="h-4 w-4 text-slate-400" aria-hidden />
                {job.location}
              </span>
            )}
            {pay && (
              <span className="inline-flex items-center gap-1.5 font-medium text-emerald-700">
                <DollarSign className="h-4 w-4" aria-hidden />
                {pay}
              </span>
            )}
            {job.schedule_text && (
              <span className="inline-flex items-center gap-1.5">
                <Clock className="h-4 w-4 text-slate-400" aria-hidden />
                {job.schedule_text}
              </span>
            )}
          </div>

          {(job.requirements?.length || 0) > 0 && (
            <ul className="mt-4 space-y-1.5">
              {job.requirements!.slice(0, 6).map((r, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-slate-700">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden />
                  <span>{r}</span>
                </li>
              ))}
            </ul>
          )}

          {job.description && (
            <details className="mt-4 group">
              <summary className="cursor-pointer select-none text-sm font-medium text-violet-700">
                {L.aboutRole}
              </summary>
              <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-slate-600">
                {job.description}
              </p>
              {(job.benefits?.length || 0) > 0 && (
                <div className="mt-3">
                  <p className="text-sm font-semibold text-slate-800">{L.benefits}</p>
                  <ul className="mt-1 list-disc pl-5 text-sm text-slate-600">
                    {job.benefits!.map((b, i) => (
                      <li key={i}>{b}</li>
                    ))}
                  </ul>
                </div>
              )}
            </details>
          )}
        </header>

        {/* ── Step indicator ── */}
        <div className="mt-6 flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            {L.stepOf(stepNumber, totalSteps)}
          </p>
          <div className="flex gap-1.5" aria-hidden>
            {Array.from({ length: totalSteps }).map((_, i) => (
              <span
                key={i}
                className={`h-1.5 w-6 rounded-full ${i < stepNumber ? 'bg-violet-600' : 'bg-slate-200'}`}
              />
            ))}
          </div>
        </div>

        {/* ── Form card ── */}
        <section className="mt-3 rounded-2xl bg-white ring-1 ring-slate-200 p-5 sm:p-6">
          {step === 0 && (
            <div className="space-y-5">
              <h2 className="text-lg font-semibold text-slate-900">{L.contactTitle}</h2>

              <div>
                <label htmlFor="apply-name" className="block text-sm font-medium text-slate-800">
                  {L.fullNameQ}
                </label>
                <input
                  id="apply-name"
                  type="text"
                  autoComplete="name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder={L.fullNamePh}
                  className={`mt-2 ${inputClass(!!errors.fullName)}`}
                />
                {errors.fullName && <p className="mt-1 text-sm text-rose-600">{errors.fullName}</p>}
              </div>

              <div>
                <label htmlFor="apply-phone" className="block text-sm font-medium text-slate-800">
                  {L.phoneQ}
                </label>
                <input
                  id="apply-phone"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder={L.phonePh}
                  className={`mt-2 ${inputClass(!!errors.phone)}`}
                />
                {errors.phone && <p className="mt-1 text-sm text-rose-600">{errors.phone}</p>}
              </div>

              <div>
                <label htmlFor="apply-email" className="block text-sm font-medium text-slate-800">
                  {L.emailQ}
                </label>
                <input
                  id="apply-email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={L.emailPh}
                  className={`mt-2 ${inputClass(!!errors.email)}`}
                />
                {errors.email && <p className="mt-1 text-sm text-rose-600">{errors.email}</p>}
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-6">
              <h2 className="text-lg font-semibold text-slate-900">{L.questionsTitle}</h2>
              {visibleScreeners.map((q, idx) => (
                <div key={q.id}>
                  <p className="text-sm font-medium text-slate-800">
                    {idx + 1}. {q.question}
                  </p>
                  {q.qtype === 'single_choice' ? (
                    <div className="mt-3 space-y-2" role="radiogroup" aria-label={q.question}>
                      {(q.options || []).map((opt) => {
                        const selected = answers[q.id] === opt;
                        return (
                          <button
                            key={opt}
                            type="button"
                            role="radio"
                            aria-checked={selected}
                            onClick={() => {
                              setAnswers((prev) => ({ ...prev, [q.id]: opt }));
                              setErrors((prev) => ({ ...prev, [q.id]: '' }));
                            }}
                            className={`flex w-full min-h-[52px] items-center justify-between rounded-xl border px-4 py-3 text-left text-base transition ${
                              selected
                                ? 'border-violet-600 bg-violet-50 text-violet-900 ring-1 ring-violet-600'
                                : 'border-slate-300 bg-white text-slate-800 active:bg-slate-50'
                            }`}
                          >
                            <span>{opt}</span>
                            {selected && <Check className="h-5 w-5 shrink-0 text-violet-600" aria-hidden />}
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <textarea
                      value={answers[q.id] ?? ''}
                      onChange={(e) => {
                        setAnswers((prev) => ({ ...prev, [q.id]: e.target.value }));
                        setErrors((prev) => ({ ...prev, [q.id]: '' }));
                      }}
                      placeholder={L.answerPh}
                      rows={3}
                      className={`mt-3 ${inputClass(!!errors[q.id])} resize-y`}
                    />
                  )}
                  {errors[q.id] && <p className="mt-1 text-sm text-rose-600">{errors[q.id]}</p>}
                </div>
              ))}
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-slate-900">{L.resumeTitle}</h2>
              <p className="text-sm text-slate-500">{L.resumeHint}</p>

              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.doc,.docx,image/*"
                className="hidden"
                onChange={(e) => onPickFile(e.target.files?.[0] ?? null)}
              />

              {resumeFile ? (
                <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-300 bg-slate-50 px-4 py-3">
                  <span className="flex min-w-0 items-center gap-2 text-sm text-slate-800">
                    <Paperclip className="h-4 w-4 shrink-0 text-slate-500" aria-hidden />
                    <span className="truncate">{resumeFile.name}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setResumeFile(null);
                      if (fileInputRef.current) fileInputRef.current.value = '';
                    }}
                    className="inline-flex min-h-[44px] items-center gap-1 rounded-lg px-2 text-sm font-medium text-rose-600"
                  >
                    <X className="h-4 w-4" aria-hidden />
                    {L.remove}
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex w-full min-h-[52px] items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 px-4 py-3 text-base font-medium text-slate-600 transition active:bg-slate-50"
                >
                  <Paperclip className="h-5 w-5" aria-hidden />
                  {L.resumeButton}
                </button>
              )}
              {errors.resume && <p className="text-sm text-rose-600">{errors.resume}</p>}

              {submitError && (
                <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{submitError}</p>
              )}
            </div>
          )}

          {/* ── Nav buttons ── */}
          <div className="mt-6 flex items-center gap-3">
            {step > 0 && (
              <button
                type="button"
                onClick={goBack}
                disabled={submitting}
                className="inline-flex min-h-[48px] items-center gap-1 rounded-xl px-4 text-base font-medium text-slate-600 ring-1 ring-slate-300 transition active:bg-slate-50 disabled:opacity-50"
              >
                <ChevronLeft className="h-5 w-5" aria-hidden />
                {L.back}
              </button>
            )}
            {step < 2 ? (
              <button
                type="button"
                onClick={goNext}
                className="flex-1 min-h-[48px] rounded-xl bg-violet-600 px-4 text-base font-semibold text-white transition active:bg-violet-700"
              >
                {L.next}
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSubmit}
                disabled={submitting}
                className="flex-1 inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 text-base font-semibold text-white transition active:bg-violet-700 disabled:opacity-60"
              >
                {submitting && <Loader2 className="h-5 w-5 animate-spin" aria-hidden />}
                {submitting ? L.submitting : L.submit}
              </button>
            )}
          </div>
        </section>

        <p className="mt-6 text-center text-xs text-slate-400">
          Powered by Pontifex Industries
        </p>
      </div>
    </main>
  );
}
