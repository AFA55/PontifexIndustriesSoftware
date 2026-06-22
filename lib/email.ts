/**
 * Email Service
 * Handles sending emails using Resend
 */

import { Resend } from 'resend';
import { resolveAppOrigin } from '@/lib/app-url';
import { supabaseAdmin } from '@/lib/supabase-admin';
import {
  renderInviteEmail,
  renderApprovalEmail,
  renderAccessRequestReceivedEmail,
  renderNotificationEmail,
  renderPasswordResetEmail,
  renderInvoiceEmail,
  renderSignatureRequestEmail,
  renderCompletionThankYouEmail,
  renderCustomerSurveyThankYouEmail,
  renderPortalAccessEmail,
  renderSilicaPlanDeliveryEmail,
  renderOperatorScheduleEmail,
  renderClockInReminderEmail,
  renderSalespersonNotificationEmail,
  renderDemoRequestNotificationEmail,
} from '@/emails/renderers';
import type { InvoiceVariant, InvoiceLineItem } from '@/emails/InvoiceEmail';
import type { CompletionVariant } from '@/emails/CompletionThankYouEmail';
import type { ScheduleJob } from '@/emails/OperatorScheduleEmail';

// ── Platform-default brand (the historical purple look). Used whenever no tenant
// context is available OR a lookup fails — emails must NEVER throw on branding.
const DEFAULT_BRAND_COLOR = '#7c3aed';
const DEFAULT_ACCENT_COLOR = '#4f46e5';
const DEFAULT_COMPANY_NAME = 'Pontifex Industries';

/**
 * White-label branding pulled from the RECIPIENT tenant. Drives the email
 * header gradient, CTA/accent colors, and (when present) a logo above the name.
 */
export interface EmailBranding {
  companyName: string;
  brandColor: string;
  accentColor: string;
  logoUrl: string | null;
}

/** The platform default (purple) branding — frozen so callers can't mutate it. */
const DEFAULT_EMAIL_BRANDING: EmailBranding = {
  companyName: DEFAULT_COMPANY_NAME,
  brandColor: DEFAULT_BRAND_COLOR,
  accentColor: DEFAULT_ACCENT_COLOR,
  logoUrl: null,
};

/**
 * Resolve the email branding for a given tenant.
 *
 * Reads the RICH `tenant_branding` store — the SAME source the app's login page
 * uses (logo + secondary color live there, NOT in the sparse `tenants` table).
 * Falls back to the `tenants` row, then to platform defaults. The accent is the
 * tenant's real `secondary_color` when set (e.g. Patriot's navy → red/white/blue
 * with the red primary), else blue, else the purple platform default. Wrapped in
 * try/catch — never throws (emails must not fail on a branding lookup).
 */
export async function getTenantEmailBranding(
  tenantId: string | null
): Promise<EmailBranding> {
  if (!tenantId) return { ...DEFAULT_EMAIL_BRANDING };
  try {
    const { data: tb } = await supabaseAdmin
      .from('tenant_branding')
      .select('company_name, primary_color, secondary_color, logo_url, logo_icon_url')
      .eq('tenant_id', tenantId)
      .maybeSingle();

    // Fall back to the tenants row only when there's no branding record.
    const { data: t } = tb
      ? { data: null }
      : await supabaseAdmin
          .from('tenants')
          .select('name, primary_color, logo_url')
          .eq('id', tenantId)
          .maybeSingle();

    if (!tb && !t) return { ...DEFAULT_EMAIL_BRANDING };

    const primaryColor: string | null = tb?.primary_color || t?.primary_color || null;
    const secondaryColor: string | null = tb?.secondary_color || null;
    return {
      companyName: tb?.company_name || t?.name || DEFAULT_COMPANY_NAME,
      brandColor: primaryColor || DEFAULT_BRAND_COLOR,
      // Real secondary (e.g. navy) → true red/white/blue; else blue when a
      // primary exists; else keep the purple platform-default accent.
      accentColor: secondaryColor || (primaryColor ? '#1d4ed8' : DEFAULT_ACCENT_COLOR),
      logoUrl: tb?.logo_url || tb?.logo_icon_url || t?.logo_url || null,
    };
  } catch {
    return { ...DEFAULT_EMAIL_BRANDING };
  }
}

