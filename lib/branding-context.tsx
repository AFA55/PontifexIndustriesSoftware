'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';

export interface TenantBranding {
  id: string;
  company_name: string;
  company_short_name: string;
  tagline: string;
  logo_url: string | null;
  logo_dark_url: string | null;
  favicon_url: string | null;
  logo_icon_url: string | null;
  primary_color: string;
  primary_color_dark: string;
  secondary_color: string;
  accent_color: string;
  header_bg_color: string;
  sidebar_bg_color: string;
  login_bg_gradient_from: string;
  login_bg_gradient_to: string;
  font_family: string;
  heading_font_family: string | null;
  support_email: string | null;
  support_phone: string | null;
  company_website: string | null;
  company_address: string | null;
  company_city: string | null;
  company_state: string | null;
  company_zip: string | null;
  pdf_header_text: string | null;
  pdf_footer_text: string | null;
  pdf_show_logo: boolean;
  login_welcome_text: string;
  login_subtitle: string | null;
  show_demo_accounts: boolean;
  show_billing_module: boolean;
  show_analytics_module: boolean;
  show_inventory_module: boolean;
  show_nfc_module: boolean;
  show_customer_crm: boolean;
  /**
   * Per-tenant module switchboard map ({ [ModuleKey]: boolean }). Absent/empty
   * ⇒ every module default-ON (see isModuleEnabled in lib/features.ts). Cached
   * with the rest of branding (5 min) — acceptable latency for module gating.
   */
  features: Record<string, unknown>;
}

const DEFAULT_BRANDING: TenantBranding = {
  id: '',
  company_name: 'Pontifex Industries',
  company_short_name: 'Pontifex',
  tagline: 'Concrete Cutting Management Software',
  logo_url: '/logo.svg',         // Pontifex bridge logo — shown before tenant loads
  logo_dark_url: '/logo.svg',
  favicon_url: '/favicon.svg',
  logo_icon_url: '/logo.svg',
  primary_color: '#DC2626',
  primary_color_dark: '#B91C1C',
  secondary_color: '#1E3A5F',
  accent_color: '#EF4444',
  header_bg_color: '#1E3A5F',
  sidebar_bg_color: '#0F1F33',
  login_bg_gradient_from: '#1E3A5F',
  login_bg_gradient_to: '#0F1F33',
  font_family: 'Inter, system-ui, sans-serif',
  heading_font_family: null,
  support_email: 'support@patriotconcretecutting.com',
  support_phone: null,
  company_website: null,
  company_address: null,
  company_city: null,
  company_state: null,
  company_zip: null,
  pdf_header_text: null,
  pdf_footer_text: null,
  pdf_show_logo: true,
  login_welcome_text: 'Welcome Back',
  login_subtitle: null,
  show_demo_accounts: true,
  show_billing_module: true,
  show_analytics_module: true,
  show_inventory_module: true,
  show_nfc_module: true,
  show_customer_crm: true,
  features: {},
};

