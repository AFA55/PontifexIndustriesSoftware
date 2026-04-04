'use client';

export const dynamic = 'force-dynamic';

/**
 * /setup-account?token=xxx
 * Public page — no auth required. Guides a newly invited user through
 * 3 setup steps: profile photo + password, liability waiver, preferences.
 */

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Camera, CheckCircle, FileText, Bell, Loader2, Upload, ArrowLeft } from 'lucide-react';

interface InvitationData {
  email: string;
  role: string;
  tenantId: string;
  tenantName: string;
  companyCode: string;
  token: string;
  alreadySetup: boolean;
}

// Inner component that uses useSearchParams (must be wrapped in Suspense)
function SetupAccountInner() {
  const params = useSearchParams();
  const router = useRouter();
  const token = params.get('token');

  const [step, setStep] = useState<-1 | 0 | 1 | 2 | 3 | 4>(0); // 0=loading, -1=error, 1-3=steps, 4=done
  const [invitation, setInvitation] = useState<InvitationData | null>(null);
  const [error, setError] = useState('');

  // Form state
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState('');
  const [waiverSigned, setWaiverSigned] = useState(false);
  const [emailConsent, setEmailConsent] = useState(true);
  const [smsConsent, setSmsConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

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

  const handleStep1Next = () => {
    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    setError('');
    setStep(2);
  };

  const handleStep2Next = () => {
    if (!waiverSigned) {
      setError('You must agree to the Platform Agreement to continue');
      return;
    }
    setError('');
    setStep(3);
  };

  const handleComplete = async () => {
    if (!invitation) return;

    setSubmitting(true);
    setError('');

    try {
      const res = await fetch('/api/setup-account/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: invitation.token,
          password,
          waiverSigned,
          emailConsent,
          smsConsent,
          hasAvatar: !!avatarFile,
        }),
      });

      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Setup failed');

      // Upload avatar if user selected one
      if (avatarFile && json.data?.userId) {
        const form = new FormData();
        form.append('avatar', avatarFile);
        form.append('userId', json.data.userId);
        await fetch('/api/upload/avatar', { method: 'POST', body: form });
        // Non-blocking — if avatar upload fails we still proceed
      }

      setStep(4);
      setTimeout(() => router.push('/login'), 4000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Setup failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Loading state ──────────────────────────────────────────────────────────
  if (step === 0) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 text-purple-400 animate-spin" />
          <p className="text-gray-400 text-sm">Validating invitation...</p>
        </div>
      </div>
    );
  }

  // ── Error state ────────────────────────────────────────────────────────────
  if (step === -1) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
        <div className="bg-gray-900 rounded-2xl p-8 max-w-md w-full text-center border border-red-500/20">
          <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-3xl">⚠️</span>
          </div>
          <h1 className="text-xl font-bold text-white mb-2">Invitation Problem</h1>
          <p className="text-gray-400 mb-6">{error}</p>
          <a href="/login" className="text-purple-400 hover:text-purple-300 text-sm underline">
            Go to login →
          </a>
        </div>
      </div>
    );
  }

  // ── Success state ──────────────────────────────────────────────────────────
  if (step === 4) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
        <div className="bg-gray-900 rounded-2xl p-8 max-w-md w-full text-center border border-green-500/20">
          <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-8 h-8 text-green-400" />
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">Account Ready!</h1>
          <p className="text-gray-400 mb-4">
            Your account has been set up successfully. Redirecting you to login...
          </p>
          {invitation?.companyCode && (
            <div className="bg-gray-800 rounded-xl px-4 py-3 text-sm">
              <span className="text-gray-400">Company code: </span>
              <strong className="text-purple-300">{invitation.companyCode}</strong>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Step pages ─────────────────────────────────────────────────────────────
  const stepLabels = ['Profile & Password', 'Platform Agreement', 'Preferences'];
  const stepIcons = [Camera, FileText, Bell];

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
      <div className="max-w-lg w-full">

        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 bg-purple-500/10 border border-purple-500/20 rounded-full px-4 py-2 mb-4">
            <span className="text-purple-300 text-sm font-medium">{invitation?.tenantName}</span>
          </div>
          <h1 className="text-2xl font-bold text-white">Complete Your Account Setup</h1>
          <p className="text-gray-400 mt-2 text-sm">
            Welcome! Just a few steps to get your account ready.
          </p>
        </div>

        {/* Step indicator */}
        <div className="flex items-center justify-center mb-8 px-4">
          {[1, 2, 3].map((s) => (
            <div key={s} className={`flex items-center ${s < 3 ? 'flex-1' : ''}`}>
              <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold transition-all
                ${step === s
                  ? 'bg-purple-600 text-white ring-2 ring-purple-400 ring-offset-2 ring-offset-gray-950'
                  : step > s
                  ? 'bg-green-500 text-white'
                  : 'bg-gray-800 text-gray-500'}`}>
                {step > s ? '✓' : s}
              </div>
              {s < 3 && (
                <div className={`flex-1 h-0.5 mx-2 transition-colors ${step > s ? 'bg-green-500' : 'bg-gray-800'}`} />
              )}
            </div>
          ))}
        </div>

        <div className="bg-gray-900 rounded-2xl p-6 border border-gray-800 shadow-xl">

          {/* ── Step 1: Photo + Password ─────────────────────────────────── */}
          {step === 1 && (
            <div className="space-y-5">
              <div className="flex items-center gap-3 pb-2 border-b border-gray-800">
                <div className="w-10 h-10 bg-purple-500/20 rounded-xl flex items-center justify-center flex-shrink-0">
                  <Camera className="w-5 h-5 text-purple-400" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-white">Profile &amp; Password</h2>
                  <p className="text-gray-400 text-sm">Add a photo and create your password</p>
                </div>
              </div>

              {/* Avatar upload */}
              <div className="flex flex-col items-center gap-3">
                <div className="w-24 h-24 rounded-full overflow-hidden bg-gray-800 border-2 border-purple-500/30 flex items-center justify-center flex-shrink-0">
                  {avatarPreview ? (
                    <img src={avatarPreview} alt="Profile preview" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-3xl font-bold text-gray-500">
                      {invitation?.email?.charAt(0)?.toUpperCase() || '?'}
                    </span>
                  )}
                </div>
                <label className="cursor-pointer flex items-center gap-2 bg-gray-800 hover:bg-gray-700 text-gray-300 px-4 py-2 rounded-lg text-sm transition-colors border border-gray-700">
                  <Upload className="w-4 h-4" />
                  {avatarPreview ? 'Change Photo' : 'Upload Photo (optional)'}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleAvatarChange}
                  />
                </label>
                <p className="text-xs text-gray-500">JPG, PNG, WEBP up to 5 MB</p>
              </div>

              {/* Account info (read-only) */}
              <div className="bg-gray-800/50 rounded-xl p-3 text-sm">
                <span className="text-gray-500">Account: </span>
                <span className="text-gray-300">{invitation?.email}</span>
              </div>

              {/* Password fields */}
              <div className="space-y-3">
                <div>
                  <label className="text-sm text-gray-400 mb-1.5 block">Create Password</label>
                  <input
                    type="password"
                    value={password}
                    onChange={e => { setPassword(e.target.value); setError(''); }}
                    placeholder="At least 8 characters"
                    autoComplete="new-password"
                    className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 transition-colors"
                  />
                </div>
                <div>
                  <label className="text-sm text-gray-400 mb-1.5 block">Confirm Password</label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={e => { setConfirmPassword(e.target.value); setError(''); }}
                    placeholder="Repeat your password"
                    autoComplete="new-password"
                    className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 transition-colors"
                  />
                </div>
              </div>

              {error && <p className="text-red-400 text-sm bg-red-500/10 rounded-lg px-3 py-2">{error}</p>}

              <button
                onClick={handleStep1Next}
                className="w-full bg-purple-600 hover:bg-purple-700 text-white rounded-xl py-3 font-semibold transition-colors"
              >
                Next: Review Agreement →
              </button>
            </div>
          )}

          {/* ── Step 2: Liability Waiver ─────────────────────────────────── */}
          {step === 2 && (
            <div className="space-y-5">
              <div className="flex items-center gap-3 pb-2 border-b border-gray-800">
                <div className="w-10 h-10 bg-purple-500/20 rounded-xl flex items-center justify-center flex-shrink-0">
                  <FileText className="w-5 h-5 text-purple-400" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-white">Platform Agreement</h2>
                  <p className="text-gray-400 text-sm">Please read and sign to continue</p>
                </div>
              </div>

              <div className="bg-gray-800 rounded-xl p-4 h-64 overflow-y-auto text-sm text-gray-300 leading-relaxed space-y-4 border border-gray-700">
                <h3 className="text-white font-semibold text-base">Platform User Agreement &amp; Liability Waiver</h3>
                <p>By using the {invitation?.tenantName} operations platform ("Platform"), you agree to the following terms:</p>

                <p><strong className="text-white">1. Authorized Use.</strong> This Platform is provided solely for authorized business operations. You agree to use it only for lawful purposes related to your employment or contracted work with {invitation?.tenantName}.</p>

                <p><strong className="text-white">2. Data Accuracy.</strong> You are responsible for the accuracy of all information you enter, including job progress logs, timecard entries, and work performed records. Falsification of records may result in immediate termination and possible legal action.</p>

                <p><strong className="text-white">3. GPS &amp; Location Data.</strong> The Platform may collect GPS coordinates during clock-in, job start/end, and NFC scan events. This data is used solely for payroll verification and job site confirmation. You consent to this collection as a condition of Platform access.</p>

                <p><strong className="text-white">4. Confidentiality.</strong> Customer information, pricing, job details, and all Platform data are confidential. You agree not to share, reproduce, or distribute any Platform data outside of authorized business use.</p>

                <p><strong className="text-white">5. Account Security.</strong> You are responsible for maintaining the confidentiality of your login credentials. You agree to notify your supervisor immediately if you suspect unauthorized access to your account.</p>

                <p><strong className="text-white">6. Liability Limitation.</strong> The Platform operator is not liable for any indirect, incidental, or consequential damages arising from Platform use. Your use of the Platform is at your own risk subject to applicable law.</p>

                <p><strong className="text-white">7. Modifications.</strong> These terms may be updated periodically with notice. Continued use of the Platform after notice constitutes acceptance of any revised terms.</p>

                <p><strong className="text-white">8. Governing Law.</strong> This agreement is governed by applicable state and federal law. Any disputes shall be resolved in the jurisdiction where {invitation?.tenantName} is primarily located.</p>

                <p className="text-gray-500 text-xs pt-2 border-t border-gray-700">Last updated: April 2026 — Pontifex Platform</p>
              </div>

              <label className="flex items-start gap-3 cursor-pointer group">
                <div className="relative flex-shrink-0 mt-0.5">
                  <input
                    type="checkbox"
                    checked={waiverSigned}
                    onChange={e => { setWaiverSigned(e.target.checked); setError(''); }}
                    className="sr-only"
                  />
                  <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors
                    ${waiverSigned ? 'bg-purple-600 border-purple-600' : 'bg-gray-800 border-gray-600 group-hover:border-purple-500'}`}>
                    {waiverSigned && <span className="text-white text-xs font-bold">✓</span>}
                  </div>
                </div>
                <span className="text-sm text-gray-300 leading-relaxed">
                  I have read and agree to the Platform User Agreement &amp; Liability Waiver. I understand my use of this platform is subject to these terms.
                </span>
              </label>

              {error && <p className="text-red-400 text-sm bg-red-500/10 rounded-lg px-3 py-2">{error}</p>}

              <div className="flex gap-3">
                <button
                  onClick={() => { setError(''); setStep(1); }}
                  className="flex items-center gap-1 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-xl py-3 px-4 font-semibold transition-colors"
                >
                  <ArrowLeft className="w-4 h-4" /> Back
                </button>
                <button
                  onClick={handleStep2Next}
                  className="flex-1 bg-purple-600 hover:bg-purple-700 text-white rounded-xl py-3 font-semibold transition-colors"
                >
                  Next: Preferences →
                </button>
              </div>
            </div>
          )}

          {/* ── Step 3: Communication Preferences ───────────────────────── */}
          {step === 3 && (
            <div className="space-y-5">
              <div className="flex items-center gap-3 pb-2 border-b border-gray-800">
                <div className="w-10 h-10 bg-purple-500/20 rounded-xl flex items-center justify-center flex-shrink-0">
                  <Bell className="w-5 h-5 text-purple-400" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-white">Communication Preferences</h2>
                  <p className="text-gray-400 text-sm">How would you like to be notified?</p>
                </div>
              </div>

              <div className="space-y-3">
                <label className="flex items-start gap-3 cursor-pointer bg-gray-800 hover:bg-gray-750 rounded-xl p-4 border border-gray-700 hover:border-purple-500/40 transition-colors group">
                  <div className="relative flex-shrink-0 mt-0.5">
                    <input
                      type="checkbox"
                      checked={emailConsent}
                      onChange={e => setEmailConsent(e.target.checked)}
                      className="sr-only"
                    />
                    <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors
                      ${emailConsent ? 'bg-purple-600 border-purple-600' : 'bg-gray-700 border-gray-600 group-hover:border-purple-500'}`}>
                      {emailConsent && <span className="text-white text-xs font-bold">✓</span>}
                    </div>
                  </div>
                  <div>
                    <p className="text-white font-medium text-sm">Email Notifications</p>
                    <p className="text-gray-400 text-xs mt-1">
                      Job assignments, schedule updates, approval notifications, and important platform updates via email.
                    </p>
                  </div>
                </label>

                <label className="flex items-start gap-3 cursor-pointer bg-gray-800 hover:bg-gray-750 rounded-xl p-4 border border-gray-700 hover:border-purple-500/40 transition-colors group">
                  <div className="relative flex-shrink-0 mt-0.5">
                    <input
                      type="checkbox"
                      checked={smsConsent}
                      onChange={e => setSmsConsent(e.target.checked)}
                      className="sr-only"
                    />
                    <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors
                      ${smsConsent ? 'bg-purple-600 border-purple-600' : 'bg-gray-700 border-gray-600 group-hover:border-purple-500'}`}>
                      {smsConsent && <span className="text-white text-xs font-bold">✓</span>}
                    </div>
                  </div>
                  <div>
                    <p className="text-white font-medium text-sm">SMS Notifications</p>
                    <p className="text-gray-400 text-xs mt-1">
                      Time-sensitive alerts via text message. Message and data rates may apply. You can opt out at any time.
                    </p>
                  </div>
                </label>
              </div>

              <p className="text-xs text-gray-500">
                You can update notification preferences at any time from your profile settings.
              </p>

              {error && <p className="text-red-400 text-sm bg-red-500/10 rounded-lg px-3 py-2">{error}</p>}

              <div className="flex gap-3">
                <button
                  onClick={() => { setError(''); setStep(2); }}
                  className="flex items-center gap-1 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-xl py-3 px-4 font-semibold transition-colors"
                >
                  <ArrowLeft className="w-4 h-4" /> Back
                </button>
                <button
                  onClick={handleComplete}
                  disabled={submitting}
                  className="flex-1 bg-purple-600 hover:bg-purple-700 disabled:opacity-60 disabled:cursor-not-allowed text-white rounded-xl py-3 font-semibold transition-colors flex items-center justify-center gap-2"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Setting up your account...
                    </>
                  ) : (
                    <>
                      <CheckCircle className="w-4 h-4" />
                      Complete Setup
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>

        <p className="text-center text-xs text-gray-600 mt-6">
          Already have an account?{' '}
          <a href="/login" className="text-purple-400 hover:text-purple-300 underline">Sign in here</a>
        </p>
      </div>
    </div>
  );
}

// Outer wrapper provides the Suspense boundary required for useSearchParams
export default function SetupAccountPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-purple-400 animate-spin" />
      </div>
    }>
      <SetupAccountInner />
    </Suspense>
  );
}
