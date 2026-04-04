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
  company_name: 'Patriot Concrete Cutting',
  company_short_name: 'Patriot',
  tagline: 'Concrete Cutting Management Software',
  logo_url: null,
  logo_dark_url: null,
  favicon_url: null,
  logo_icon_url: null,
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
  login_welcome_text: 'Welcome to Patriot',
  login_subtitle: null,
  show_demo_accounts: true,
  show_billing_module: true,
  show_analytics_module: true,
  show_inventory_module: true,
  show_nfc_module: true,
  show_customer_crm: true,
};

const CACHE_KEY = 'patriot-branding';
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

function getCachedBranding(): TenantBranding | null {
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (!cached) return null;
    const parsed: CachedBranding = JSON.parse(cached);
    if (Date.now() - parsed.timestamp > CACHE_TTL) {
      localStorage.removeItem(CACHE_KEY);
      return null;
    }
    return parsed.data;
  } catch {
    return null;
  }
}

function setCachedBranding(data: TenantBranding) {
  try {
    const cached: CachedBranding = { data, timestamp: Date.now() };
    localStorage.setItem(CACHE_KEY, JSON.stringify(cached));
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
      const res = await fetch('/api/admin/branding', { cache: 'no-store' });
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data) {
          const merged = { ...DEFAULT_BRANDING, ...json.data };
          setBranding(merged);
          setCachedBranding(merged);
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
      localStorage.removeItem(CACHE_KEY);
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

    // CSS custom properties for dynamic theming
    if (branding.primary_color) {
      document.documentElement.style.setProperty('--color-primary', branding.primary_color);
    }
    if (branding.primary_color_dark) {
      document.documentElement.style.setProperty('--color-primary-dark', branding.primary_color_dark);
    }
    if (branding.secondary_color) {
      document.documentElement.style.setProperty('--color-secondary', branding.secondary_color);
    }
    if (branding.accent_color) {
      document.documentElement.style.setProperty('--color-accent', branding.accent_color);
    }
    if (branding.header_bg_color) {
      document.documentElement.style.setProperty('--color-header-bg', branding.header_bg_color);
    }
    if (branding.sidebar_bg_color) {
      document.documentElement.style.setProperty('--color-sidebar-bg', branding.sidebar_bg_color);
    }

    // Document title
    if (branding.company_name) {
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