const CACHE_KEY = 'patriot-branding';
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Convert a hex color (#RRGGBB / #RGB) to a space-separated "R G B" channel string.
// We expose these as `--color-*-rgb` so Tailwind's `brand` tokens can be defined as
// `rgb(var(--color-primary-rgb) / <alpha-value>)` — which makes opacity modifiers
// like `bg-brand/10` work against the tenant's palette. Returns null on bad input.
function hexToRgbChannels(hex: string): string | null {
  if (!hex) return null;
  let h = hex.trim().replace(/^#/, '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  if (h.length !== 6 || /[^0-9a-fA-F]/.test(h)) return null;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `${r} ${g} ${b}`;
}

interface CachedBranding {
  data: TenantBranding;
  timestamp: number;
}

interface BrandingContextType {
  branding: TenantBranding;
  loading: boolean;
  refreshBranding: () => Promise<void>;
}

const BrandingContext = createContext<BrandingContextType>({
  branding: DEFAULT_BRANDING,
  loading: true,
  refreshBranding: async () => {},
});

// Cache is scoped per auth user — a tenant-blind cache leaked the PREVIOUS
// company's branding + feature flags after switching companies in the same
// browser (journey-testing finding, Jul 5).
function scopedCacheKey(userId: string | null): string {
  return `${CACHE_KEY}:${userId ?? 'anon'}`;
}

function getCachedBranding(userId: string | null): TenantBranding | null {
  try {
    const cached = localStorage.getItem(scopedCacheKey(userId));
    if (!cached) return null;
    const parsed: CachedBranding = JSON.parse(cached);
    if (Date.now() - parsed.timestamp > CACHE_TTL) {
      localStorage.removeItem(scopedCacheKey(userId));
      return null;
    }
    return parsed.data;
  } catch {
    return null;
  }
}

function setCachedBranding(userId: string | null, data: TenantBranding) {
  try {
    const cached: CachedBranding = { data, timestamp: Date.now() };
    localStorage.setItem(scopedCacheKey(userId), JSON.stringify(cached));
  } catch {
    // localStorage may be unavailable
  }
}

export function BrandingProvider({ children }: { children: React.ReactNode }) {
  const [branding, setBranding] = useState<TenantBranding>(DEFAULT_BRANDING);
  const [loading, setLoading] = useState(true);

  const fetchBranding = useCallback(async (skipCache = false) => {
    // Resolve the session FIRST: the bearer token lets the API pin branding +
    // feature flags to the CALLER's tenant. Without it the API falls back to
    // "first active branding row" — which is whichever tenant the DB returns
    // first, i.e. wrong for everyone but one tenant (journey-testing finding).
    let accessToken: string | null = null;
    let userId: string | null = null;
    try {
      const { supabase } = await import('@/lib/supabase');
      const { data } = await supabase.auth.getSession();
      accessToken = data.session?.access_token ?? null;
      userId = data.session?.user?.id ?? null;
    } catch {
      // No session (public pages) — the API serves param/default branding.
    }

    // Check cache (scoped per user so company switches never leak branding)
    if (!skipCache) {
      const cached = getCachedBranding(userId);
      if (cached) {
        setBranding(cached);
        setLoading(false);
        return;
      }
    }

    try {
      const res = await fetch('/api/admin/branding', {
        cache: 'no-store',
        headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
      });
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data) {
          const merged = { ...DEFAULT_BRANDING, ...json.data };
          setBranding(merged);
          setCachedBranding(userId, merged);
        }
      }
    } catch {
      // Use defaults on error — already set
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshBranding = useCallback(async () => {
    setLoading(true);
    try {
      // Purge every scoped cache entry (legacy unscoped key included).
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i);
        if (k && k.startsWith(CACHE_KEY)) localStorage.removeItem(k);
      }
    } catch {
      // ignore
    }
    await fetchBranding(true);
  }, [fetchBranding]);

  useEffect(() => {
    fetchBranding();
  }, [fetchBranding]);

  // Apply branding to document: CSS custom properties, favicon, and title
  useEffect(() => {
    if (loading) return;

    // CSS custom properties for dynamic theming. We set BOTH the hex value
    // (--color-*) and an "R G B" channel form (--color-*-rgb) so Tailwind's
    // `brand` tokens (rgb(var(--color-primary-rgb) / <alpha-value>)) support
    // opacity modifiers like bg-brand/10.
    const setColorVar = (name: string, hex: string | null | undefined) => {
      if (!hex) return;
      document.documentElement.style.setProperty(`--color-${name}`, hex);
      const rgb = hexToRgbChannels(hex);
      if (rgb) document.documentElement.style.setProperty(`--color-${name}-rgb`, rgb);
    };
    setColorVar('primary', branding.primary_color);
    setColorVar('primary-dark', branding.primary_color_dark);
    setColorVar('secondary', branding.secondary_color);
    setColorVar('accent', branding.accent_color);
    if (branding.header_bg_color) {
      document.documentElement.style.setProperty('--color-header-bg', branding.header_bg_color);
    }
    if (branding.sidebar_bg_color) {
      document.documentElement.style.setProperty('--color-sidebar-bg', branding.sidebar_bg_color);
    }

    // Document title — ONLY on authenticated dashboard pages. Public/marketing
    // and applicant (/apply) pages set their own per-page <title> for SEO +
    // tab identity; stomping them with the generic "Company - tagline" broke
    // bookmarks and crawler titles (QA loop finding, Jul 6).
    if (branding.company_name && typeof window !== 'undefined' && window.location.pathname.startsWith('/dashboard')) {
      document.title = `${branding.company_name} - ${branding.tagline}`;
    }

    // Favicon
    if (branding.favicon_url) {
      let link = document.querySelector("link[rel~='icon']") as HTMLLinkElement | null;
      if (!link) {
        link = document.createElement('link');
        link.rel = 'icon';
        document.head.appendChild(link);
      }
      link.href = branding.favicon_url;
    }
  }, [
    branding.primary_color,
    branding.primary_color_dark,
    branding.secondary_color,
    branding.accent_color,
    branding.header_bg_color,
    branding.sidebar_bg_color,
    branding.company_name,
    branding.tagline,
    branding.favicon_url,
    loading,
  ]);

  return (
    <BrandingContext.Provider value={{ branding, loading, refreshBranding }}>
      {children}
    </BrandingContext.Provider>
  );
}

export function useBranding() {
  return useContext(BrandingContext);
}

export { DEFAULT_BRANDING };