/**
 * Shared, white-label email header: a thin brand→accent accent bar over a WHITE
 * band with the tenant LOGO (when present) + company name + a subtitle. White
 * background so the logo reads correctly; the red→navy bar gives the brand pop
 * (true red/white/blue for Patriot). Used by every transactional email so they
 * all match the company the recipient is joining.
 *
 * NOTE: This function is kept for backward compatibility with any callers that
 * still reference it. New emails use the BrandedEmail react-email component.
 */
export function emailHeader(
  b: { companyName: string; brandColor: string; accentColor: string; logoUrl: string | null },
  subtitle: string
): string {
  const companyName = escapeHtml(b.companyName);
  const brand = escapeHtml(b.brandColor);
  const accent = escapeHtml(b.accentColor);
  const logo = b.logoUrl ? escapeHtml(b.logoUrl) : '';
  const logoTag = logo
    ? `<img src="${logo}" alt="${companyName}" height="56" style="max-height:56px;max-width:200px;margin:0 auto 14px;display:block;">`
    : '';
  return `
          <!-- Brand accent bar -->
          <tr>
            <td style="height:6px; line-height:6px; font-size:0; background-color:${brand}; background:linear-gradient(90deg, ${brand} 0%, ${accent} 100%);">&nbsp;</td>
          </tr>
          <!-- White header: logo + company name + subtitle -->
          <tr>
            <td bgcolor="#ffffff" style="background-color:#ffffff; padding:32px 40px 24px; text-align:center;">
              ${logoTag}
              <h1 style="margin:0; color:#0f172a; font-size:24px; font-weight:700; letter-spacing:-0.4px;">${companyName}</h1>
              <p style="margin:8px 0 0; color:#64748b; font-size:13px; font-weight:500;">${subtitle}</p>
            </td>
          </tr>`;
}

// VERIFIED Resend domain — do not use RESEND_FROM_EMAIL (was misconfigured to the unverified root).
// `admin.pontifexindustries.com` is the ONLY verified Resend domain. The root
// `pontifexindustries.com` is NOT verified (Resend returns 403 "domain is not verified").
// These are the single source of truth for outbound sender addresses — import them everywhere.
export const VERIFIED_EMAIL_DOMAIN = 'admin.pontifexindustries.com';
export const DEFAULT_EMAIL_FROM = 'Pontifex Industries <noreply@admin.pontifexindustries.com>';

/**
 * Returns the Resend API key, defensively sanitized.
 *
 * Guards against a real production footgun we hit: the Vercel env var value was
 * pasted as `RESEND_API_KEY=re_xxx` (the variable NAME glued onto the front of
 * the value), so `process.env.RESEND_API_KEY` came back as the whole string and
 * Resend rejected it → every outbound email silently 502'd. We also strip stray
 * surrounding quotes / whitespace. Returns '' when unset.
 *
 * Resend keys always start with `re_`, which makes the malformation recoverable:
 * if the value contains `re_` but doesn't start with it, we extract from there.
 */
