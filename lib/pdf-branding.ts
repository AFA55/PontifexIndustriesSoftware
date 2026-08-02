/**
 * Tenant branding for server-rendered PDFs (@react-pdf/renderer routes).
 *
 * WHY: the timecard/dispatch PDF routes used to query `tenant_branding` with
 * only `.eq('is_active', true).limit(1)` — no tenant filter — so every tenant's
 * PDFs rendered an ARBITRARY tenant's brand. All PDF routes must resolve
 * branding through here, scoped by tenant_id (same pattern as
 * `getTenantEmailBranding` in lib/email.ts).
 */
import { supabaseAdmin } from '@/lib/supabase-admin';
import type { PDFBranding } from '@/components/pdf/DispatchTicketPDF';

export type { PDFBranding };

/** Neutral platform defaults — deliberately NOT any tenant's brand. */
const NEUTRAL_PDF_BRANDING: PDFBranding = {
  company_name: '',
  primary_color: '#1E40AF',
};

/**
 * Resolve PDF branding for a tenant: `tenant_branding` (rich store: logo,
 * colors, pdf_* fields) → `tenants` row → neutral defaults. Never throws —
 * a branding lookup must not fail a document download.
 */
export async function getTenantPdfBranding(tenantId: string | null): Promise<PDFBranding> {
  if (!tenantId) return { ...NEUTRAL_PDF_BRANDING };
  try {
    // is_active isn't unique-constrained per tenant — prefer the active,
    // most recently updated row instead of trusting .single().
    const { data: tb } = await supabaseAdmin
      .from('tenant_branding')
      .select(
        'company_name, company_address, company_city, company_state, company_zip, support_phone, primary_color, secondary_color, logo_url, pdf_header_text, pdf_footer_text, pdf_show_logo'
      )
      .eq('tenant_id', tenantId)
      .order('is_active', { ascending: false })
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (tb) {
      const cityLine = [tb.company_city, tb.company_state, tb.company_zip].filter(Boolean).join(', ');
      const address = [tb.company_address, cityLine].filter(Boolean).join(', ');
      return {
        company_name: tb.company_name || '',
        company_address: address || undefined,
        company_phone: tb.support_phone || undefined,
        logo_url: tb.logo_url,
        pdf_header_text: tb.pdf_header_text,
        pdf_footer_text: tb.pdf_footer_text,
        pdf_show_logo: tb.pdf_show_logo ?? true,
        primary_color: tb.primary_color || NEUTRAL_PDF_BRANDING.primary_color,
        secondary_color: tb.secondary_color || undefined,
      };
    }

    const { data: t } = await supabaseAdmin
      .from('tenants')
      .select('name, primary_color, logo_url')
      .eq('id', tenantId)
      .maybeSingle();

    if (t) {
      return {
        company_name: t.name || '',
        primary_color: t.primary_color || NEUTRAL_PDF_BRANDING.primary_color,
        logo_url: t.logo_url,
      };
    }

    return { ...NEUTRAL_PDF_BRANDING };
  } catch {
    return { ...NEUTRAL_PDF_BRANDING };
  }
}

/**
 * Fetch a logo into a data URI for react-pdf's <Image> (PNG/JPEG only — it
 * cannot render SVG, and a slow/404 remote URL can stall renderToBuffer).
 * Returns null on any problem; callers render the text-only header instead.
 * A logo failure must NEVER 500 a PDF download.
 */
/** logo_url is tenant-admin-settable free text → server-side fetch guards. */
const MAX_LOGO_BYTES = 2 * 1024 * 1024; // a huge PNG would bloat every batch page

export async function fetchLogoDataUri(logoUrl: string | null | undefined): Promise<string | null> {
  if (!logoUrl) return null;
  if (/\.svg(\?|#|$)/i.test(logoUrl)) return null;
  let parsed: URL;
  try {
    parsed = new URL(logoUrl);
  } catch {
    return null; // relative paths (e.g. /logo.svg default) have no server origin to fetch
  }
  if (parsed.protocol !== 'https:') return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(logoUrl, { signal: controller.signal });
    if (!res.ok) return null;
    const contentType = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    if (!/^image\/(png|jpeg|jpg)$/.test(contentType)) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length === 0 || buf.length > MAX_LOGO_BYTES) return null;
    return `data:${contentType};base64,${buf.toString('base64')}`;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
