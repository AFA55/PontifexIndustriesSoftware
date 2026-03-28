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
}

const DEFAULT_BRANDING: TenantBranding = {
  id: '',
  company_name: 'Pontifex Industries',
  company_short_name: 'Pontifex',
  tagline: 'Concrete Cutting Management Software',
  logo_url: null,
  logo_dark_url: null,
  favicon_url: null,
  logo_icon_url: null,
  primary_color: '#7c3aed',
  primary_color_dark: '#6d28d9',
  secondary_color: '#4f46e5',
  accent_color: '#8b5cf6',
  header_bg_color: '#0f172a',
  sidebar_bg_color: '#1e293b',
  login_bg_gradient_from: '#0f172a',
  login_bg_gradient_to: '#1e1b4b',
  font_family: 'Inter, system-ui, sans-serif',
  heading_font_family: null,
  support_email: null,
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
};

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

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

function getCacheKey(): string {
  try {
    const tenantStr = localStorage.getItem('current-tenant');
    const tenantId = tenantStr ? JSON.parse(tenantStr)?.id : 'default';
    return `branding-${tenantId}`;
  } catch {
    return 'branding-default';
  }
}

function getCachedBranding(): TenantBranding | null {
  try {
    const cacheKey = getCacheKey();
    const cached = localStorage.getItem(cacheKey);
    if (!cached) return null;
    const parsed: CachedBranding = JSON.parse(cached);
    if (Date.now() - parsed.timestamp > CACHE_TTL) {
      localStorage.removeItem(cacheKey);
      return null;
    }
    return parsed.data;
  } catch {
    return null;
  }
}

function setCachedBranding(data: TenantBranding) {
  try {
    const cacheKey = getCacheKey();
    const cached: CachedBranding = { data, timestamp: Date.now() };
    localStorage.setItem(cacheKey, JSON.stringify(cached));
  } catch {
    // localStorage may be unavailable
  }
}

export function BrandingProvider({ children }: { children: React.ReactNode }) {
  const [branding, setBranding] = useState<TenantBranding>(DEFAULT_BRANDING);
  const [loading, setLoading] = useState(true);

  const fetchBranding = useCallback(async (skipCache = false) => {
    // Check cache first
    if (!skipCache) {
      const cached = getCachedBranding();
      if (cached) {
        setBranding(cached);
        setLoading(false);
        return;
      }
    }

    try {
      // Try to get tenant-specific branding
      const tenantStr = typeof window !== 'undefined' ? localStorage.getItem('current-tenant') : null;
      const tenantId = tenantStr ? JSON.parse(tenantStr)?.id : null;

      const url = tenantId
        ? `/api/admin/branding?tenant_id=${tenantId}`
        : '/api/admin/branding';

      const res = await fetch(url, { cache: 'no-store' });
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data) {
          const merged = { ...DEFAULT_BRANDING, ...json.data };
          setBranding(merged);
          setCachedBranding(merged);
        }
      }
    } catch {
      // Use defaults on error -- already set
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshBranding = useCallback(async () => {
    setLoading(true);
    try {
      const cacheKey = getCacheKey();
      localStorage.removeItem(cacheKey);
    } catch {
      // ignore
    }
    await fetchBranding(true);
  }, [fetchBranding]);

  useEffect(() => {
    fetchBranding();
  }, [fetchBranding]);

  // Update document title when branding loads
  useEffect(() => {
    if (!loading && branding.company_name) {
      document.title = `${branding.company_name} - ${branding.tagline}`;
    }
  }, [branding.company_name, branding.tagline, loading]);

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
