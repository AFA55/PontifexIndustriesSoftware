-- ============================================================
-- TENANT BRANDING / WHITE-LABEL SYSTEM
-- Stores company branding configuration per deployment
-- ============================================================

CREATE TABLE IF NOT EXISTS tenant_branding (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name TEXT NOT NULL DEFAULT 'Pontifex Industries',
  company_short_name TEXT DEFAULT 'Pontifex',
  tagline TEXT DEFAULT 'Concrete Cutting Management System',
  logo_url TEXT,
  logo_dark_url TEXT,
  favicon_url TEXT,
  logo_icon_url TEXT,
  primary_color TEXT DEFAULT '#7C3AED',
  primary_color_dark TEXT DEFAULT '#6D28D9',
  secondary_color TEXT DEFAULT '#EC4899',
  accent_color TEXT DEFAULT '#8B5CF6',
  header_bg_color TEXT DEFAULT '#1E1B4B',
  sidebar_bg_color TEXT DEFAULT '#0F172A',
  login_bg_gradient_from TEXT DEFAULT '#1E3A5F',
  login_bg_gradient_to TEXT DEFAULT '#0F172A',
  font_family TEXT DEFAULT 'Inter, system-ui, sans-serif',
  heading_font_family TEXT,
  support_email TEXT,
  support_phone TEXT,
  company_website TEXT,
  company_address TEXT,
  company_city TEXT,
  company_state TEXT,
  company_zip TEXT,
  pdf_header_text TEXT,
  pdf_footer_text TEXT,
  pdf_show_logo BOOLEAN DEFAULT true,
  login_welcome_text TEXT DEFAULT 'Welcome back',
  login_subtitle TEXT,
  show_demo_accounts BOOLEAN DEFAULT true,
  show_billing_module BOOLEAN DEFAULT true,
  show_analytics_module BOOLEAN DEFAULT true,
  show_inventory_module BOOLEAN DEFAULT true,
  show_nfc_module BOOLEAN DEFAULT true,
  show_customer_crm BOOLEAN DEFAULT true,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id)
);

ALTER TABLE tenant_branding ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read active branding" ON tenant_branding
  FOR SELECT USING (is_active = true);

CREATE POLICY "Super admins can manage branding" ON tenant_branding
  FOR ALL USING (
    auth.jwt() -> 'user_metadata' ->> 'role' = 'super_admin'
  );

INSERT INTO tenant_branding (
  company_name, company_short_name, tagline, primary_color,
  support_email, login_welcome_text, show_demo_accounts
) VALUES (
  'Pontifex Industries', 'Pontifex', 'Concrete Cutting Management System',
  '#7C3AED', 'support@pontifex.com', 'Welcome back', true
) ON CONFLICT DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_tenant_branding_active ON tenant_branding(is_active) WHERE is_active = true;
