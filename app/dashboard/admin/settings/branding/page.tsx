'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ChevronLeft, Save, Loader2, CheckCircle, AlertTriangle,
  Building2, Palette, Image, Type, ToggleLeft, FileText,
  ChevronDown, ChevronUp, Upload, X, Monitor
} from 'lucide-react';
import { getCurrentUser } from '@/lib/auth';
import { useBranding, type TenantBranding } from '@/lib/branding-context';

// ─── Section wrapper with collapsible card ───────────────────────
function Section({
  icon: Icon,
  title,
  subtitle,
  gradient,
  children,
  defaultOpen = true,
}: {
  icon: React.ElementType;
  title: string;
  subtitle: string;
  gradient: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="bg-slate-800 rounded-2xl shadow-xl border border-slate-700 overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className={`w-full ${gradient} px-6 py-4 text-white flex items-center justify-between`}
      >
        <div className="text-left">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <Icon className="w-5 h-5" />
            {title}
          </h2>
          <p className="text-white/70 text-sm mt-0.5">{subtitle}</p>
        </div>
        {open ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
      </button>
      {open && <div className="p-6 space-y-5">{children}</div>}
    </div>
  );
}

// ─── Text input ──────────────────────────────────────────────────
function TextInput({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-bold text-slate-400 mb-1.5">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-2.5 text-gray-900 bg-white border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent"
      />
    </div>
  );
}

// ─── Color picker ────────────────────────────────────────────────
function ColorInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="block text-xs font-bold text-slate-400 mb-1.5">{label}</label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-10 h-10 rounded-lg border border-slate-600 cursor-pointer bg-transparent p-0.5"
        />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="#000000"
          className="flex-1 px-3 py-2.5 text-gray-900 bg-white border border-slate-300 rounded-xl text-sm font-mono focus:ring-2 focus:ring-purple-500 focus:border-transparent"
        />
      </div>
    </div>
  );
}

// ─── Toggle switch ───────────────────────────────────────────────
function Toggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-2">
      <div className="flex-1">
        <span className="text-sm font-semibold text-white">{label}</span>
        {description && <p className="text-xs text-slate-400 mt-0.5">{description}</p>}
      </div>
      <label className="relative inline-flex items-center cursor-pointer">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="sr-only peer"
        />
        <div className="w-11 h-6 bg-slate-600 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-slate-500 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600" />
      </label>
    </div>
  );
}

