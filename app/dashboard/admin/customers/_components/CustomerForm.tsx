'use client';

import { useState } from 'react';
import { X, Building2, Loader2 } from 'lucide-react';

interface CustomerFormProps {
  customer?: {
    id?: string;
    name?: string;
    primary_contact_name?: string | null;
    primary_contact_email?: string | null;
    primary_contact_phone?: string | null;
    billing_contact_name?: string | null;
    billing_contact_email?: string | null;
    billing_contact_phone?: string | null;
    address?: string | null;
    city?: string | null;
    state?: string | null;
    zip?: string | null;
    customer_type?: string | null;
    payment_terms?: number | string | null;
    notes?: string | null;
  } | null;
  onSubmit: (data: Record<string, any>) => Promise<void>;
  onClose: () => void;
}

const CUSTOMER_TYPES = [
  { value: '', label: 'Select type...' },
  { value: 'general_contractor', label: 'General Contractor' },
  { value: 'subcontractor', label: 'Subcontractor' },
  { value: 'direct_client', label: 'Direct Client' },
  { value: 'government', label: 'Government' },
  { value: 'other', label: 'Other' },
];

const PAYMENT_TERMS = [
  { value: '', label: 'Select terms...' },
  { value: '15', label: 'Net 15' },
  { value: '30', label: 'Net 30' },
  { value: '45', label: 'Net 45' },
  { value: '60', label: 'Net 60' },
  { value: '0', label: 'Due on Receipt' },
];

export default function CustomerForm({ customer, onSubmit, onClose }: CustomerFormProps) {
  const isEdit = !!customer?.id;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [form, setForm] = useState({
    company_name: customer?.name || '',
    primary_contact_name: customer?.primary_contact_name || '',
    primary_contact_email: customer?.primary_contact_email || '',
    primary_contact_phone: customer?.primary_contact_phone || '',
    billing_contact_name: customer?.billing_contact_name || '',
    billing_contact_email: customer?.billing_contact_email || '',
    billing_contact_phone: customer?.billing_contact_phone || '',
    address: customer?.address || '',
    city: customer?.city || '',
    state: customer?.state || '',
    zip: customer?.zip || '',
    customer_type: customer?.customer_type || '',
    payment_terms: customer?.payment_terms?.toString() || '',
    notes: customer?.notes || '',
  });

  const update = (key: string, value: string) => setForm(f => ({ ...f, [key]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.company_name.trim()) {
      setError('Company name is required');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await onSubmit(form);
    } catch (err: any) {
      setError(err.message || 'Failed to save customer');
    } finally {
      setLoading(false);
    }
  };

  const inputClass = 'w-full px-3 py-2.5 text-gray-900 bg-white border border-gray-300 rounded-xl text-sm focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 transition-all placeholder-gray-400';
  const labelClass = 'block text-xs font-bold text-gray-300 mb-1.5';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-slate-800 border border-white/10 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl">
        <div className="flex items-center justify-between p-5 border-b border-white/10">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Building2 className="w-5 h-5 text-purple-400" />
            {isEdit ? 'Edit Customer' : 'Add Customer'}
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-xl transition-colors">
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-5">
          {error && (
            <div className="p-3 bg-red-500/20 border border-red-500/30 rounded-xl text-sm text-red-300">
              {error}
            </div>
          )}

          {/* Company Name */}
          <div>
            <label className={labelClass}>Company Name *</label>
            <input
              type="text"
              className={inputClass}
              placeholder="Enter company name"
              value={form.company_name}
              onChange={e => update('company_name', e.target.value)}
              autoFocus
            />
          </div>

          {/* Primary Contact */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className={labelClass}>Primary Contact</label>
              <input type="text" className={inputClass} placeholder="Name" value={form.primary_contact_name} onChange={e => update('primary_contact_name', e.target.value)} />
            </div>
            <div>
              <label className={labelClass}>Contact Email</label>
              <input type="email" className={inputClass} placeholder="email@example.com" value={form.primary_contact_email} onChange={e => update('primary_contact_email', e.target.value)} />
            </div>
            <div>
              <label className={labelClass}>Contact Phone</label>
              <input type="tel" className={inputClass} placeholder="(555) 123-4567" value={form.primary_contact_phone} onChange={e => update('primary_contact_phone', e.target.value)} />
            </div>
          </div>

          {/* Billing Contact */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className={labelClass}>Billing Contact</label>
              <input type="text" className={inputClass} placeholder="Name" value={form.billing_contact_name} onChange={e => update('billing_contact_name', e.target.value)} />
            </div>
            <div>
              <label className={labelClass}>Billing Email</label>
              <input type="email" className={inputClass} placeholder="billing@example.com" value={form.billing_contact_email} onChange={e => update('billing_contact_email', e.target.value)} />
            </div>
            <div>
              <label className={labelClass}>Billing Phone</label>
              <input type="tel" className={inputClass} placeholder="(555) 123-4567" value={form.billing_contact_phone} onChange={e => update('billing_contact_phone', e.target.value)} />
            </div>
          </div>

          {/* Address */}
          <div>
            <label className={labelClass}>Address</label>
            <input type="text" className={inputClass} placeholder="Street address" value={form.address} onChange={e => update('address', e.target.value)} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className={labelClass}>City</label>
              <input type="text" className={inputClass} placeholder="City" value={form.city} onChange={e => update('city', e.target.value)} />
            </div>
            <div>
              <label className={labelClass}>State</label>
              <input type="text" className={inputClass} placeholder="State" value={form.state} onChange={e => update('state', e.target.value)} />
            </div>
            <div>
              <label className={labelClass}>ZIP</label>
              <input type="text" className={inputClass} placeholder="ZIP" value={form.zip} onChange={e => update('zip', e.target.value)} />
            </div>
          </div>

          {/* Type & Terms */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Customer Type</label>
              <select className={inputClass} value={form.customer_type} onChange={e => update('customer_type', e.target.value)}>
                {CUSTOMER_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label className={labelClass}>Payment Terms</label>
              <select className={inputClass} value={form.payment_terms} onChange={e => update('payment_terms', e.target.value)}>
                {PAYMENT_TERMS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className={labelClass}>Notes</label>
            <textarea
              className={inputClass + ' min-h-[80px] resize-y'}
              placeholder="Internal notes about this customer..."
              value={form.notes}
              onChange={e => update('notes', e.target.value)}
            />
          </div>

          {/* Submit */}
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2.5 text-sm font-bold text-gray-400 hover:text-white transition-colors">
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-6 py-2.5 bg-gradient-to-r from-purple-600 to-pink-500 hover:from-purple-700 hover:to-pink-600 rounded-xl font-bold text-sm text-white transition-all shadow-lg disabled:opacity-50 flex items-center gap-2"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {isEdit ? 'Save Changes' : 'Create Customer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