export function getResendApiKey(): string {
  let k = (process.env.RESEND_API_KEY || '').trim();
  if (!k) return '';
  // Strip surrounding single/double quotes some dashboards add.
  k = k.replace(/^['"]+|['"]+$/g, '').trim();
  // Strip a self-referential `RESEND_API_KEY=` (or any `…=`) prefix.
  const eq = k.indexOf('=');
  if (eq !== -1 && !k.startsWith('re_')) {
    k = k.slice(eq + 1).trim();
  }
  // Final safety net: if the real key is embedded anywhere, recover it.
  if (!k.startsWith('re_') && k.includes('re_')) {
    k = k.slice(k.indexOf('re_')).trim();
  }
  return k;
}

/** True when a usable (sanitized) Resend key is present. */
export function isEmailConfigured(): boolean {
  return getResendApiKey().startsWith('re_');
}

export interface EmailAttachment {
  filename: string;
  /** base64-encoded string OR Buffer; passed through to Resend's `content` field. */
  content: string | Buffer;
  contentType?: string;
}

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  attachments?: EmailAttachment[];
}

// Initialize Resend with the SANITIZED API key (see getResendApiKey above).
// Use a dummy key if not set to prevent build errors (checked before use).
const resend = new Resend(getResendApiKey() || 're_dummy_key_for_build');

export async function sendEmail({ to, subject, html, attachments }: EmailOptions): Promise<boolean> {
  try {
    console.log(`📧 Sending email to: ${to}`);
    console.log(`📧 Subject: ${subject}`);
    if (attachments?.length) {
      console.log(`📧 Attachments: ${attachments.map((a) => a.filename).join(', ')}`);
    }

    // Check if Resend API key is configured (sanitized)
    if (!isEmailConfigured()) {
      console.warn('⚠️ RESEND_API_KEY not configured. Email will not be sent.');
      console.log('📧 Email HTML (for development):');
      console.log(html);
      return false;
    }

    // Send email using Resend
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const payload: any = {
      // VERIFIED Resend sender — `admin.pontifexindustries.com` is the verified domain;
      // the root `pontifexindustries.com` is NOT verified (Resend 403). Hardcoded
      // because the RESEND_FROM_EMAIL env var was misconfigured (in Vercel) to the unverified root
      // domain, which silently broke every invite + password-reset email.
      from: 'Pontifex Industries <noreply@admin.pontifexindustries.com>',
      to: [to],
      subject: subject,
      html: html,
    };
    if (attachments?.length) {
      payload.attachments = attachments.map((a) => ({
        filename: a.filename,
        content: a.content,
        ...(a.contentType ? { contentType: a.contentType } : {}),
      }));
    }
    const { data, error } = await resend.emails.send(payload);

    if (error) {
      console.error('❌ Error sending email via Resend:', error);
      return false;
    }

    console.log('✅ Email sent successfully via Resend!');
    console.log('📧 Email ID:', data?.id);
    return true;
  } catch (error) {
    console.error('❌ Error sending email:', error);
    return false;
  }
}

/** Escape user-supplied values interpolated into email HTML. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Generate team invite email HTML (used by POST + PUT /api/admin/invite).
 *
 * White-label: the header carries the TENANT'S name (never hardcoded Patriot /
 * Pontifex); Pontifex appears only as "Powered by" in the footer.
 *
 * Now async — returns Promise<string> via react-email render.
 */
export async function generateInviteEmail(opts: {
  inviteeName: string;
  inviterName: string;
  tenantName: string;
  /** Human-readable role label, e.g. "Operator" — already mapped from the role key. */
  roleLabel: string;
  companyCode?: string;
  setupUrl: string;
  /** White-label brand color (header gradient start, CTA, accents). Defaults to platform purple. */
  brandColor?: string;
  /** White-label accent color (header gradient end). Defaults to platform indigo. */
  accentColor?: string;
  /** Optional tenant logo rendered above the company name in the header. */
  logoUrl?: string | null;
}): Promise<string> {
  return renderInviteEmail({
    branding: {
      companyName: opts.tenantName,
      brandColor: opts.brandColor || DEFAULT_BRAND_COLOR,
      accentColor: opts.accentColor || DEFAULT_ACCENT_COLOR,
      logoUrl: opts.logoUrl ?? null,
    },
    inviteeName: opts.inviteeName,
    inviterName: opts.inviterName,
    tenantName: opts.tenantName,
    roleLabel: opts.roleLabel,
    companyCode: opts.companyCode,
    setupUrl: opts.setupUrl,
  });
}

/**
 * Generate approval confirmation email HTML.
 * Now async — returns Promise<string> via react-email render.
 */
export async function generateApprovalEmail(
  fullName: string,
  email: string,
  role: string,
  branding: EmailBranding = DEFAULT_EMAIL_BRANDING
): Promise<string> {
  const loginUrl = `${resolveAppOrigin()}/login`;
  return renderApprovalEmail({
    branding,
    fullName,
    email,
    role,
    loginUrl,
  });
}

/**
 * Generate access request received confirmation email HTML.
 * Now async — returns Promise<string> via react-email render.
 */
export async function generateAccessRequestReceivedEmail(
  fullName: string,
  email: string,
  branding: EmailBranding = DEFAULT_EMAIL_BRANDING
): Promise<string> {
  return renderAccessRequestReceivedEmail({
    branding,
    fullName,
    email,
  });
}

/**
 * Generate a plain event notification email HTML (job assigned, time-off result, etc.).
 * Now async — returns Promise<string> via react-email render.
 */
export async function generateNotificationEmail(opts: {
  title: string;
  message: string;
  actionUrl?: string;
  branding?: EmailBranding;
}): Promise<string> {
  return renderNotificationEmail({
    branding: opts.branding ?? DEFAULT_EMAIL_BRANDING,
    title: opts.title,
    message: opts.message,
    actionUrl: opts.actionUrl,
  });
}

/**
 * Generate password reset email HTML.
 * Now async — returns Promise<string> via react-email render.
 */
export async function generatePasswordResetEmail(
  fullName: string,
  resetLink: string,
  branding: EmailBranding = DEFAULT_EMAIL_BRANDING
): Promise<string> {
  return renderPasswordResetEmail({
    branding,
    fullName,
    resetLink,
  });
}

/**
 * Generate a customer invoice email (send / remind / receipt variants).
 *
 * White-label: pass the recipient tenant's branding (via getTenantEmailBranding).
 * The billing/reply email is the tenant's billing contact when known — never a
 * hardcoded Patriot address.
 */
export async function generateInvoiceEmail(opts: {
  variant: InvoiceVariant;
  branding?: EmailBranding;
  customerName: string;
  invoiceNumber: string;
  invoiceDate?: string | null;
  dueDate?: string | null;
  poNumber?: string | null;
  lineItems?: InvoiceLineItem[];
  subtotal?: number;
  taxAmount?: number;
  discountAmount?: number;
  totalAmount?: number;
  balanceDue?: number;
  status?: string;
  notes?: string | null;
  isOverdue?: boolean;
  daysOverdue?: number;
  amountPaid?: number;
  paymentDate?: string | null;
  paymentMethod?: string | null;
  referenceNumber?: string | null;
  billingEmail?: string | null;
  companyPhone?: string | null;
}): Promise<string> {
  const { branding, ...rest } = opts;
  return renderInvoiceEmail({
    branding: branding ?? DEFAULT_EMAIL_BRANDING,
    ...rest,
  });
}

/**
 * Generate a customer signature-request email (sign your completion form).
 * White-label: pass the recipient tenant's branding.
 */
export async function generateSignatureRequestEmail(opts: {
  branding?: EmailBranding;
  customerName: string;
  jobNumber: string;
  jobLabel: string;
  jobDate?: string | null;
  jobLocation?: string | null;
  signingUrl: string;
}): Promise<string> {
  const { branding, ...rest } = opts;
  return renderSignatureRequestEmail({
    branding: branding ?? DEFAULT_EMAIL_BRANDING,
    ...rest,
  });
}

/**
 * Generate a completion thank-you email (completion sign-off or liability release).
 * The PDF attachment is wired separately by the caller via sendEmail().
 * White-label: pass the recipient tenant's branding.
 */
export async function generateCompletionThankYouEmail(opts: {
  variant: CompletionVariant;
  branding?: EmailBranding;
  jobNumber: string;
  customerName?: string | null;
  location?: string | null;
  scopeOfWork?: string | null;
  operatorName?: string | null;
  companyPhone?: string | null;
  supportEmail?: string | null;
  signedDate?: string | null;
  referencePhotos?: string[];
}): Promise<string> {
  const { branding, ...rest } = opts;
  return renderCompletionThankYouEmail({
    branding: branding ?? DEFAULT_EMAIL_BRANDING,
    ...rest,
  });
}

/**
 * Generate a customer survey thank-you email (echoes back the ratings given).
 * White-label: pass the recipient tenant's branding.
 */
export async function generateCustomerSurveyThankYouEmail(opts: {
  branding?: EmailBranding;
  jobNumber: string;
  customerName?: string | null;
  cleanliness?: number | null;
  communication?: number | null;
  likelyAgain?: number | null;
  notes?: string | null;
}): Promise<string> {
  const { branding, ...rest } = opts;
  return renderCustomerSurveyThankYouEmail({
    branding: branding ?? DEFAULT_EMAIL_BRANDING,
    ...rest,
  });
}

/**
 * Generate a customer portal magic-link email.
 * White-label: pass the recipient tenant's branding.
 */
export async function generatePortalAccessEmail(opts: {
  branding?: EmailBranding;
  customerName: string;
  portalUrl: string;
  expiryDate: string;
}): Promise<string> {
  const { branding, ...rest } = opts;
  return renderPortalAccessEmail({
    branding: branding ?? DEFAULT_EMAIL_BRANDING,
    ...rest,
  });
}

/**
 * Generate a silica exposure control plan delivery email (PDF attached by caller).
 * White-label: pass the recipient tenant's branding.
 */
export async function generateSilicaPlanDeliveryEmail(opts: {
  branding?: EmailBranding;
  jobNumber: string;
}): Promise<string> {
  const { branding, ...rest } = opts;
  return renderSilicaPlanDeliveryEmail({
    branding: branding ?? DEFAULT_EMAIL_BRANDING,
    ...rest,
  });
}

/**
 * Generate an operator's daily schedule email (list of jobs + reminders).
 * White-label: pass the recipient tenant's branding.
 */
export async function generateOperatorScheduleEmail(opts: {
  branding?: EmailBranding;
  operatorName: string;
  scheduleDateLabel: string;
  earliestShopTimeLabel?: string | null;
  jobs: ScheduleJob[];
  scheduleUrl: string;
}): Promise<string> {
  const { branding, ...rest } = opts;
  return renderOperatorScheduleEmail({
    branding: branding ?? DEFAULT_EMAIL_BRANDING,
    ...rest,
  });
}

/**
 * Generate a clock-in reminder email.
 * White-label: pass the recipient tenant's branding.
 */
export async function generateClockInReminderEmail(opts: {
  branding?: EmailBranding;
  name: string;
  actionUrl: string;
}): Promise<string> {
  const { branding, ...rest } = opts;
  return renderClockInReminderEmail({
    branding: branding ?? DEFAULT_EMAIL_BRANDING,
    ...rest,
  });
}

/**
 * Generate an internal salesperson milestone notification email.
 * White-label: pass the recipient tenant's branding.
 */
export async function generateSalespersonNotificationEmail(opts: {
  branding?: EmailBranding;
  title: string;
  message: string;
  actionUrl?: string;
}): Promise<string> {
  const { branding, ...rest } = opts;
  return renderSalespersonNotificationEmail({
    branding: branding ?? DEFAULT_EMAIL_BRANDING,
    ...rest,
  });
}

/**
 * Generate the INTERNAL Pontifex demo-lead alert email.
 * This stays Pontifex-branded (DEFAULT) — it is NOT a tenant email.
 */
export async function generateDemoRequestNotificationEmail(opts: {
  name: string;
  company: string;
  email: string;
  phone?: string | null;
  tradeType?: string | null;
  companySize?: string | null;
  message?: string | null;
  manageUrl?: string | null;
}): Promise<string> {
  return renderDemoRequestNotificationEmail({
    branding: DEFAULT_EMAIL_BRANDING,
    ...opts,
  });
}