// ─── Logo upload zone ────────────────────────────────────────────
function LogoUpload({
  label,
  currentUrl,
  logoType,
  onUploaded,
}: {
  label: string;
  currentUrl: string | null;
  logoType: 'main' | 'dark' | 'favicon' | 'icon';
  onUploaded: (url: string) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const handleUpload = async (file: File) => {
    setError('');
    if (file.size > 2 * 1024 * 1024) {
      setError('File too large (max 2MB)');
      return;
    }
    const allowed = ['image/png', 'image/jpeg', 'image/svg+xml', 'image/x-icon'];
    if (!allowed.includes(file.type)) {
      setError('Invalid file type');
      return;
    }

    setUploading(true);
    try {
      const { supabase } = await import('@/lib/supabase');
      const { data: session } = await supabase.auth.getSession();
      const token = session.session?.access_token || '';

      const form = new FormData();
      form.append('logo', file);

      const res = await fetch(`/api/admin/branding/upload-logo?type=${logoType}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });

      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data?.url) {
          onUploaded(json.data.url);
        }
      } else {
        const json = await res.json().catch(() => ({}));
        setError(json.error || 'Upload failed');
      }
    } catch {
      setError('Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleUpload(file);
  };

  return (
    <div>
      <label className="block text-xs font-bold text-slate-400 mb-1.5">{label}</label>
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={`relative border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-all ${
          dragOver
            ? 'border-purple-400 bg-purple-500/10'
            : 'border-slate-600 hover:border-slate-500 hover:bg-slate-700/50'
        }`}
      >
        {uploading ? (
          <div className="flex items-center justify-center gap-2 py-2">
            <Loader2 className="w-5 h-5 animate-spin text-purple-400" />
            <span className="text-sm text-slate-300">Uploading...</span>
          </div>
        ) : currentUrl ? (
          <div className="flex items-center gap-3">
            <img
              src={currentUrl}
              alt={label}
              className="w-16 h-16 object-contain rounded-lg bg-white/10 p-1"
            />
            <div className="flex-1 text-left">
              <p className="text-xs text-slate-300 truncate max-w-[200px]">{currentUrl.split('/').pop()}</p>
              <p className="text-xs text-purple-400 mt-1">Click or drop to replace</p>
            </div>
          </div>
        ) : (
          <div className="py-2">
            <Upload className="w-6 h-6 text-slate-500 mx-auto mb-1" />
            <p className="text-xs text-slate-400">Click or drag & drop</p>
            <p className="text-[10px] text-slate-500 mt-0.5">PNG, JPG, SVG, ICO - Max 2MB</p>
          </div>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/svg+xml,image/x-icon"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleUpload(file);
            e.target.value = '';
          }}
          className="hidden"
        />
      </div>
      {error && <p className="text-xs text-red-400 mt-1">{error}</p>}
    </div>
  );
}

// ─── Main page ───────────────────────────────────────────────────
export default function BrandingSettingsPage() {
  const router = useRouter();
  const { branding: liveBranding, refreshBranding } = useBranding();
  const [form, setForm] = useState<TenantBranding | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [isDirty, setIsDirty] = useState(false);
  const initialRef = useRef<string>('');

  // Auth guard
  useEffect(() => {
    const user = getCurrentUser();
    if (!user) { router.push('/login'); return; }
    if (user.role !== 'super_admin') { router.push('/dashboard'); return; }
  }, [router]);

  // Fetch branding data
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const { supabase } = await import('@/lib/supabase');
      const { data: session } = await supabase.auth.getSession();
      const token = session.session?.access_token || '';

      const res = await fetch('/api/admin/branding', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data) {
          setForm(json.data);
          initialRef.current = JSON.stringify(json.data);
        } else {
          // No row yet — use defaults from context
          setForm(liveBranding);
          initialRef.current = JSON.stringify(liveBranding);
        }
      }
    } catch {
      setForm(liveBranding);
      initialRef.current = JSON.stringify(liveBranding);
    } finally {
      setLoading(false);
    }
  }, [liveBranding]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Track dirty state
  useEffect(() => {
    if (!form) return;
    setIsDirty(JSON.stringify(form) !== initialRef.current);
  }, [form]);

  const update = (field: keyof TenantBranding, value: unknown) => {
    setForm((prev) => prev ? { ...prev, [field]: value } as TenantBranding : prev);
  };

  const handleSave = async () => {
    if (!form) return;
    setSaving(true);
    setError('');
    setSaved(false);
    try {
      const { supabase } = await import('@/lib/supabase');
      const { data: session } = await supabase.auth.getSession();
      const token = session.session?.access_token || '';

      const res = await fetch('/api/admin/branding', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(form),
      });

      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data) {
          setForm(json.data);
          initialRef.current = JSON.stringify(json.data);
          setIsDirty(false);
        }
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
        await refreshBranding();
      } else {
        const json = await res.json().catch(() => ({}));
        setError(json.error || 'Failed to save branding');
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  if (loading || !form) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-purple-500 mx-auto mb-3" />
          <p className="text-slate-400 font-medium">Loading branding settings...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900">
      {/* Header */}
      <div className="backdrop-blur-xl bg-slate-900/90 border-b border-slate-700 sticky top-0 z-30 shadow-lg">
        <div className="container mx-auto px-4 md:px-6 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Link href="/dashboard/admin/settings" className="p-2 bg-slate-800 hover:bg-slate-700 rounded-xl transition-all">
                <ChevronLeft className="w-5 h-5 text-slate-300" />
              </Link>
              <div>
                <h1 className="text-lg md:text-xl font-bold text-white flex items-center gap-2">
                  <Palette className="w-5 h-5 text-purple-400" />
                  Company Branding
                </h1>
                <p className="text-slate-400 text-xs">Customize company name, logos, colors, and feature modules</p>
              </div>
            </div>
            <button
              onClick={handleSave}
              disabled={saving || !isDirty}
              className="px-5 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white rounded-xl font-bold text-sm transition-all shadow-lg hover:shadow-xl disabled:opacity-50 flex items-center gap-2"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 md:px-6 py-6 max-w-4xl pb-32">
        {/* Toasts */}
        {saved && (
          <div className="mb-4 flex items-center gap-2 px-4 py-3 bg-green-900/50 border border-green-700 rounded-xl text-green-300 text-sm font-semibold">
            <CheckCircle className="w-4 h-4" />
            Branding saved successfully!
          </div>
        )}
        {error && (
          <div className="mb-4 flex items-center gap-2 px-4 py-3 bg-red-900/50 border border-red-700 rounded-xl text-red-300 text-sm font-semibold">
            <AlertTriangle className="w-4 h-4" />
            {error}
            <button onClick={() => setError('')} className="ml-auto"><X className="w-4 h-4" /></button>
          </div>
        )}

        <div className="space-y-6">
          {/* ═══ Section 1: Company Identity ═══ */}
          <Section
            icon={Building2}
            title="Company Identity"
            subtitle="Name, tagline, and contact information"
            gradient="bg-gradient-to-r from-purple-600 to-indigo-600"
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <TextInput label="Company Name" value={form.company_name} onChange={(v) => update('company_name', v)} placeholder="Acme Corp" />
              <TextInput label="Short Name" value={form.company_short_name} onChange={(v) => update('company_short_name', v)} placeholder="Acme" />
            </div>
            <TextInput label="Tagline" value={form.tagline} onChange={(v) => update('tagline', v)} placeholder="We build great things" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <TextInput label="Support Email" value={form.support_email || ''} onChange={(v) => update('support_email', v || null)} placeholder="support@example.com" type="email" />
              <TextInput label="Support Phone" value={form.support_phone || ''} onChange={(v) => update('support_phone', v || null)} placeholder="(555) 123-4567" type="tel" />
            </div>
            <TextInput label="Company Website" value={form.company_website || ''} onChange={(v) => update('company_website', v || null)} placeholder="https://example.com" type="url" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <TextInput label="Street Address" value={form.company_address || ''} onChange={(v) => update('company_address', v || null)} placeholder="123 Main St" />
              <TextInput label="City" value={form.company_city || ''} onChange={(v) => update('company_city', v || null)} placeholder="Springfield" />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <TextInput label="State" value={form.company_state || ''} onChange={(v) => update('company_state', v || null)} placeholder="IL" />
              <TextInput label="ZIP Code" value={form.company_zip || ''} onChange={(v) => update('company_zip', v || null)} placeholder="62704" />
            </div>
          </Section>

          {/* ═══ Section 2: Logo Management ═══ */}
          <Section
            icon={Image}
            title="Logo Management"
            subtitle="Upload logos for light/dark themes, favicon, and icon"
            gradient="bg-gradient-to-r from-cyan-600 to-blue-700"
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <LogoUpload label="Logo (Light Background)" currentUrl={form.logo_url} logoType="main" onUploaded={(url) => update('logo_url', url)} />
              <LogoUpload label="Logo (Dark Background)" currentUrl={form.logo_dark_url} logoType="dark" onUploaded={(url) => update('logo_dark_url', url)} />
              <LogoUpload label="Favicon" currentUrl={form.favicon_url} logoType="favicon" onUploaded={(url) => update('favicon_url', url)} />
              <LogoUpload label="Icon (Square)" currentUrl={form.logo_icon_url} logoType="icon" onUploaded={(url) => update('logo_icon_url', url)} />
            </div>
          </Section>

          {/* ═══ Section 3: Theme Colors ═══ */}
          <Section
            icon={Palette}
            title="Theme Colors"
            subtitle="Customize your brand colors throughout the application"
            gradient="bg-gradient-to-r from-pink-600 to-rose-600"
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <ColorInput label="Primary Color" value={form.primary_color} onChange={(v) => update('primary_color', v)} />
              <ColorInput label="Primary Dark" value={form.primary_color_dark} onChange={(v) => update('primary_color_dark', v)} />
              <ColorInput label="Secondary Color" value={form.secondary_color} onChange={(v) => update('secondary_color', v)} />
              <ColorInput label="Accent Color" value={form.accent_color} onChange={(v) => update('accent_color', v)} />
              <ColorInput label="Header Background" value={form.header_bg_color} onChange={(v) => update('header_bg_color', v)} />
              <ColorInput label="Sidebar Background" value={form.sidebar_bg_color} onChange={(v) => update('sidebar_bg_color', v)} />
              <ColorInput label="Login Gradient From" value={form.login_bg_gradient_from} onChange={(v) => update('login_bg_gradient_from', v)} />
              <ColorInput label="Login Gradient To" value={form.login_bg_gradient_to} onChange={(v) => update('login_bg_gradient_to', v)} />
            </div>
            {/* Live preview */}
            <div>
              <label className="block text-xs font-bold text-slate-400 mb-2">Color Preview</label>
              <div className="flex rounded-xl overflow-hidden h-10 border border-slate-600">
                <div className="flex-1" style={{ backgroundColor: form.primary_color }} title="Primary" />
                <div className="flex-1" style={{ backgroundColor: form.primary_color_dark }} title="Primary Dark" />
                <div className="flex-1" style={{ backgroundColor: form.secondary_color }} title="Secondary" />
                <div className="flex-1" style={{ backgroundColor: form.accent_color }} title="Accent" />
                <div className="flex-1" style={{ backgroundColor: form.header_bg_color }} title="Header BG" />
                <div className="flex-1" style={{ backgroundColor: form.sidebar_bg_color }} title="Sidebar BG" />
                <div className="flex-1" style={{ background: `linear-gradient(to right, ${form.login_bg_gradient_from}, ${form.login_bg_gradient_to})` }} title="Login Gradient" />
              </div>
              <div className="flex text-[9px] text-slate-500 mt-1">
                <span className="flex-1 text-center">Primary</span>
                <span className="flex-1 text-center">Dark</span>
                <span className="flex-1 text-center">Secondary</span>
                <span className="flex-1 text-center">Accent</span>
                <span className="flex-1 text-center">Header</span>
                <span className="flex-1 text-center">Sidebar</span>
                <span className="flex-1 text-center">Login</span>
              </div>
            </div>
          </Section>

          {/* ═══ Section 4: Login Page ═══ */}
          <Section
            icon={Monitor}
            title="Login Page"
            subtitle="Customize the login experience"
            gradient="bg-gradient-to-r from-emerald-600 to-teal-700"
            defaultOpen={false}
          >
            <TextInput label="Welcome Text" value={form.login_welcome_text} onChange={(v) => update('login_welcome_text', v)} placeholder="Welcome Back" />
            <TextInput label="Subtitle" value={form.login_subtitle || ''} onChange={(v) => update('login_subtitle', v || null)} placeholder="Sign in to continue" />
            <Toggle label="Show Demo Accounts" description="Display demo account buttons on the login page" checked={form.show_demo_accounts} onChange={(v) => update('show_demo_accounts', v)} />
          </Section>

          {/* ═══ Section 5: Feature Modules ═══ */}
          <Section
            icon={ToggleLeft}
            title="Feature Modules"
            subtitle="Enable or disable platform features"
            gradient="bg-gradient-to-r from-amber-600 to-orange-600"
            defaultOpen={false}
          >
            <Toggle label="Billing Module" description="Invoice generation, payment tracking, and QuickBooks export" checked={form.show_billing_module} onChange={(v) => update('show_billing_module', v)} />
            <div className="border-t border-slate-700" />
            <Toggle label="Analytics Module" description="Revenue dashboards, profitability reports, and trend analysis" checked={form.show_analytics_module} onChange={(v) => update('show_analytics_module', v)} />
            <div className="border-t border-slate-700" />
            <Toggle label="Inventory Module" description="Equipment tracking, blade inventory, and consumables management" checked={form.show_inventory_module} onChange={(v) => update('show_inventory_module', v)} />
            <div className="border-t border-slate-700" />
            <Toggle label="NFC Module" description="NFC tag clock-in/out and remote attendance verification" checked={form.show_nfc_module} onChange={(v) => update('show_nfc_module', v)} />
            <div className="border-t border-slate-700" />
            <Toggle label="Customer CRM" description="Customer profiles, contacts, and relationship management" checked={form.show_customer_crm} onChange={(v) => update('show_customer_crm', v)} />
          </Section>

          {/* ═══ Section 6: PDF Branding ═══ */}
          <Section
            icon={FileText}
            title="PDF Branding"
            subtitle="Customize dispatch tickets, invoices, and PDF exports"
            gradient="bg-gradient-to-r from-slate-600 to-slate-800"
            defaultOpen={false}
          >
            <TextInput label="Header Text" value={form.pdf_header_text || ''} onChange={(v) => update('pdf_header_text', v || null)} placeholder="Company Name - Dispatch Ticket" />
            <TextInput label="Footer Text" value={form.pdf_footer_text || ''} onChange={(v) => update('pdf_footer_text', v || null)} placeholder="Thank you for your business!" />
            <Toggle label="Show Logo on PDFs" description="Include your company logo in the header of generated PDFs" checked={form.pdf_show_logo} onChange={(v) => update('pdf_show_logo', v)} />
          </Section>

          {/* ═══ Section 7: Typography ═══ */}
          <Section
            icon={Type}
            title="Typography"
            subtitle="Font family settings"
            gradient="bg-gradient-to-r from-violet-600 to-purple-700"
            defaultOpen={false}
          >
            <TextInput label="Body Font Family" value={form.font_family} onChange={(v) => update('font_family', v)} placeholder="Inter, system-ui, sans-serif" />
            <TextInput label="Heading Font Family (optional)" value={form.heading_font_family || ''} onChange={(v) => update('heading_font_family', v || null)} placeholder="Same as body font if left blank" />
          </Section>
        </div>
      </div>

      {/* Floating save bar when dirty */}
      {isDirty && (
        <div className="fixed bottom-0 left-0 right-0 z-50 bg-slate-800/95 backdrop-blur-lg border-t border-slate-700 shadow-2xl">
          <div className="container mx-auto px-4 md:px-6 py-3 flex items-center justify-between max-w-4xl">
            <p className="text-sm text-slate-300">
              You have unsaved changes
            </p>
            <div className="flex items-center gap-3">
              <button
                onClick={() => { setForm(JSON.parse(initialRef.current)); setIsDirty(false); }}
                className="px-4 py-2 text-sm text-slate-300 hover:text-white transition-colors"
              >
                Discard
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-5 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white rounded-xl font-bold text-sm transition-all shadow-lg disabled:opacity-50 flex items-center gap-2"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
