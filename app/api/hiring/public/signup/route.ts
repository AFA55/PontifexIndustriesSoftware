export const dynamic = 'force-dynamic';

/**
 * POST /api/hiring/public/signup — PUBLIC (no session).
 *
 * The "Pontifex Industries Job Board" front-door signup (app/jobs/page.tsx).
 * Creates a hiring-only tenant + invites the signer-upper as its first admin,
 * reusing the PROVEN team-invite machinery end-to-end:
 *   - tenant row via lib/tenant-onboarding createTenantRow (same guards as the
 *     Platform Console) with plan 'starter' and features = all modules OFF
 *     except { hiring: true }
 *   - tenant_branding seed (company name + Pontifex violet #7C3AED)
 *   - a user_invitations row with the SAME token model as /api/admin/invite
 *     (newToken() 256-bit, 7-day TTL, single-use — consumed by the existing
 *     /setup-account flow which creates the auth user + profile with role
 *     'admin' scoped to the new tenant)
 *   - the standard tenant-branded invite email (lib/email generateInviteEmail)
 *
 * Anti-abuse / anti-leak:
 *   - in-memory rate limit: 5 signups/hour per IP
 *   - if the email already belongs to ANY tenant (profiles ilike OR the
 *     auth_user_id_by_email() rpc — NEVER listUsers pagination) we return the
 *     SAME generic success and log the real outcome server-side.
 *   - a repeat signup for an email with a pending invitation RESENDS that
 *     invitation (fresh TTL) instead of minting a second tenant.
 *   - slug / company_code collisions retry with random suffixes.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import {
  createTenantRow,
  seedBranding,
  PROTECTED_COMPANY_CODES,
  PROTECTED_SLUGS,
  COMPANY_CODE_RE,
  SLUG_RE,
} from '@/lib/tenant-onboarding';
import { newToken, INVITE_TTL_MS, buildSetupUrl, resolveOrigin } from '@/lib/invitations';
import { generateInviteEmail, sendEmail, getTenantEmailBranding } from '@/lib/email';
import { FEATURE_MODULES } from '@/lib/features';
import { HIRE_COMPANY_CODE } from '@/lib/hiring/types';

// ── In-memory IP rate limit: 5 signups / hour ────────────────────────────────
const RATE_LIMIT = 5;
const RATE_WINDOW_MS = 60 * 60 * 1000;
const signupHits = new Map<string, number[]>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const hits = (signupHits.get(ip) || []).filter((t) => now - t < RATE_WINDOW_MS);
  if (hits.length >= RATE_LIMIT) {
    signupHits.set(ip, hits);
    return true;
  }
  hits.push(now);
  signupHits.set(ip, hits);
  // Opportunistic prune so the map can't grow unbounded.
  if (signupHits.size > 5000) {
    for (const [k, v] of signupHits) {
      if (v.every((t) => now - t >= RATE_WINDOW_MS)) signupHits.delete(k);
    }
  }
  return false;
}

/** The one generic response for every valid submission — never leaks whether the email exists. */
function genericSuccess() {
  return NextResponse.json({
    success: true,
    data: { message: 'Check your email to finish setting up your account.' },
  });
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

const RAND_LETTER = () => String.fromCharCode(65 + Math.floor(Math.random() * 26));

/** 4–6 char uppercase company code from the name + random letters (matches ^[A-Z0-9_]{3,20}$). */
function makeCompanyCode(name: string): string {
  let base = name.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
  while (base.length < 4) base += RAND_LETTER();
  return (base + RAND_LETTER() + RAND_LETTER()).slice(0, 6);
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Send the branded first-admin setup email. Returns true when the send succeeded. */
async function sendSignupInviteEmail(opts: {
  request: NextRequest;
  to: string;
  contactName: string;
  companyName: string;
  companyCode: string;
  tenantId: string;
  token: string;
}): Promise<boolean> {
  const branding = await getTenantEmailBranding(opts.tenantId);
  const setupUrl = buildSetupUrl(resolveOrigin(opts.request.headers.get('origin')), opts.token);
  const html = await generateInviteEmail({
    inviteeName: opts.contactName,
    inviterName: 'Pontifex Industries Job Board',
    tenantName: opts.companyName,
    roleLabel: 'Administrator',
    companyCode: opts.companyCode,
    setupUrl,
    brandColor: branding.brandColor,
    accentColor: branding.accentColor,
    logoUrl: branding.logoUrl,
  });
  return sendEmail({
    to: opts.to,
    subject: `Finish setting up ${opts.companyName} — Pontifex Industries Job Board`,
    html,
  });
}

export async function POST(request: NextRequest) {
  try {
    const ip =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      request.headers.get('x-real-ip') ||
      'unknown';

    let body: { company_name?: string; contact_name?: string; email?: string; phone?: string };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }

    const companyName = String(body.company_name ?? '').trim();
    const contactName = String(body.contact_name ?? '').trim();
    const email = String(body.email ?? '').trim().toLowerCase();
    const phone = typeof body.phone === 'string' ? body.phone.trim().slice(0, 30) : '';

    if (companyName.length < 2 || companyName.length > 80) {
      return NextResponse.json(
        { error: 'Company name must be between 2 and 80 characters.' },
        { status: 400 }
      );
    }
    if (!contactName || contactName.length > 80) {
      return NextResponse.json({ error: 'Please enter your name.' }, { status: 400 });
    }
    if (!EMAIL_RE.test(email)) {
      return NextResponse.json({ error: 'Please enter a valid work email.' }, { status: 400 });
    }

    if (isRateLimited(ip)) {
      return NextResponse.json(
        { error: 'Too many signups from this address. Please try again later.' },
        { status: 429 }
      );
    }

    // ── Email already on the platform? Generic success — never leak. ─────────
    const { data: existingProfile } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .ilike('email', email)
      .maybeSingle();
    if (existingProfile) {
      console.log('[hiring/signup] email already has a profile — generic success returned');
      return genericSuccess();
    }
    const { data: existingAuthId } = await supabaseAdmin.rpc('auth_user_id_by_email', {
      p_email: email,
    });
    if (existingAuthId) {
      console.log('[hiring/signup] email already has an auth user — generic success returned');
      return genericSuccess();
    }

    // ── Repeat signup with a pending invitation? Refresh + resend, no new tenant.
    const { data: pendingRows } = await supabaseAdmin
      .from('user_invitations')
      .select('id, token, tenant_id, invited_name')
      .eq('email', email)
      .is('accepted_at', null)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1);
    const pending = pendingRows?.[0] ?? null;
    if (pending) {
      await supabaseAdmin
        .from('user_invitations')
        .update({ expires_at: new Date(Date.now() + INVITE_TTL_MS).toISOString() })
        .eq('id', pending.id);
      const { data: pTenant } = await supabaseAdmin
        .from('tenants')
        .select('name, company_code')
        .eq('id', pending.tenant_id)
        .maybeSingle();
      await sendSignupInviteEmail({
        request,
        to: email,
        contactName: pending.invited_name || contactName,
        companyName: pTenant?.name || companyName,
        companyCode: pTenant?.company_code || '',
        tenantId: pending.tenant_id,
        token: pending.token,
      });
      console.log('[hiring/signup] pending invitation resent instead of creating a new tenant');
      return genericSuccess();
    }

    // ── Create the hiring-only tenant (retry slug/code collisions) ───────────
    // All non-core modules OFF; the hiring flag is merged in below.
    const modulesOff: Record<string, boolean> = {};
    for (const m of FEATURE_MODULES) if (!m.core) modulesOff[m.key] = false;

    const slugBase = slugify(companyName) || 'company';
    let tenant: { id: string; company_code: string; slug: string; name: string } | null = null;
    let lastErr: unknown = null;

    for (let attempt = 0; attempt < 5 && !tenant; attempt++) {
      const suffix = attempt === 0 ? '' : `-${Math.random().toString(36).slice(2, 6)}`;
      const slug = `${slugBase}${suffix}`.slice(0, 48);
      let companyCode = makeCompanyCode(companyName);
      if (
        PROTECTED_COMPANY_CODES.includes(companyCode) ||
        companyCode === HIRE_COMPANY_CODE ||
        !COMPANY_CODE_RE.test(companyCode)
      ) {
        companyCode = makeCompanyCode(companyName + RAND_LETTER());
      }
      if (PROTECTED_SLUGS.includes(slug) || !SLUG_RE.test(slug)) {
        lastErr = new Error(`generated slug invalid: ${slug}`);
        continue;
      }
      try {
        tenant = await createTenantRow({
          name: companyName,
          slug,
          companyCode,
          plan: 'starter',
          maxUsers: 10,
          maxJobsPerMonth: 100,
          primaryColor: '#7C3AED',
          billingEmail: email,
          enabledModules: modulesOff,
        });
      } catch (err) {
        lastErr = err;
        const msg = String((err as Error)?.message || err);
        if (!/already exists/i.test(msg)) throw err; // real failure — surface
        // collision → retry with a random suffix
      }
    }

    if (!tenant) {
      console.error('[hiring/signup] tenant creation failed after retries:', lastErr);
      return NextResponse.json(
        { error: 'Could not complete signup. Please try again.' },
        { status: 500 }
      );
    }

    // Merge the hiring flag into features (buildFeaturesMap only knows registry keys).
    await supabaseAdmin
      .from('tenants')
      .update({ features: { ...modulesOff, hiring: true } })
      .eq('id', tenant.id);

    // Branding so the login page + emails are white-labeled from day one.
    await seedBranding(tenant.id, { name: companyName, primaryColor: '#7C3AED' });

    // Billing state row (Hireline-style threshold model defaults) — non-fatal.
    Promise.resolve(supabaseAdmin.from('hiring_billing').insert({ tenant_id: tenant.id }))
      .then(() => {})
      .catch(() => {});

    // ── First-admin invitation: SAME table + token model as the team invite ──
    const token = newToken();
    const { error: invErr } = await supabaseAdmin.from('user_invitations').insert({
      tenant_id: tenant.id,
      email,
      role: 'admin',
      invited_by: null, // self-serve signup — no inviter
      invited_name: contactName,
      phone_number: phone || null,
      token,
      expires_at: new Date(Date.now() + INVITE_TTL_MS).toISOString(),
      initial_flags: {},
    });
    if (invErr) {
      console.error('[hiring/signup] invitation insert failed:', invErr);
      return NextResponse.json(
        { error: 'Could not complete signup. Please try again.' },
        { status: 500 }
      );
    }

    const emailed = await sendSignupInviteEmail({
      request,
      to: email,
      contactName,
      companyName,
      companyCode: tenant.company_code,
      tenantId: tenant.id,
      token,
    });
    if (!emailed) {
      // Tenant + invitation persisted — a retry hits the pending-invite resend path.
      console.error('[hiring/signup] setup email failed to send for tenant', tenant.id);
      return NextResponse.json(
        { error: 'Signup saved but the confirmation email failed to send. Please try again in a minute.' },
        { status: 502 }
      );
    }

    // Fire-and-forget event log (real outcome, server-side only).
    Promise.resolve(
      supabaseAdmin.from('hiring_events').insert({
        tenant_id: tenant.id,
        event_type: 'tenant_signup',
        meta: { email, company_name: companyName, contact_name: contactName, source: 'jobs_page' },
      })
    )
      .then(() => {})
      .catch(() => {});

    return genericSuccess();
  } catch (err) {
    console.error('[hiring/signup] unexpected error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
