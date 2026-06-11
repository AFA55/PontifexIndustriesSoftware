'use client';

export const dynamic = 'force-dynamic';

/**
 * /setup-account?token=xxx
 * Public page — no auth required. Guides a newly invited user through a
 * 4-step onboarding sequence:
 *   1. Your photo (optional, skippable)
 *   2. About you — nickname + phone + notification preferences (all optional)
 *   3. Platform agreement (liability waiver — required)
 *   4. Create password → submit → success → redirect to /login?tenant_id=...
 *
 * Mobile-first: field workers complete this on phones (44px targets, 16px inputs).
 */

import { useState, useEffect, useRef, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import {
  Camera, CheckCircle, FileText, Loader2, ArrowLeft, ArrowRight,
  User, Phone, Lock, Eye, EyeOff, Mail, MessageSquare, AlertTriangle,
} from 'lucide-react';

interface InvitationData {
  email: string;
  name: string | null;
  role: string;
  tenantId: string;
  tenantName: string;
  companyCode: string;
  token: string;
  alreadySetup: boolean;
}

const STEPS = [
  { label: 'Your photo', icon: Camera },
  { label: 'About you', icon: User },
  { label: 'Agreement', icon: FileText },
  { label: 'Password', icon: Lock },
] as const;

/** Format a US phone number as the user types: (864) 555-1234 */
function formatPhoneInput(raw: string): string {
  let digits = raw.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) digits = digits.slice(1);
  digits = digits.slice(0, 10);
  if (digits.length === 0) return '';
  if (digits.length <= 3) return `(${digits}`;
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

function phoneDigits(formatted: string): string {
  let d = formatted.replace(/\D/g, '');
  if (d.length === 11 && d.startsWith('1')) d = d.slice(1);
  return d;
}

/** 0–3 password strength: length + character variety */
function passwordStrength(pw: string): { score: 0 | 1 | 2 | 3; label: string } {
  if (pw.length < 8) return { score: 0, label: 'At least 8 characters' };
  let variety = 0;
  if (/[a-z]/.test(pw)) variety++;
  if (/[A-Z]/.test(pw)) variety++;
  if (/\d/.test(pw)) variety++;
  if (/[^a-zA-Z0-9]/.test(pw)) variety++;
  if (pw.length >= 12 && variety >= 3) return { score: 3, label: 'Strong password' };
  if (pw.length >= 10 || variety >= 3) return { score: 2, label: 'Good password' };
  return { score: 1, label: 'Okay — longer is stronger' };
}

const inputClasses = `w-full rounded-xl px-4 py-3 transition-colors min-h-[44px] text-base
  bg-white border border-slate-200 text-slate-900 placeholder-slate-400
  focus:border-violet-400 focus:ring-2 focus:ring-violet-100 focus:outline-none
  dark:bg-white/5 dark:border-white/10 dark:text-white dark:placeholder-white/40
  dark:focus:border-violet-400/60 dark:focus:ring-violet-500/20`;

// Inner component that uses useSearchParams (must be wrapped in Suspense)
function SetupAccountInner() {
  const params = useSearchParams();
  const router = useRouter();
  const token = params.get('token');

  // 0=loading, -1=error, 1-4=steps, 5=success
  const [step, setStep] = useState<-1 | 0 | 1 | 2 | 3 | 4 | 5>(0);
  const [invitation, setInvitation] = useState<InvitationData | null>(null);
  const [error, setError] = useState('');

  // Form state
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState('');
  const [nickname, setNickname] = useState('');
  const [phone, setPhone] = useState('');
  const [emailConsent, setEmailConsent] = useState(true);
  const [smsConsent, setSmsConsent] = useState(false);
  const [waiverSigned, setWaiverSigned] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!token) {
      setError('No invitation token found in the URL. Please use the link from your invitation email.');
      setStep(-1);
      return;
    }


    fetch(`/api/setup-account/validate?token=${encodeURIComponent(token)}`)
      .then(r => r.json())
      .then(json => {
        if (!json.success) {
          setError(json.error || 'Invalid or expired invitation link.');
          setStep(-1);
        } else {
          const data: InvitationData = { ...json.data, token };
          setInvitation(data);
          if (data.alreadySetup) {
            setError('This account has already been set up. Please log in.');
            setStep(-1);
          } else {
            setStep(1);
          }
        }
      })
      .catch(() => {
        setError('Failed to validate invitation. Please try again or contact your administrator.');
        setStep(-1);
      });
  }, [token]);

  const firstName =
    invitation?.name?.split(' ')[0] ||
    nickname.trim() ||
    null;

  const goToLogin = () => {
    if (invitation?.tenantId) {
      // Seed the one-tap "Continue to {Company}" fast path on /company-login
      // so their very first real login already shows their company branding.
      try {
        localStorage.setItem('pontifex.lastCompany', JSON.stringify({
          tenantId: invitation.tenantId,
          code: invitation.companyCode || undefined,
          name: invitation.tenantName,
        }));
      } catch { /* localStorage unavailable — non-fatal */ }
      router.push(`/login?tenant_id=${invitation.tenantId}`);
    } else {
      router.push('/company-login');
    }
  };

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setError('Image must be under 5 MB');
      return;
    }
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
    setError('');
  };

  const handleAboutNext = () => {
    const digits = phoneDigits(phone);
    if (digits.length > 0 && digits.length !== 10) {
      setError('Enter a 10-digit US phone number, or leave it blank.');
      return;
    }
    setError('');
    setStep(3);
  };

  const handleWaiverNext = () => {
    if (!waiverSigned) {
      setError('You must agree to the Platform Agreement to continue');
      return;
    }
    setError('');
    setStep(4);
  };

  const handleComplete = async () => {
    if (!invitation) return;
    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      const res = await fetch('/api/setup-account/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: invitation.token,
          password,
          confirmPassword,
          waiverSigned,
          emailConsent,
          smsConsent,
          nickname: nickname.trim() || undefined,
          phone: phoneDigits(phone) || undefined,
          hasAvatar: !!avatarFile,
        }),
      });

      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Setup failed');

      // Upload avatar if user selected one. We authenticate with the short-lived
      // `avatarToken` returned by complete (NOT the original setup token, which
      // is now rotated/dead). The profile row already exists at this point.
      // ISOLATED try/catch: the account is ALREADY created and the setup token
      // consumed — a network blip here must never surface as "Setup failed"
      // (the retry would then hit "invalid invitation" with no way forward).
      if (avatarFile && json.data?.userId && json.data?.avatarToken) {
        try {
          const form = new FormData();
          form.append('avatar', avatarFile);
          form.append('userId', json.data.userId);
          form.append('invitationToken', json.data.avatarToken);
          await fetch('/api/upload/avatar', { method: 'POST', body: form });
        } catch {
          /* non-blocking by design — photo can be added later in My Profile */
        }
      }

      setStep(5);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Setup failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // Auto-redirect ~2s after success
  useEffect(() => {
    if (step !== 5) return;
    const t = setTimeout(goToLogin, 2200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  // ── Loading state ──────────────────────────────────────────────────────────
  if (step === 0) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white dark:from-[#0b0618] dark:to-[#0e0720] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 text-violet-500 dark:text-violet-400 animate-spin" />
          <p className="text-slate-500 dark:text-white/60 text-sm">Validating invitation...</p>
        </div>
      </div>
    );
  }

  // ── Error state ────────────────────────────────────────────────────────────
  if (step === -1) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white dark:from-[#0b0618] dark:to-[#0e0720] flex items-center justify-center p-4">
        <div className="bg-white/90 ring-1 ring-red-200 shadow-sm rounded-2xl p-8 max-w-md w-full text-center dark:bg-white/[0.04] dark:ring-red-500/30">
          <div className="w-16 h-16 bg-red-50 dark:bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertTriangle className="w-8 h-8 text-red-500 dark:text-red-400" />
          </div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white mb-2">Invitation Problem</h1>
          <p className="text-slate-500 dark:text-white/60 mb-6">{error}</p>
          <a href="/company-login" className="text-violet-600 hover:text-violet-700 dark:text-violet-400 dark:hover:text-violet-300 text-sm underline">
            Go to sign in →
          </a>
        </div>
      </div>
    );
  }

  // ── Success state ──────────────────────────────────────────────────────────
  if (step === 5) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white dark:from-[#0b0618] dark:to-[#0e0720] flex items-center justify-center p-4">
        <div className="bg-white/90 ring-1 ring-emerald-200 shadow-sm rounded-2xl p-8 max-w-md w-full text-center dark:bg-white/[0.04] dark:ring-emerald-500/30">
          <div className="w-20 h-20 rounded-full overflow-hidden mx-auto mb-4 ring-4 ring-emerald-100 dark:ring-emerald-500/20">
            {avatarPreview ? (
              <img src={avatarPreview} alt="Your profile" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full bg-emerald-50 dark:bg-emerald-500/20 flex items-center justify-center">
                <CheckCircle className="w-9 h-9 text-emerald-600 dark:text-emerald-400" />
              </div>
            )}
          </div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
            {firstName ? `You're all set, ${firstName}!` : "You're all set!"}
          </h1>
          <p className="text-slate-500 dark:text-white/60 mb-4">
            Your account is ready. Taking you to sign in...
          </p>
          {invitation?.companyCode && (
            <div className="bg-slate-50 ring-1 ring-slate-200 dark:bg-white/5 dark:ring-white/10 rounded-xl px-4 py-3 text-sm mb-4">
              <span className="text-slate-500 dark:text-white/60">Your company code: </span>
              <strong className="text-violet-600 dark:text-violet-300">{invitation.companyCode}</strong>
            </div>
          )}
          <button
            onClick={goToLogin}
            className="inline-flex items-center justify-center gap-2 w-full bg-violet-600 hover:bg-violet-700 text-white rounded-xl py-3 font-semibold transition-colors min-h-[44px]"
          >
            Go to Sign In
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  // ── Step pages ─────────────────────────────────────────────────────────────
  const strength = passwordStrength(password);
  const strengthColors = ['bg-slate-300 dark:bg-white/20', 'bg-amber-400', 'bg-emerald-400', 'bg-emerald-500'];
  const currentStep = STEPS[step - 1];

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white dark:from-[#0b0618] dark:to-[#0e0720] flex items-center justify-center p-4">
      <div className="max-w-lg w-full py-8">

        {/* Header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center gap-2 bg-violet-50 border border-violet-200 dark:bg-violet-500/10 dark:border-violet-500/20 rounded-full px-4 py-2 mb-4">
            <span className="text-violet-600 dark:text-violet-300 text-sm font-medium">{invitation?.tenantName}</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
            {invitation?.name ? `Welcome, ${invitation.name.split(' ')[0]}!` : 'Welcome aboard!'}
          </h1>
          <p className="text-slate-500 dark:text-white/60 mt-2 text-sm">
            Let&apos;s get your account ready — it only takes a minute.
          </p>
        </div>

        {/* Step progress */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2 px-1">
            <span className="text-xs font-semibold uppercase tracking-wider text-violet-600 dark:text-violet-300">
              Step {step} of {STEPS.length}
            </span>
            <span className="text-xs text-slate-400 dark:text-white/40">{currentStep.label}</span>
          </div>
          <div className="flex items-center gap-1.5">
            {STEPS.map((s, i) => (
              <div
                key={s.label}
                className={`h-1.5 flex-1 rounded-full transition-colors duration-300
                  ${i + 1 < step ? 'bg-emerald-500'
                    : i + 1 === step ? 'bg-violet-600 dark:bg-violet-500'
                    : 'bg-slate-200 dark:bg-white/10'}`}
              />
            ))}
          </div>
        </div>

        <div className="bg-white/90 ring-1 ring-slate-200 rounded-2xl p-6 shadow-sm dark:bg-white/[0.04] dark:ring-white/10">

          {/* ── Step 1: Your photo ───────────────────────────────────────── */}
          {step === 1 && (
            <div className="space-y-5">
              <div className="flex items-center gap-3 pb-2 border-b border-slate-200 dark:border-white/10">
                <div className="w-10 h-10 bg-violet-50 dark:bg-violet-500/20 rounded-xl flex items-center justify-center flex-shrink-0">
                  <Camera className="w-5 h-5 text-violet-600 dark:text-violet-400" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Add a profile photo</h2>
                  <p className="text-slate-500 dark:text-white/60 text-sm">So the crew knows who they&apos;re working with</p>
                </div>
              </div>

              {/* Big tappable avatar */}
              <div className="flex flex-col items-center gap-4 py-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="relative w-36 h-36 rounded-full overflow-hidden bg-slate-100 dark:bg-white/10 border-2 border-dashed border-violet-300 dark:border-violet-500/40 flex items-center justify-center transition-transform active:scale-95 hover:border-violet-400 dark:hover:border-violet-400/60 group"
                  aria-label={avatarPreview ? 'Change profile photo' : 'Choose profile photo'}
                >
                  {avatarPreview ? (
                    <>
                      <img src={avatarPreview} alt="Profile preview" className="w-full h-full object-cover" />
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                        <Camera className="w-7 h-7 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                    </>
                  ) : (
                    <div className="flex flex-col items-center gap-2 text-slate-400 dark:text-white/40">
                      <Camera className="w-9 h-9" />
                      <span className="text-xs font-medium">Tap to choose</span>
                    </div>
                  )}
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleAvatarChange}
                />
                {avatarPreview && (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="text-sm text-violet-600 hover:text-violet-700 dark:text-violet-400 dark:hover:text-violet-300 underline min-h-[44px]"
                  >
                    Change photo
                  </button>
                )}
                <p className="text-xs text-slate-400 dark:text-white/40">JPG, PNG, WEBP up to 5 MB</p>
              </div>

              {/* Account info (read-only) */}
              <div className="bg-slate-50 ring-1 ring-slate-200 dark:bg-white/5 dark:ring-white/10 rounded-xl p-3 text-sm">
                <span className="text-slate-500 dark:text-white/50">Account: </span>
                <span className="text-slate-700 dark:text-white/80 break-all">{invitation?.email}</span>
              </div>

              {error && <p className="text-red-700 dark:text-red-300 text-sm bg-red-50 dark:bg-red-500/10 rounded-lg px-3 py-2">{error}</p>}

              <div className="space-y-2">
                {avatarPreview ? (
                  <button
                    onClick={() => { setError(''); setStep(2); }}
                    className="w-full bg-violet-600 hover:bg-violet-700 text-white rounded-xl py-3 font-semibold transition-colors min-h-[44px] flex items-center justify-center gap-2"
                  >
                    Continue
                    <ArrowRight className="w-4 h-4" />
                  </button>
                ) : (
                  <>
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="w-full bg-violet-600 hover:bg-violet-700 text-white rounded-xl py-3 font-semibold transition-colors min-h-[44px] flex items-center justify-center gap-2"
                    >
                      <Camera className="w-4 h-4" />
                      Choose a photo
                    </button>
                    <button
                      onClick={() => { setError(''); setStep(2); }}
                      className="w-full text-slate-500 hover:text-slate-700 dark:text-white/50 dark:hover:text-white/70 rounded-xl py-3 text-sm font-medium transition-colors min-h-[44px]"
                    >
                      Skip for now
                    </button>
                  </>
                )}
              </div>
            </div>
          )}

          {/* ── Step 2: About you ────────────────────────────────────────── */}
          {step === 2 && (
            <div className="space-y-5">
              <div className="flex items-center gap-3 pb-2 border-b border-slate-200 dark:border-white/10">
                <div className="w-10 h-10 bg-violet-50 dark:bg-violet-500/20 rounded-xl flex items-center justify-center flex-shrink-0">
                  <User className="w-5 h-5 text-violet-600 dark:text-violet-400" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-slate-900 dark:text-white">About you</h2>
                  <p className="text-slate-500 dark:text-white/60 text-sm">All optional — you can add these later</p>
                </div>
              </div>

              <div>
                <label htmlFor="setup-nickname" className="text-sm text-slate-500 dark:text-white/60 mb-1.5 block">Nickname</label>
                <input
                  id="setup-nickname"
                  type="text"
                  value={nickname}
                  onChange={e => { setNickname(e.target.value.slice(0, 40)); setError(''); }}
                  placeholder="What the crew calls you"
                  autoComplete="nickname"
                  className={inputClasses}
                />
              </div>

              <div>
                <label htmlFor="setup-phone" className="text-sm text-slate-500 dark:text-white/60 mb-1.5 block">Phone number</label>
                <div className="relative">
                  <Phone className="w-4 h-4 text-slate-400 dark:text-white/40 absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    id="setup-phone"
                    type="tel"
                    inputMode="tel"
                    value={phone}
                    onChange={e => { setPhone(formatPhoneInput(e.target.value)); setError(''); }}
                    placeholder="(555) 123-4567"
                    autoComplete="tel-national"
                    className={`${inputClasses} pl-11`}
                  />
                </div>
                <p className="text-xs text-slate-400 dark:text-white/40 mt-1.5">
                  Helps dispatch reach you about schedule changes.
                </p>
              </div>

              {/* Notification preferences (folded in here — SMS pairs with phone) */}
              <div className="space-y-2.5">
                <p className="text-sm text-slate-500 dark:text-white/60">How should we notify you?</p>

                <label className="flex items-start gap-3 cursor-pointer bg-slate-50 hover:bg-slate-100 rounded-xl p-3.5 border border-slate-200 hover:border-violet-300 transition-colors group dark:bg-white/5 dark:hover:bg-white/10 dark:border-white/10 dark:hover:border-violet-500/40 min-h-[44px]">
                  <div className="relative flex-shrink-0 mt-0.5">
                    <input
                      type="checkbox"
                      checked={emailConsent}
                      onChange={e => setEmailConsent(e.target.checked)}
                      className="sr-only"
                    />
                    <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors
                      ${emailConsent ? 'bg-violet-600 border-violet-600' : 'bg-white border-slate-300 group-hover:border-violet-400 dark:bg-white/5 dark:border-white/20 dark:group-hover:border-violet-500'}`}>
                      {emailConsent && <span className="text-white text-xs font-bold">✓</span>}
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <Mail className="w-4 h-4 text-slate-400 dark:text-white/40 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-slate-900 dark:text-white font-medium text-sm">Email</p>
                      <p className="text-slate-500 dark:text-white/60 text-xs mt-0.5">
                        Job assignments, schedule updates, and approvals.
                      </p>
                    </div>
                  </div>
                </label>

                <label className="flex items-start gap-3 cursor-pointer bg-slate-50 hover:bg-slate-100 rounded-xl p-3.5 border border-slate-200 hover:border-violet-300 transition-colors group dark:bg-white/5 dark:hover:bg-white/10 dark:border-white/10 dark:hover:border-violet-500/40 min-h-[44px]">
                  <div className="relative flex-shrink-0 mt-0.5">
                    <input
                      type="checkbox"
                      checked={smsConsent}
                      onChange={e => setSmsConsent(e.target.checked)}
                      className="sr-only"
                    />
                    <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors
                      ${smsConsent ? 'bg-violet-600 border-violet-600' : 'bg-white border-slate-300 group-hover:border-violet-400 dark:bg-white/5 dark:border-white/20 dark:group-hover:border-violet-500'}`}>
                      {smsConsent && <span className="text-white text-xs font-bold">✓</span>}
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <MessageSquare className="w-4 h-4 text-slate-400 dark:text-white/40 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-slate-900 dark:text-white font-medium text-sm">Text message</p>
                      <p className="text-slate-500 dark:text-white/60 text-xs mt-0.5">
                        Time-sensitive alerts. Message and data rates may apply. Opt out anytime.
                      </p>
                    </div>
                  </div>
                </label>
              </div>

              {error && <p className="text-red-700 dark:text-red-300 text-sm bg-red-50 dark:bg-red-500/10 rounded-lg px-3 py-2">{error}</p>}

              <div className="flex gap-3">
                <button
                  onClick={() => { setError(''); setStep(1); }}
                  className="flex items-center gap-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl py-3 px-4 font-semibold transition-colors min-h-[44px] dark:bg-white/10 dark:hover:bg-white/20 dark:text-white/80"
                >
                  <ArrowLeft className="w-4 h-4" /> Back
                </button>
                <button
                  onClick={handleAboutNext}
                  className="flex-1 bg-violet-600 hover:bg-violet-700 text-white rounded-xl py-3 font-semibold transition-colors min-h-[44px] flex items-center justify-center gap-2"
                >
                  Continue <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* ── Step 3: Platform Agreement (liability waiver) ────────────── */}
          {step === 3 && (
            <div className="space-y-5">
              <div className="flex items-center gap-3 pb-2 border-b border-slate-200 dark:border-white/10">
                <div className="w-10 h-10 bg-violet-50 dark:bg-violet-500/20 rounded-xl flex items-center justify-center flex-shrink-0">
                  <FileText className="w-5 h-5 text-violet-600 dark:text-violet-400" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Platform Agreement</h2>
                  <p className="text-slate-500 dark:text-white/60 text-sm">Please read and sign to continue</p>
                </div>
              </div>

              <div className="bg-slate-50 rounded-xl p-4 h-64 overflow-y-auto text-sm text-slate-600 leading-relaxed space-y-4 border border-slate-200 dark:bg-white/5 dark:text-white/70 dark:border-white/10">
                <h3 className="text-slate-900 dark:text-white font-semibold text-base">Platform User Agreement &amp; Liability Waiver</h3>
                <p>By using the {invitation?.tenantName} operations platform (&quot;Platform&quot;), you agree to the following terms:</p>

                <p><strong className="text-slate-900 dark:text-white">1. Authorized Use.</strong> This Platform is provided solely for authorized business operations. You agree to use it only for lawful purposes related to your employment or contracted work with {invitation?.tenantName}.</p>

                <p><strong className="text-slate-900 dark:text-white">2. Data Accuracy.</strong> You are responsible for the accuracy of all information you enter, including job progress logs, timecard entries, and work performed records. Falsification of records may result in immediate termination and possible legal action.</p>

                <p><strong className="text-slate-900 dark:text-white">3. GPS &amp; Location Data.</strong> The Platform may collect GPS coordinates during clock-in, job start/end, and NFC scan events. This data is used solely for payroll verification and job site confirmation. You consent to this collection as a condition of Platform access.</p>

                <p><strong className="text-slate-900 dark:text-white">4. Confidentiality.</strong> Customer information, pricing, job details, and all Platform data are confidential. You agree not to share, reproduce, or distribute any Platform data outside of authorized business use.</p>

                <p><strong className="text-slate-900 dark:text-white">5. Account Security.</strong> You are responsible for maintaining the confidentiality of your login credentials. You agree to notify your supervisor immediately if you suspect unauthorized access to your account.</p>

                <p><strong className="text-slate-900 dark:text-white">6. Liability Limitation.</strong> The Platform operator is not liable for any indirect, incidental, or consequential damages arising from Platform use. Your use of the Platform is at your own risk subject to applicable law.</p>

                <p><strong className="text-slate-900 dark:text-white">7. Modifications.</strong> These terms may be updated periodically with notice. Continued use of the Platform after notice constitutes acceptance of any revised terms.</p>

                <p><strong className="text-slate-900 dark:text-white">8. Governing Law.</strong> This agreement is governed by applicable state and federal law. Any disputes shall be resolved in the jurisdiction where {invitation?.tenantName} is primarily located.</p>

                <p className="text-slate-400 dark:text-white/40 text-xs pt-2 border-t border-slate-200 dark:border-white/10">Last updated: April 2026 — Pontifex Platform</p>
              </div>

              <label className="flex items-start gap-3 cursor-pointer group min-h-[44px]">
                <div className="relative flex-shrink-0 mt-0.5">
                  <input
                    type="checkbox"
                    checked={waiverSigned}
                    onChange={e => { setWaiverSigned(e.target.checked); setError(''); }}
                    className="sr-only"
                  />
                  <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors
                    ${waiverSigned ? 'bg-violet-600 border-violet-600' : 'bg-white border-slate-300 group-hover:border-violet-400 dark:bg-white/5 dark:border-white/20 dark:group-hover:border-violet-500'}`}>
                    {waiverSigned && <span className="text-white text-xs font-bold">✓</span>}
                  </div>
                </div>
                <span className="text-sm text-slate-600 dark:text-white/70 leading-relaxed">
                  I have read and agree to the Platform User Agreement &amp; Liability Waiver. I understand my use of this platform is subject to these terms.
                </span>
              </label>

              {error && <p className="text-red-700 dark:text-red-300 text-sm bg-red-50 dark:bg-red-500/10 rounded-lg px-3 py-2">{error}</p>}

              <div className="flex gap-3">
                <button
                  onClick={() => { setError(''); setStep(2); }}
                  className="flex items-center gap-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl py-3 px-4 font-semibold transition-colors min-h-[44px] dark:bg-white/10 dark:hover:bg-white/20 dark:text-white/80"
                >
                  <ArrowLeft className="w-4 h-4" /> Back
                </button>
                <button
                  onClick={handleWaiverNext}
                  className="flex-1 bg-violet-600 hover:bg-violet-700 text-white rounded-xl py-3 font-semibold transition-colors min-h-[44px] flex items-center justify-center gap-2"
                >
                  Continue <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* ── Step 4: Create password ──────────────────────────────────── */}
          {step === 4 && (
            <div className="space-y-5">
              <div className="flex items-center gap-3 pb-2 border-b border-slate-200 dark:border-white/10">
                <div className="w-10 h-10 bg-violet-50 dark:bg-violet-500/20 rounded-xl flex items-center justify-center flex-shrink-0">
                  <Lock className="w-5 h-5 text-violet-600 dark:text-violet-400" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Create your password</h2>
                  <p className="text-slate-500 dark:text-white/60 text-sm">Last step — this is how you&apos;ll sign in</p>
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <label htmlFor="setup-password" className="text-sm text-slate-500 dark:text-white/60 mb-1.5 block">Password</label>
                  <div className="relative">
                    <input
                      id="setup-password"
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={e => { setPassword(e.target.value); setError(''); }}
                      placeholder="At least 8 characters"
                      autoComplete="new-password"
                      className={`${inputClasses} pr-12`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(v => !v)}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      className="absolute right-1 top-1/2 -translate-y-1/2 w-11 h-11 flex items-center justify-center text-slate-400 hover:text-slate-600 dark:text-white/40 dark:hover:text-white/70 transition-colors"
                    >
                      {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                  {/* Strength hint */}
                  {password.length > 0 && (
                    <div className="mt-2">
                      <div className="flex gap-1 mb-1">
                        {[1, 2, 3].map(i => (
                          <div
                            key={i}
                            className={`h-1 flex-1 rounded-full transition-colors ${strength.score >= i ? strengthColors[strength.score] : 'bg-slate-200 dark:bg-white/10'}`}
                          />
                        ))}
                      </div>
                      <p className={`text-xs ${strength.score === 0 ? 'text-slate-400 dark:text-white/40' : strength.score === 1 ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                        {strength.label}
                      </p>
                    </div>
                  )}
                </div>
                <div>
                  <label htmlFor="setup-confirm" className="text-sm text-slate-500 dark:text-white/60 mb-1.5 block">Confirm password</label>
                  <input
                    id="setup-confirm"
                    type={showPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={e => { setConfirmPassword(e.target.value); setError(''); }}
                    placeholder="Repeat your password"
                    autoComplete="new-password"
                    className={inputClasses}
                  />
                  {confirmPassword.length > 0 && confirmPassword !== password && (
                    <p className="text-xs text-amber-600 dark:text-amber-400 mt-1.5">Passwords don&apos;t match yet</p>
                  )}
                </div>
              </div>

              {error && <p className="text-red-700 dark:text-red-300 text-sm bg-red-50 dark:bg-red-500/10 rounded-lg px-3 py-2">{error}</p>}

              <div className="flex gap-3">
                <button
                  onClick={() => { setError(''); setStep(3); }}
                  disabled={submitting}
                  className="flex items-center gap-1 bg-slate-100 hover:bg-slate-200 disabled:opacity-60 text-slate-700 rounded-xl py-3 px-4 font-semibold transition-colors min-h-[44px] dark:bg-white/10 dark:hover:bg-white/20 dark:text-white/80"
                >
                  <ArrowLeft className="w-4 h-4" /> Back
                </button>
                <button
                  onClick={handleComplete}
                  disabled={submitting}
                  className="flex-1 bg-violet-600 hover:bg-violet-700 disabled:opacity-60 disabled:cursor-not-allowed text-white rounded-xl py-3 font-semibold transition-colors flex items-center justify-center gap-2 min-h-[44px]"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Setting up your account...
                    </>
                  ) : (
                    <>
                      <CheckCircle className="w-4 h-4" />
                      Finish Setup
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>

        <p className="text-center text-xs text-slate-400 dark:text-white/40 mt-6">
          Already have an account?{' '}
          <a href="/company-login" className="text-violet-600 hover:text-violet-700 dark:text-violet-400 dark:hover:text-violet-300 underline">Sign in here</a>
        </p>
      </div>
    </div>
  );
}

// Outer wrapper provides the Suspense boundary required for useSearchParams
export default function SetupAccountPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white dark:from-[#0b0618] dark:to-[#0e0720] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-violet-500 dark:text-violet-400 animate-spin" />
      </div>
    }>
      <SetupAccountInner />
    </Suspense>
  );
}
