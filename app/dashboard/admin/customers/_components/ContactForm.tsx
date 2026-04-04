'use client';

import { useState } from 'react';
import { X, User, Loader2, MapPin, DollarSign, Users } from 'lucide-react';

interface ContactFormProps {
  contact?: {
    id?: string;
    name?: string;
    email?: string | null;
    phone?: string | null;
    role?: string | null;
    is_primary?: boolean;
    is_billing_contact?: boolean;
    notes?: string | null;
    contact_type?: string | null;
  } | null;
  onSubmit: (data: Record<string, any>) => Promise<void>;
  onClose: () => void;
}

const ROLES = [
  { value: '', label: 'Select role...' },
  { value: 'site_contact', label: 'Site Contact' },
  { value: 'project_manager', label: 'Project Manager' },
  { value: 'billing', label: 'Billing' },
  { value: 'owner', label: 'Owner' },
  { value: 'other', label: 'Other' },
];

const CONTACT_TYPES = [
  {
    value: 'general',
    label: 'General',
    icon: Users,
    activeClass: 'bg-gray-700 border-gray-700 text-white',
    inactiveClass: 'border-gray-200 text-gray-500 hover:border-gray-400 hover:text-gray-700',
  },
  {
    value: 'on_site',
    label: 'On-Site Contact',
    icon: MapPin,
    activeClass: 'bg-amber-100 border-amber-400 text-amber-700',
    inactiveClass: 'border-gray-200 text-gray-500 hover:border-amber-400 hover:text-amber-600',
  },
  {
    value: 'billing',
    label: 'Billing Contact',
    icon: DollarSign,
    activeClass: 'bg-emerald-100 border-emerald-400 text-emerald-700',
    inactiveClass: 'border-gray-200 text-gray-500 hover:border-emerald-400 hover:text-emerald-600',
  },
];

export default function ContactForm({ contact, onSubmit, onClose }: ContactFormProps) {
  const isEdit = !!contact?.id;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [form, setForm] = useState({
    name: contact?.name || '',
    email: contact?.email || '',
    phone: contact?.phone || '',
    role: contact?.role || '',
    is_primary: contact?.is_primary || false,
    is_billing_contact: contact?.is_billing_contact || false,
    notes: contact?.notes || '',
    contact_type: contact?.contact_type || 'general',
  });

  const update = (key: string, value: string | boolean) => setForm(f => ({ ...f, [key]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      setError('Contact name is required');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await onSubmit(form);
    } catch (err: any) {
      setError(err.message || 'Failed to save contact');
    } finally {
      setLoading(false);
    }
  };

  const inputClass = 'w-full px-3 py-2.5 text-gray-900 bg-white border border-gray-300 rounded-lg text-sm focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 focus:outline-none transition-all placeholder-gray-400';
  const labelClass = 'block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wider';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white border border-gray-200 rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto shadow-xl">
        <div className="flex items-center justify-between p-5 border-b border-gray-200">
          <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <User className="w-5 h-5 text-purple-600" />
            {isEdit ? 'Edit Contact' : 'Add Contact'}
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
              {error}
            </div>
          )}

          {/* Contact Type Selector */}
          <div>
            <label className={labelClass}>Contact Type</label>
            <div className="flex gap-2">
              {CONTACT_TYPES.map(type => {
                const Icon = type.icon;
                const isActive = form.contact_type === type.value;
                return (
                  <button
                    key={type.value}
                    type="button"
                    onClick={() => update('contact_type', type.value)}
                    className={`flex-1 flex flex-col items-center gap-1 px-2 py-2.5 border rounded-xl text-xs font-bold transition-all ${
                      isActive ? type.activeClass : type.inactiveClass
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span className="text-center leading-tight">{type.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className={labelClass}>Name *</label>
            <input type="text" className={inputClass} placeholder="Contact name" value={form.name} onChange={e => update('name', e.target.value)} autoFocus />
          </div>

          <div>
            <label className={labelClass}>Email</label>
            <input type="email" className={inputClass} placeholder="email@example.com" value={form.email} onChange={e => update('email', e.target.value)} />
          </div>

          <div>
            <label className={labelClass}>Phone</label>
            <input type="tel" className={inputClass} placeholder="(555) 123-4567" value={form.phone} onChange={e => update('phone', e.target.value)} />
          </div>

          <div>
            <label className={labelClass}>Role</label>
            <select className={inputClass} value={form.role} onChange={e => update('role', e.target.value)}>
              {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </div>

          <div className="flex items-center gap-6">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.is_primary} onChange={e => update('is_primary', e.target.checked)} className="w-4 h-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500" />
              <span className="text-sm text-gray-700">Primary Contact</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.is_billing_contact} onChange={e => update('is_billing_contact', e.target.checked)} className="w-4 h-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500" />
              <span className="text-sm text-gray-700">Billing Contact</span>
            </label>
          </div>

          <div>
            <label className={labelClass}>Notes</label>
            <textarea className={inputClass + ' min-h-[60px] resize-y'} placeholder="Notes about this contact..." value={form.notes} onChange={e => update('notes', e.target.value)} />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2.5 text-sm font-bold text-gray-600 hover:text-gray-900 transition-colors">
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-6 py-2.5 bg-purple-600 hover:bg-purple-700 rounded-xl font-bold text-sm text-white transition-all shadow-sm disabled:opacity-50 flex items-center gap-2"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {isEdit ? 'Save Changes' : 'Add Contact'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
