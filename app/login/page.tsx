'use client';

import React, { useState, useEffect, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { supabase } from '@/lib/supabase';
import { PLATFORM_TENANT_ID } from '@/lib/rbac';
import { Eye, EyeOff, Mail, Lock, ChevronDown, ChevronUp, Shield, ArrowLeft, ScanFace } from 'lucide-react';
import { motion } from 'framer-motion';
import { BIOMETRIC_DECLINED_KEY, biometricAvailable, biometryLabel, disableBiometric, enrolledBiometricEmail, enrollBiometric, hasEnrolledBiometric, verifyAndGetSession } from '@/lib/biometric';
import { isNativeApp } from '@/lib/is-native';
import PasskeySignInButton from '@/components/auth/PasskeySignInButton';

/**
 * Keep `pontifex.lastCompany` (the one-tap fast path on /company-login) up to date.
 * Creates the record on successful login and enriches an existing record with the
 * tenant's display name + logo once branding loads. logout() never clears this key.
 */
function upsertLastCompany(
  tenantId: string,
  branding: { company_name?: string; logo_icon_url?: string; logo_url?: string },
  { createIfMissing }: { createIfMissing: boolean }
) {
  try {
    const raw = localStorage.getItem('pontifex.lastCompany');
    const prev = raw ? JSON.parse(raw) : null;
    const matches = prev?.tenantId === tenantId;
    if (!matches && !createIfMissing) return;
    const name = branding.company_name || (matches ? prev.name : null);
    if (!name) return; // never store a record without a display name
    localStorage.setItem('pontifex.lastCompany', JSON.stringify({
      tenantId,
      code: matches ? prev.code : undefined,
      name,
      logoUrl: branding.logo_icon_url || branding.logo_url || (matches ? prev.logoUrl : undefined),
    }));
  } catch {
    /* localStorage unavailable — non-fatal */
  }
}

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  remember: z.boolean().optional(),
});

type FormData = z.infer<typeof schema>;

const DEMO_ACCOUNTS = [
  // ⚠️ These ship in the public bundle — demo/test accounts ONLY. Rotate the
  // super admin password when live testing settles (founder-accepted risk,
  // Jul 21, for fast login while stabilizing the app).
  { label: 'Super Admin', name: 'Super Admin (Demo)', email: 'super@pontifex.com', password: 'super0202!', color: 'rose' },
  { label: 'Admin',      name: 'Demo Admin', email: 'admin@pontifex.com',      password: 'PontifexDemo2026!', color: 'violet' },
  { label: 'Supervisor', name: 'David',      email: 'supervisor@pontifex.com', password: 'PontifexDemo2026!', color: 'amber' },
  { label: 'Operator',   name: 'Zack',  email: 'zack@demopontifex.com',  password: 'Patriot2026!', color: 'blue' },
  { label: 'Operator',   name: 'Aiden', email: 'aiden@demopontifex.com', password: 'Patriot2026!', color: 'blue' },
  { label: 'Operator',   name: 'Keon',  email: 'keon@demopontifex.com',  password: 'Patriot2026!', color: 'blue' },
  { label: 'Helper',     name: 'Lucas', email: 'lucas@demopontifex.com', password: 'Patriot2026!', color: 'emerald' },
  { label: 'Helper',     name: 'Javi',  email: 'javi@demopontifex.com',  password: 'Patriot2026!', color: 'emerald' },
  { label: 'Helper',     name: 'Javier', email: 'javier@demopontifex.com', password: 'Patriot2026!', color: 'emerald' },
  { label: 'Shop Hand',  name: 'Joey', email: 'joey@pontifex.com', password: 'Help1234!', color: 'teal' },
];
// per-color Tailwind classes (literal strings so Tailwind keeps them in the build)
const DEMO_COLORS: Record<string, { wrap: string; text: string; badge: string }> = {
  rose:    { wrap: 'bg-rose-50 border-rose-200 hover:border-rose-300',       text: 'text-rose-600',    badge: 'bg-rose-100 text-rose-700' },
  blue:    { wrap: 'bg-blue-50 border-blue-200 hover:border-blue-300',       text: 'text-blue-600',    badge: 'bg-blue-100 text-blue-700' },
  emerald: { wrap: 'bg-emerald-50 border-emerald-200 hover:border-emerald-300', text: 'text-emerald-600', badge: 'bg-emerald-100 text-emerald-700' },
  violet:  { wrap: 'bg-violet-50 border-violet-200 hover:border-violet-300',  text: 'text-violet-600',  badge: 'bg-violet-100 text-violet-700' },
  amber:   { wrap: 'bg-amber-50 border-amber-200 hover:border-amber-300',     text: 'text-amber-600',   badge: 'bg-amber-100 text-amber-700' },
  teal:    { wrap: 'bg-teal-50 border-teal-200 hover:border-teal-300',       text: 'text-teal-600',    badge: 'bg-teal-100 text-teal-700' },
};
const DEMO_GATE_PASSWORD = 'PontifexDemo2026';

function LoginPageInner() {
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [demoOpen, setDemoOpen] = useState(false);
  const [demoGateInput, setDemoGateInput] = useState('');
  const [demoGateError, setDemoGateError] = useState(false);
  const [demoUnlocked, setDemoUnlocked] = useState(false);
  const [copiedEmail, setCopiedEmail] = useState<string | null>(null);
  const [tenantBranding, setTenantBranding] = useState<any>(null);
  // True once the tenant branding fetch has settled (success OR failure). Until then we
  // render a neutral logo placeholder — NEVER the Pontifex platform logo — so the user
  // doesn't see Pontifex flash and then swap to their company's logo.
  const [brandingLoaded, setBrandingLoaded] = useState(false);
  // Native Face ID / Touch ID sign-in (no-op on the website).
  const [faceIdReady, setFaceIdReady] = useState(false);
  const [bioLabel, setBioLabel] = useState('Face ID');
  const [bioAvailable, setBioAvailable] = useState(false);
  // Email the device's biometric entry is bound to (so the button shows whose it is).
  const [bioEmail, setBioEmail] = useState<string | null>(null);
  // Guards the one-shot Face ID auto-prompt on native app launch.
  const faceIdAutoTried = useRef(false);
  // Post-login "Sign in faster with Face ID?" enrollment prompt (native-only).
  // When set, we hold the role-based redirect until the user enables or skips.
  const [enrollPrompt, setEnrollPrompt] = useState<{ email: string; target: string } | null>(null);
  const [enrolling, setEnrolling] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const tenantId = searchParams.get('tenant_id');
  // NOTE: deliberately do NOT fall back to the global `useBranding()` context here.
  // That context defaults to one tenant and would briefly render the wrong company's
  // branding ("pops Patriot first") before this page's per-tenant fetch resolves.
  // Until the tenant-specific branding loads we use a neutral {} so the JSX `|| ...`
  // fallbacks render generic Pontifex chrome — never another company's brand.
  const branding = tenantBranding || {};

  // Redirect to company-login if no tenant_id param
  useEffect(() => {
    if (!tenantId) {
      router.replace('/company-login');
    }
  }, [tenantId, router]);

  // "Remember me" auto sign-in: a returning user with a valid persisted session
  // (and the stored profile the dashboard guards read) goes straight to the
  // dashboard instead of re-typing their password. Mirrors company-login.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // Default-OFF: only auto-resume when the user explicitly opted in
        // (flag === 'true'). A missing flag (brand-new device) is treated as
        // NOT remembered. Existing users who previously checked remember already
        // have the flag set to 'true', so they're unaffected.
        const remember = localStorage.getItem('pontifex.rememberMe') === 'true';
        const storedUser = localStorage.getItem('supabase-user');
        if (!remember || !storedUser) return;
        // TENANT-CONTEXT GUARD (founder Jul 12): this is COMPANY X's login
        // page — a remembered session from a DIFFERENT org must not hijack
        // the visit into its own dashboard (his Pontifex-owner session was
        // warping "log into Patriot" straight to the Platform Hub). On a
        // mismatch (or an old blob with no tenant_id to verify) show the
        // form: the user is here to sign in as someone else.
        let storedTenant: string | null = null;
        try { storedTenant = JSON.parse(storedUser)?.tenant_id ?? null; } catch { /* treat as unverifiable */ }
        if (!storedTenant || storedTenant !== tenantId) return;
        const { data: { session } } = await supabase.auth.getSession();
        if (!cancelled && session) router.replace('/dashboard');
      } catch {
        /* fall through to the normal login form */
      }
    })();
    return () => { cancelled = true; };
  }, [router]);

  // STICKY "Remember me" (founder bug Jul 11): the checkbox used to reset to
  // unchecked on every visit, so the NEXT login silently overwrote the flag to
  // 'false' and the session stopped surviving restarts. Restore the user's
  // last choice on mount — desktop office staff check it once, it stays.
  useEffect(() => {
    try {
      const flag = localStorage.getItem('pontifex.rememberMe');
      if (flag === 'true') {
        setValue('remember', true);
      } else if (flag !== 'false' && isNativeApp()) {
        // NATIVE default = ON (founder Jul 21: employees were re-typing
        // passwords every launch because the box defaulted unchecked and
        // WKWebView drops unsaved sessions on app kill). An explicit
        // uncheck ('false') is still respected.
        setValue('remember', true);
      }
    } catch { /* storage unavailable — leave unchecked */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fetch branding for the specific tenant from the URL param
  useEffect(() => {
    if (!tenantId) return;
    fetch(`/api/admin/branding?tenant_id=${tenantId}`)
      .then(r => r.json())
      .then(json => {
        if (json.success && json.data) {
          setTenantBranding(json.data);
          // Enrich the /company-login fast path with this tenant's name + logo.
          // Only updates an EXISTING record (visiting /login alone doesn't create one).
          upsertLastCompany(tenantId, json.data, { createIfMissing: false });
        }
      })
      .catch(() => {})
      .finally(() => setBrandingLoaded(true));
  }, [tenantId]);

  // Native app only: biometric (Face ID / Touch ID) sign-in. No-op on the website.
  // 1) If biometrics are available AND we saved credentials on a prior sign-in,
  //    surface the "Sign in with Face ID" button.
  // 2) On the NATIVE app, also AUTO-PROMPT Face ID on launch when there's no active
  //    session — so the app actually asks for Face ID instead of hiding it behind a
  //    button the user (who normally auto-resumes) never sees. Fires once per mount;
  //    if the user cancels, the normal form + button remain.
  useEffect(() => {
    (async () => {
      const { available, biometryType } = await biometricAvailable();
      if (!available) return;
      setBioAvailable(true);
      setBioLabel(biometryLabel(biometryType));
      if (!(await hasEnrolledBiometric())) return;
      setFaceIdReady(true);
      setBioEmail(enrolledBiometricEmail());

      if (!isNativeApp() || faceIdAutoTried.current) return;
      // Don't prompt if the user is already signed in (remember-me auto-resume
      // handles that case and redirects to the dashboard).
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) return;
      } catch {
        /* no session resolvable — fall through to the Face ID prompt */
      }
      faceIdAutoTried.current = true;
      handleFaceIdLogin();
    })();
    // handleFaceIdLogin is stable for our purposes; auto-prompt must run once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { register, handleSubmit, setValue, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { remember: false }, // overwritten on mount from the stored preference (sticky)
  });

  // Remember the last username on this device so the email field is pre-filled
  // on return. The browser's own password manager handles the password / passkey.
  useEffect(() => {
    try {
      const last = localStorage.getItem('pontifex.lastEmail');
      if (last) setValue('email', last);
    } catch { /* storage unavailable — non-fatal */ }
  }, [setValue]);

  // Role-based redirect, shared by password + biometric login and the post-login
  // enrollment prompt. NATIVE: SPA navigation so we stay inside the webview (a full
  // window.location.assign can hit a host redirect that Capacitor treats as external
  // and kicks the user to Safari). WEB: full navigation so Safari/iOS + Firefox fire
  // their native "Save password?" prompt.
  const navigateAfterLogin = (target: string) => {
    if (isNativeApp()) {
      router.replace(target);
    } else {
      window.location.assign(target);
    }
  };

  // `fromBiometric` = this submit was triggered by a biometric sign-in (skip the
  // post-login "enable Face ID?" prompt; the user is already enrolled).
  const onSubmit = async (data: FormData, fromBiometric = false) => {
    console.log('🚀 Starting login process...');
    setLoading(true);
    setError(null);

    // Persist the user's "Remember me" choice (default: false / session-only).
    // This flag drives the rememberAwareStorage adapter in lib/supabase.ts: it is
    // written HERE, before setSession() below, so the session token lands in the
    // correct store immediately — localStorage when remembered (survives restart),
    // sessionStorage when not (cleared when the browser/app fully closes). It also
    // gates the auto-sign-in redirect on return visits.
    try {
      localStorage.setItem('pontifex.rememberMe', data.remember === false ? 'false' : 'true');
    } catch {
      /* localStorage unavailable (private mode) — non-fatal */
    }

    try {
      // Call our custom login API that bypasses RLS
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: data.email,
          password: data.password,
        }),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        console.log('❌ Login failed:', result.error);
        setError(result.error || 'Login failed');
        setLoading(false);
        return;
      }

      console.log('✅ Login successful!');
      console.log('👤 User:', result.user);

      // Set the session in the client
      if (result.session) {
        await supabase.auth.setSession({
          access_token: result.session.access_token,
          refresh_token: result.session.refresh_token,
        });
      }

      // Store user data in localStorage for dashboard access
      localStorage.setItem('supabase-user', JSON.stringify({
        id: result.user.id,
        name: result.user.full_name,
        email: result.user.email,
        role: result.user.role,
        tenant_id: result.user.tenant_id ?? null,
      }));
      // Remember the username so the login form pre-fills it next time.
      try { localStorage.setItem('pontifex.lastEmail', data.email); } catch { /* non-fatal */ }
      console.log('💾 User stored in localStorage');

      // ── Make the browser OFFER TO SAVE the password ──────────────────────
      // A fetch/SPA login never triggers the native "Save password?" prompt
      // because nothing navigates. Chromium (Chrome/Edge/Android): push the
      // credential into the password manager via the Credential Management API.
      // Safari/iOS + Firefox don't support it — for them the FULL navigation
      // below (window.location.assign, not router.push) fires WebKit/Gecko's
      // save heuristic. (autocomplete username/current-password already set.)
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const PC = (window as any).PasswordCredential;
        if (PC && navigator.credentials?.store) {
          await navigator.credentials.store(
            new PC({ id: data.email, name: data.email, password: data.password })
          );
        }
      } catch {
        /* credential store unsupported / declined — non-fatal */
      }

      // NOTE: biometric enrollment is NO LONGER coupled to "Remember me". We store
      // the Supabase refresh token (not the password) in the Keychain only when the
      // user explicitly opts in via the post-login prompt below or the My Profile →
      // Security toggle. See lib/biometric.ts + docs/plans/BIOMETRIC_LOGIN_ARCHITECTURE.md.

      // SHARED-DEVICE SAFETY (native): the Keychain biometric entry is keyed only by
      // app, so if a DIFFERENT user just signed in with a password than the one the
      // device's Face ID is bound to, invalidate the stale entry — otherwise that
      // user could later restore the PREVIOUS user's session via Face ID. Clearing it
      // also lets the post-login enroll prompt below (gated on hasEnrolledBiometric)
      // offer the NEW user enrollment. Skip when this submit IS a biometric login.
      if (isNativeApp() && !fromBiometric) {
        const boundEmail = enrolledBiometricEmail();
        if (boundEmail && boundEmail.toLowerCase() !== data.email.toLowerCase()) {
          await disableBiometric(); // also removes pontifex.biometricEmail
          setFaceIdReady(false);
        }
      }

      // Remember this company for the one-tap fast path on /company-login
      // (covers users who deep-linked straight to /login?tenant_id=...).
      if (tenantId) {
        upsertLastCompany(tenantId, tenantBranding || {}, { createIfMissing: true });
      }

      // Resolve the role-based landing page. The platform owner (super_admin)
      // lands in the Pontifex Hub; office/shop roles → admin dashboard; field
      // roles → field dashboard.
      let target: string | null = null;
      if (result.user.role === 'super_admin') {
        // The Platform Hub is the PONTIFEX org's console only — a tenant's
        // super admin (e.g. Patriot demo) lands in THEIR portal (founder
        // Jul 14: "it sent me to Pontifex platform first").
        target = result.user.tenant_id === PLATFORM_TENANT_ID ? '/dashboard/platform' : '/dashboard/admin';
      } else if (['admin', 'salesman', 'operations_manager', 'supervisor', 'shop_manager', 'shop_help', 'inventory_manager'].includes(result.user.role)) {
        target = '/dashboard/admin';
      } else if (['operator', 'apprentice'].includes(result.user.role)) {
        target = '/dashboard';
      }
      if (!target) {
        setError('Invalid user role');
        setLoading(false);
        return;
      }

      // NATIVE APP: after a successful PASSWORD login, offer to enable biometric
      // sign-in ONCE — if biometrics are available, the user isn't already enrolled,
      // and they haven't previously declined. Hold the redirect until they choose.
      // (Skip the prompt when this submit was itself triggered by a biometric login.)
      if (isNativeApp() && bioAvailable && !fromBiometric) {
        try {
          const declined = localStorage.getItem(BIOMETRIC_DECLINED_KEY) === 'true';
          const alreadyEnrolled = await hasEnrolledBiometric();
          if (!declined && !alreadyEnrolled) {
            setEnrollPrompt({ email: data.email, target });
            setLoading(false);
            return; // navigation happens after the user enables / skips
          }
        } catch {
          /* localStorage / plugin unavailable — fall through to normal navigation */
        }
      }

      navigateAfterLogin(target);
      // Keep loading state true during navigation - it will unmount anyway
    } catch (err: any) {
      console.error('💥 Unexpected login error:', err);
      if (err.message === 'Failed to fetch' || err.name === 'TypeError') {
        setError('Cannot connect to server. Please check your connection or try again.');
      } else {
        setError('An unexpected error occurred');
      }
      setLoading(false);
    }
  };

  // Face ID / Touch ID sign-in: the OS-enforced biometric prompt releases the stored
  // Supabase REFRESH TOKEN from the Keychain (the security gate is the accessControl
  // on the Keychain item, not a JS boolean). We mint a fresh session from it via
  // refreshSession, then re-store the rotated token (Supabase single-uses refresh
  // tokens). Only shown in the native app when biometric sign-in is enrolled.
  const handleFaceIdLogin = async () => {
    setError(null);
    const result = await verifyAndGetSession(`Sign in to ${branding.company_name || 'Pontifex'}`);
    if (!result) return; // user cancelled, biometric failed, or token invalidated
    setLoading(true);
    try {
      // Enrolling biometrics IS the durable "remember this device" opt-in, so a
      // biometric restore must persist. Set rememberMe=true BEFORE refreshSession so
      // the rememberAwareStorage adapter writes the restored session to localStorage
      // (survives app kill) instead of sessionStorage (default-OFF → dies on restart).
      try { localStorage.setItem('pontifex.rememberMe', 'true'); } catch { /* non-fatal */ }

      // Mint a fresh session from the stored refresh token. refreshSession() returns
      // a new session regardless of access-token expiry, given a valid refresh token.
      const { data, error: refreshError } = await supabase.auth.refreshSession({
        refresh_token: result.refreshToken,
      });
      const session = data?.session;
      if (refreshError || !session) {
        // Token revoked / expired server-side (e.g. password changed, signed out
        // elsewhere). Drop the stale Keychain entry and fall back to the password form.
        await disableBiometric();
        setFaceIdReady(false);
        setError('Biometric sign-in expired. Please sign in with your password.');
        setLoading(false);
        return;
      }

      // Token rotation hygiene: Supabase rotated the refresh token on this refresh,
      // so re-store the NEW one to keep the Keychain copy valid for next time.
      if (session.refresh_token) {
        enrollBiometric(result.email, session.refresh_token).catch(() => {});
      }

      // Resolve the dashboard profile blob the guards read, then route by role.
      let role = '';
      let tenantIdForLanding: string | null = null;
      let target: string | null = null;
      let profileWritten = false;
      try {
        const res = await fetch('/api/my-profile', {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        const json = await res.json();
        role = json?.data?.role || '';
        if (json?.data) {
          localStorage.setItem('supabase-user', JSON.stringify({
            id: json.data.id,
            name: json.data.full_name,
            email: json.data.email,
            role: json.data.role,
          }));
          profileWritten = true;
        }
      } catch {
        /* profile fetch failed — fall back to the minimal blob below */
      }
      // FALLBACK: if the profile fetch failed/empty, still write a minimal
      // supabase-user blob from the restored session so the dashboard guard reads a
      // non-null user and RENDERS instead of bouncing back to /login. Role is
      // best-effort from app_metadata; the dashboard re-guards by role server-side.
      if (!profileWritten) {
        const u = session.user;
        role = (u?.app_metadata?.role as string) || (u?.user_metadata?.role as string) || '';
        try {
          localStorage.setItem('supabase-user', JSON.stringify({
            id: u?.id,
            name: (u?.user_metadata?.full_name as string) || result.email,
            email: u?.email || result.email,
            role,
          }));
        } catch { /* non-fatal */ }
      }
      try { localStorage.setItem('pontifex.lastEmail', result.email); } catch { /* non-fatal */ }

      if (role === 'super_admin') target = tenantIdForLanding === PLATFORM_TENANT_ID ? '/dashboard/platform' : '/dashboard/admin';
      else if (['admin', 'salesman', 'operations_manager', 'supervisor', 'shop_manager', 'shop_help', 'inventory_manager'].includes(role)) target = '/dashboard/admin';
      else if (['operator', 'apprentice'].includes(role)) target = '/dashboard';
      else target = '/dashboard'; // safe default; the dashboard re-guards by role

      navigateAfterLogin(target);
    } catch {
      setError('Biometric sign-in failed. Please sign in with your password.');
      setLoading(false);
    }
  };

  // WEB passkey (Face ID / Touch ID via Supabase WebAuthn). The PasskeySignInButton
  // has already created the session; here we resolve the profile blob the dashboard
  // guards read, then route by role — the same tail the biometric/password paths use.
  const handlePasskeySignedIn = async () => {
    setLoading(true);
    try {
      const { data } = await supabase.auth.getSession();
      const session = data.session;
      if (!session) { setLoading(false); return; }
      let role = '';
      let tenantIdForLanding: string | null = null;
      try {
        const res = await fetch('/api/my-profile', {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        const json = await res.json();
        role = json?.data?.role || '';
        tenantIdForLanding = json?.data?.tenant_id ?? null;
        if (json?.data) {
          localStorage.setItem('supabase-user', JSON.stringify({
            id: json.data.id, name: json.data.full_name, email: json.data.email, role: json.data.role,
            tenant_id: tenantIdForLanding,
          }));
        }
      } catch { /* non-fatal — dashboard re-guards by role */ }
      let target = '/dashboard';
      if (role === 'super_admin') target = tenantIdForLanding === PLATFORM_TENANT_ID ? '/dashboard/platform' : '/dashboard/admin';
      else if (['admin', 'salesman', 'operations_manager', 'supervisor', 'shop_manager', 'shop_help', 'inventory_manager'].includes(role)) target = '/dashboard/admin';
      navigateAfterLogin(target);
    } catch {
      setError('Passkey sign-in failed. Please sign in with your password.');
      setLoading(false);
    }
  };

  // Enrollment prompt handlers (native-only). On Enable → grab the CURRENT session's
  // refresh token and store it behind biometrics. On Skip → remember the decline.
  const handleEnableBiometric = async () => {
    if (!enrollPrompt) return;
    setEnrolling(true);
    try {
      const { data } = await supabase.auth.getSession();
      const refreshToken = data.session?.refresh_token;
      if (refreshToken) {
        await enrollBiometric(enrollPrompt.email, refreshToken);
        try { localStorage.removeItem(BIOMETRIC_DECLINED_KEY); } catch { /* non-fatal */ }
        // Enabling biometrics IS the durable "remember this device" opt-in — persist
        // the session to localStorage so it survives an app kill (see M1).
        try { localStorage.setItem('pontifex.rememberMe', 'true'); } catch { /* non-fatal */ }
      }
    } catch {
      /* enrollment failed — proceed to the dashboard anyway */
    } finally {
      const target = enrollPrompt.target;
      setEnrolling(false);
      setEnrollPrompt(null);
      navigateAfterLogin(target);
    }
  };

  const handleSkipBiometric = () => {
    if (!enrollPrompt) return;
    try { localStorage.setItem(BIOMETRIC_DECLINED_KEY, 'true'); } catch { /* non-fatal */ }
    const target = enrollPrompt.target;
    setEnrollPrompt(null);
    navigateAfterLogin(target);
  };

  return (
    <>
    {/* Native-only post-login enrollment prompt. Holds the redirect until the user
        chooses to enable biometric sign-in or skip. */}
    {enrollPrompt && (
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-sm bg-white rounded-3xl shadow-2xl p-6 text-center"
        >
          <div className="mx-auto mb-4 w-14 h-14 rounded-2xl bg-blue-50 flex items-center justify-center">
            <ScanFace className="w-7 h-7 text-blue-600" />
          </div>
          <h2 className="text-lg font-bold text-gray-900 mb-1">Sign in faster next time?</h2>
          <p className="text-sm text-gray-600 mb-5">
            Use {bioLabel} to sign in without typing your password.
          </p>
          <button
            type="button"
            onClick={handleEnableBiometric}
            disabled={enrolling}
            className="w-full py-3 rounded-xl text-white font-bold bg-gradient-to-r from-blue-600 to-blue-700 hover:brightness-110 transition-all disabled:opacity-50 flex items-center justify-center gap-2 mb-2"
          >
            {enrolling ? 'Enabling…' : `Enable ${bioLabel}`}
          </button>
          <button
            type="button"
            onClick={handleSkipBiometric}
            disabled={enrolling}
            className="w-full py-3 rounded-xl text-gray-500 font-semibold hover:text-gray-700 transition-colors disabled:opacity-50"
          >
            Not now
          </button>
        </motion.div>
      </div>
    )}
    <div
      className="min-h-screen flex items-center justify-center relative overflow-hidden"
      style={{
        background: `linear-gradient(to bottom right, ${branding.login_bg_gradient_from || '#0f172a'}, ${branding.login_bg_gradient_to || '#1e1b4b'})`,
      }}
    >
      {/* Animated Background Elements */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-blue-500/20 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-red-500/20 rounded-full blur-3xl animate-pulse delay-1000"></div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="relative z-10 backdrop-blur-xl bg-white/95 rounded-3xl shadow-2xl p-5 sm:p-8 w-full max-w-md border border-gray-200"
      >
        {/* Logo and Header */}
        <div className="flex flex-col items-center mb-4 sm:mb-8">
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.2, duration: 0.5 }}
            className="flex flex-col items-center"
          >
            {/* Tenant logo. While the tenant branding fetch is in flight we show a neutral
                placeholder — never the Pontifex platform logo — to avoid the
                Pontifex→tenant logo flash. Platform logo only appears if the fetch
                settles and the tenant has no logo of its own. */}
            {tenantId && !brandingLoaded ? (
              <div
                className="h-[84px] w-[84px] sm:h-[120px] sm:w-[120px] rounded-2xl bg-gray-100 animate-pulse"
                aria-hidden="true"
              />
            ) : (
              <img
                src={branding.logo_icon_url || branding.logo_url || '/logo.svg'}
                alt={branding.company_name || 'Pontifex Industries'}
                className="h-[84px] w-[84px] sm:h-[120px] sm:w-[120px] object-contain rounded-2xl"
              />
            )}
          </motion.div>
          <motion.h1
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-blue-600 via-blue-700 to-red-700 bg-clip-text text-transparent mt-3 mb-1 sm:mt-6 sm:mb-2 tracking-tight"
          >
            {branding.login_welcome_text || 'Welcome Back'}
          </motion.h1>
          <p className="text-gray-600 text-sm font-medium">{branding.tagline || 'Operations Management System'}</p>
          {tenantId && (
            <Link href="/company-login" className="mt-3 flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 transition-colors">
              <ArrowLeft className="w-3 h-3" /> Change company
            </Link>
          )}
        </div>

        {/* Login Form */}
        <form onSubmit={handleSubmit((data) => onSubmit(data))} className="space-y-3 sm:space-y-5">
          <motion.div
            initial={{ x: -20, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ delay: 0.4 }}
            className="relative group"
          >
            <Mail className="absolute left-4 top-3.5 sm:top-4 text-blue-600 group-focus-within:text-blue-700 transition-colors" size={20} />
            <input
              type="email"
              id="email"
              placeholder="Email"
              {...register('email')}
              className="w-full pl-12 pr-4 py-3 sm:py-4 rounded-xl bg-white border-2 border-gray-200 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 focus:outline-none transition-all duration-200 text-gray-800 placeholder-gray-400"
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              inputMode="email"
              required
            />
          </motion.div>

          <motion.div
            initial={{ x: -20, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="relative group"
          >
            <Lock className="absolute left-4 top-3.5 sm:top-4 text-blue-600 group-focus-within:text-blue-700 transition-colors" size={20} />
            <input
              type={showPassword ? 'text' : 'password'}
              id="password"
              placeholder="Password"
              {...register('password')}
              className="w-full pl-12 pr-12 py-3 sm:py-4 rounded-xl bg-white border-2 border-gray-200 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 focus:outline-none transition-all duration-200 text-gray-800 placeholder-gray-400"
              autoComplete="current-password"
              required
            />
            <button
              type="button"
              className="absolute right-4 top-3.5 sm:top-4 text-gray-400 hover:text-blue-600 focus:outline-none transition-colors"
              onClick={() => setShowPassword((v) => !v)}
              tabIndex={-1}
            >
              {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
            </button>
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6 }}
            className="flex items-center justify-between text-sm"
          >
            <label className="flex items-center gap-2 py-2 -my-2 text-gray-600 cursor-pointer hover:text-gray-800 transition-colors select-none">
              <input type="checkbox" {...register('remember')} className="w-5 h-5 accent-blue-600 rounded" />
              <span>Remember me</span>
            </label>
            <Link href="/forgot-password" className="text-blue-600 hover:text-blue-700 font-medium transition-colors">
              Forgot password?
            </Link>
          </motion.div>

          {error && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm font-medium"
            >
              {error}
            </motion.div>
          )}

          <motion.button
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.7 }}
            type="submit"
            className="w-full py-3 sm:py-4 rounded-xl text-white font-bold shadow-xl hover:shadow-2xl transition-all duration-300 focus:ring-4 focus:ring-blue-500/30 transform hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
            style={{
              background: `linear-gradient(to right, ${branding.primary_color || '#2563eb'}, ${branding.secondary_color || '#dc2626'})`,
            }}
            disabled={loading}
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Signing in...
              </span>
            ) : 'Sign In'}
          </motion.button>

          {/* Native app only: Face ID / Touch ID sign-in (appears once credentials are saved). */}
          {faceIdReady && (
            <motion.button
              type="button"
              onClick={handleFaceIdLogin}
              disabled={loading}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.75 }}
              className="w-full py-3 sm:py-3.5 rounded-xl border-2 border-gray-200 bg-white text-gray-700 font-semibold flex items-center justify-center gap-2 hover:border-blue-400 hover:text-blue-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ScanFace size={20} /> Sign in{bioEmail ? ` as ${bioEmail.split('@')[0]}` : ''} with {bioLabel}
            </motion.button>
          )}

          {/* WEB passkey sign-in (Face ID / Touch ID / security key via WebAuthn).
              Self-hides when unsupported or in the native app (which uses its own
              Face ID above). */}
          <PasskeySignInButton onSignedIn={handlePasskeySignedIn} className="pt-1" />

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.8 }}
            className="text-center"
          >
            <Link href="/request-access" className="text-blue-600 hover:text-blue-700 text-sm font-medium transition-colors">
              Need access? Request Login
            </Link>
          </motion.div>
        </form>

        {/* Demo Access — password-gated dropdown */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.9 }}
          className="mt-3 sm:mt-6"
        >
          <button
            type="button"
            onClick={() => { setDemoOpen(o => !o); setDemoGateError(false); }}
            className="w-full flex items-center justify-between px-4 py-3 rounded-xl border border-gray-200 bg-gray-50 hover:bg-gray-100 text-gray-600 text-sm font-medium transition-colors"
          >
            <span className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-gray-400" />
              Demo Account Access
            </span>
            {demoOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>

          {demoOpen && (
            <div className="mt-2 p-4 bg-gray-50 border border-gray-200 rounded-xl space-y-3">
              {!demoUnlocked ? (
                /* Gate: require access code */
                <div>
                  <p className="text-xs text-gray-500 mb-3 text-center">Enter the demo access code to view credentials</p>
                  <div className="flex gap-2">
                    <input
                      type="password"
                      value={demoGateInput}
                      onChange={e => { setDemoGateInput(e.target.value); setDemoGateError(false); }}
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          if (demoGateInput === DEMO_GATE_PASSWORD) { setDemoUnlocked(true); setDemoGateError(false); }
                          else setDemoGateError(true);
                        }
                      }}
                      placeholder="Access code"
                      className={`flex-1 px-3 py-2 text-sm border rounded-lg outline-none focus:ring-2 ${demoGateError ? 'border-red-400 focus:ring-red-200' : 'border-gray-300 focus:ring-blue-200'}`}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        if (demoGateInput === DEMO_GATE_PASSWORD) { setDemoUnlocked(true); setDemoGateError(false); }
                        else setDemoGateError(true);
                      }}
                      className="px-4 py-2 bg-gray-800 text-white text-sm font-semibold rounded-lg hover:bg-gray-700 transition-colors"
                    >
                      Unlock
                    </button>
                  </div>
                  {demoGateError && <p className="text-xs text-red-500 mt-1">Incorrect access code</p>}
                </div>
              ) : (
                /* Unlocked: show demo accounts */
                <div className="space-y-2">
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Demo Accounts — tap one to auto-fill &amp; sign in</p>
                  {DEMO_ACCOUNTS.map(acc => {
                    const c = DEMO_COLORS[acc.color] ?? DEMO_COLORS.blue;
                    return (
                    <div
                      key={acc.email}
                      className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer transition-all hover:shadow-sm ${c.wrap}`}
                      onClick={() => {
                        setValue('email', acc.email, { shouldValidate: true });
                        setValue('password', acc.password, { shouldValidate: true });
                        setCopiedEmail(acc.email);
                        setTimeout(() => { setCopiedEmail(null); setDemoOpen(false); }, 1000);
                      }}
                    >
                      <div>
                        <p className={`text-xs font-bold uppercase tracking-wider mb-0.5 ${c.text}`}>
                          {acc.label} — {acc.name}
                        </p>
                        <p className="text-xs font-mono text-gray-700">{acc.email}</p>
                      </div>
                      <span className={`text-xs font-semibold px-2 py-1 rounded-lg ${
                        copiedEmail === acc.email ? 'bg-green-500 text-white' : c.badge
                      }`}>
                        {copiedEmail === acc.email ? '✓ Filled!' : 'Use this account'}
                      </span>
                    </div>
                    );
                  })}
                  <button
                    type="button"
                    onClick={() => { setDemoUnlocked(false); setDemoGateInput(''); }}
                    className="w-full text-xs text-gray-400 hover:text-gray-600 pt-1 transition-colors"
                  >
                    Lock credentials
                  </button>
                </div>
              )}
            </div>
          )}
        </motion.div>
      </motion.div>
    </div>
    </>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-900" />}>
      <LoginPageInner />
    </Suspense>
  );
}

function Logo() {
  return (
    <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="p-gradient" x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse">
          <stop stopColor="#1A73E8" />
          <stop offset="1" stopColor="#0891b2" />
        </linearGradient>
      </defs>
      <rect width="48" height="48" rx="12" fill="#ffffff" stroke="#1e293b" strokeWidth="2" />
      <path d="M14 34V14h12a8 8 0 1 1 0 16H22v4" stroke="url(#p-gradient)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
