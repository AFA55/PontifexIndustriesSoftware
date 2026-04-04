'use client';

import { useState, useRef, useEffect } from 'react';
import { X, Building2, Loader2, User, DollarSign, MapPin, FileText, CreditCard } from 'lucide-react';
import { useGoogleMaps } from '@/components/providers/GoogleMapsProvider';

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
    payment_method?: string | null;
    tax_id?: string | null;
    website?: string | null;
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
  { value: 'property_manager', label: 'Property Manager' },
  { value: 'homeowner', label: 'Homeowner' },
  { value: 'other', label: 'Other' },
];

const PAYMENT_TERMS = [
  { value: '', label: 'Select terms...' },
  { value: 'cod', label: 'COD (Cash on Delivery)' },
  { value: '0', label: 'Due on Receipt' },
  { value: '15', label: 'Net 15' },
  { value: '30', label: 'Net 30' },
  { value: '45', label: 'Net 45' },
  { value: '60', label: 'Net 60' },
  { value: '90', label: 'Net 90' },
];

const PAYMENT_METHODS = [
  { value: '', label: 'Select method...' },
  { value: 'check', label: 'Check' },
  { value: 'credit_card', label: 'Credit Card' },
  { value: 'ach', label: 'ACH / Bank Transfer' },
  { value: 'cash', label: 'Cash' },
  { value: 'wire', label: 'Wire Transfer' },
  { value: 'other', label: 'Other' },
];

export default function CustomerForm({ customer, onSubmit, onClose }: CustomerFormProps) {
  const isEdit = !!customer?.id;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { isLoaded } = useGoogleMaps();

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
    payment_method: customer?.payment_method || '',
    tax_id: customer?.tax_id || '',
    website: customer?.website || '',
    notes: customer?.notes || '',
  });

  // Google Places autocomplete state
  const [addressInputValue, setAddressInputValue] = useState(customer?.address || '');
  const [addressSuggestions, setAddressSuggestions] = useState<google.maps.places.AutocompletePrediction[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const autocompleteServiceRef = useRef<google.maps.places.AutocompleteService | null>(null);
  const placesServiceRef = useRef<google.maps.places.PlacesService | null>(null);
  const placesServiceContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isLoaded && typeof window !== 'undefined' && window.google) {
      autocompleteServiceRef.current = new window.google.maps.places.AutocompleteService();
      if (placesServiceContainerRef.current) {
        placesServiceRef.current = new window.google.maps.places.PlacesService(
          placesServiceContainerRef.current
        );
      }
    }
  }, [isLoaded]);

  const handleAddressInput = (value: string) => {
    setAddressInputValue(value);
    setForm(f => ({ ...f, address: value }));

    if (!value.trim() || !autocompleteServiceRef.current) {
      setAddressSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    autocompleteServiceRef.current.getPlacePredictions(
      {
        input: value,
        componentRestrictions: { country: 'us' },
        types: ['address'],
      },
      (predictions, status) => {
        if (status === window.google.maps.places.PlacesServiceStatus.OK && predictions) {
          setAddressSuggestions(predictions);
          setShowSuggestions(true);
        } else {
          setAddressSuggestions([]);
          setShowSuggestions(false);
        }
      }
    );
  };

  const handleSelectSuggestion = (prediction: google.maps.places.AutocompletePrediction) => {
    if (!placesServiceRef.current) return;

    placesServiceRef.current.getDetails(
      { placeId: prediction.place_id, fields: ['address_components'] },
      (place, status) => {
        if (status !== window.google.maps.places.PlacesServiceStatus.OK || !place) return;

        const components = place.address_components || [];
        const get = (type: string) =>
          components.find(c => c.types.includes(type))?.long_name || '';
        const getShort = (type: string) =>
          components.find(c => c.types.includes(type))?.short_name || '';

        const streetNumber = get('street_number');
        const route = get('route');
        const street = [streetNumber, route].filter(Boolean).join(' ');
        const city = get('locality') || get('sublocality') || get('neighborhood');
        const state = getShort('administrative_area_level_1');
        const zip = get('postal_code');

        setAddressInputValue(street);
        setForm(f => ({ ...f, address: street, city, state, zip }));
        setShowSuggestions(false);
        setAddressSuggestions([]);
      }
    );
  };

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
  const labelClass = 'block text-xs font-bold text-gray-300 mb-1.5 uppercase tracking-wider';
  const sectionClass = 'border border-white/10 rounded-xl p-4 space-y-3';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      {/* Hidden container required by PlacesService */}
      <div ref={placesServiceContainerRef} style={{ display: 'none' }} />

      <div className="bg-slate-800 border border-white/10 rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-white/10 sticky top-0 bg-slate-800 z-10 rounded-t-2xl">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <div className="w-8 h-8 bg-gradient-to-br from-purple-500 to-pink-500 rounded-lg flex items-center justify-center">
              <Building2 className="w-4 h-4 text-white" />
            </div>
            {isEdit ? 'Edit Customer' : 'New Customer'}
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

          {/* Company Info Section */}
          <div className={sectionClass}>
            <div className="flex items-center gap-2 mb-1">
              <Building2 className="w-4 h-4 text-purple-400" />
              <h3 className="text-sm font-bold text-white">Company Information</h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <label className={labelClass}>Company / Customer Name *</label>
                <input
                  type="text"
                  className={inputClass}
                  placeholder="e.g. ABC General Contractors"
                  value={form.company_name}
                  onChange={e => update('company_name', e.target.value)}
                  autoFocus
                />
              </div>
              <div>
                <label className={labelClass}>Customer Type</label>
                <select className={inputClass} value={form.customer_type} onChange={e => update('customer_type', e.target.value)}>
                  {CUSTOMER_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <div>
                <label className={labelClass}>Website</label>
                <input type="url" className={inputClass} placeholder="https://example.com" value={form.website} onChange={e => update('website', e.target.value)} />
              </div>
            </div>
          </div>

          {/* Primary Contact Section */}
          <div className={sectionClass}>
            <div className="flex items-center gap-2 mb-1">
              <User className="w-4 h-4 text-blue-400" />
              <h3 className="text-sm font-bold text-white">Main Contact</h3>
              <span className="text-[10px] text-gray-500 bg-white/5 px-2 py-0.5 rounded-full">Primary point of contact</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className={labelClass}>Contact Name</label>
                <input type="text" className={inputClass} placeholder="John Smith" value={form.primary_contact_name} onChange={e => update('primary_contact_name', e.target.value)} />
              </div>
              <div>
                <label className={labelClass}>Email</label>
                <input type="email" className={inputClass} placeholder="john@example.com" value={form.primary_contact_email} onChange={e => update('primary_contact_email', e.target.value)} />
              </div>
              <div>
                <label className={labelClass}>Phone</label>
                <input type="tel" className={inputClass} placeholder="(555) 123-4567" value={form.primary_contact_phone} onChange={e => update('primary_contact_phone', e.target.value)} />
              </div>
            </div>
          </div>

          {/* Billing Contact Section */}
          <div className={sectionClass + ' border-emerald-500/20 bg-emerald-500/5'}>
            <div className="flex items-center gap-2 mb-1">
              <DollarSign className="w-4 h-4 text-emerald-400" />
              <h3 className="text-sm font-bold text-white">Billing Contact</h3>
              <span className="text-[10px] text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full">For invoices & payments</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className={labelClass}>Billing Contact Name</label>
                <input type="text" className={inputClass} placeholder="Jane Doe" value={form.billing_contact_name} onChange={e => update('billing_contact_name', e.target.value)} />
              </div>
              <div>
                <label className={labelClass}>Billing Email *</label>
                <input type="email" className={inputClass} placeholder="billing@example.com" value={form.billing_contact_email} onChange={e => update('billing_contact_email', e.target.value)} />
              </div>
              <div>
                <label className={labelClass}>Billing Phone</label>
                <input type="tel" className={inputClass} placeholder="(555) 123-4567" value={form.billing_contact_phone} onChange={e => update('billing_contact_phone', e.target.value)} />
              </div>
            </div>
          </div>

          {/* Payment & Billing Section */}
          <div className={sectionClass}>
            <div className="flex items-center gap-2 mb-1">
              <CreditCard className="w-4 h-4 text-cyan-400" />
              <h3 className="text-sm font-bold text-white">Payment & Billing</h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className={labelClass}>Payment Terms</label>
                <select className={inputClass} value={form.payment_terms} onChange={e => update('payment_terms', e.target.value)}>
                  {PAYMENT_TERMS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <div>
                <label className={labelClass}>Payment Method</label>
                <select className={inputClass} value={form.payment_method} onChange={e => update('payment_method', e.target.value)}>
                  {PAYMENT_METHODS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
              </div>
              <div>
                <label className={labelClass}>Tax ID / EIN</label>
                <input type="text" className={inputClass} placeholder="XX-XXXXXXX" value={form.tax_id} onChange={e => update('tax_id', e.target.value)} />
              </div>
            </div>
          </div>

          {/* Address Section */}
          <div className={sectionClass}>
            <div className="flex items-center gap-2 mb-1">
              <MapPin className="w-4 h-4 text-red-400" />
              <h3 className="text-sm font-bold text-white">Address</h3>
              {isLoaded && (
                <span className="text-[10px] text-gray-500 bg-white/5 px-2 py-0.5 rounded-full">Autocomplete enabled</span>
              )}
            </div>
            <div className="relative">
              <label className={labelClass}>Street Address</label>
              <input
                type="text"
                className={inputClass}
                placeholder="123 Main St — start typing for suggestions"
                value={addressInputValue}
                onChange={e => handleAddressInput(e.target.value)}
                onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                onFocus={() => addressSuggestions.length > 0 && setShowSuggestions(true)}
                autoComplete="off"
              />
              {showSuggestions && addressSuggestions.length > 0 && (
                <div className="absolute z-50 left-0 right-0 mt-1 bg-slate-700 border border-slate-600 rounded-xl shadow-2xl overflow-hidden">
                  {addressSuggestions.map(prediction => (
                    <button
                      key={prediction.place_id}
                      type="button"
                      className="w-full px-4 py-2.5 text-left text-sm text-white hover:bg-slate-600 transition-colors flex items-start gap-2 border-b border-slate-600/50 last:border-0"
                      onMouseDown={() => handleSelectSuggestion(prediction)}
                    >
                      <MapPin className="w-3.5 h-3.5 text-gray-400 mt-0.5 shrink-0" />
                      <span>
                        <span className="font-medium">{prediction.structured_formatting.main_text}</span>
                        <span className="text-gray-400 text-xs block">{prediction.structured_formatting.secondary_text}</span>
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className={labelClass}>City</label>
                <input type="text" className={inputClass} placeholder="City" value={form.city} onChange={e => update('city', e.target.value)} />
              </div>
              <div>
                <label className={labelClass}>State</label>
                <input type="text" className={inputClass} placeholder="SC" value={form.state} onChange={e => update('state', e.target.value)} />
              </div>
              <div>
                <label className={labelClass}>ZIP</label>
                <input type="text" className={inputClass} placeholder="29601" value={form.zip} onChange={e => update('zip', e.target.value)} />
              </div>
            </div>
          </div>

          {/* Notes */}
          <div className={sectionClass}>
            <div className="flex items-center gap-2 mb-1">
              <FileText className="w-4 h-4 text-gray-400" />
              <h3 className="text-sm font-bold text-white">Internal Notes</h3>
            </div>
            <textarea
              className={inputClass + ' min-h-[80px] resize-y'}
              placeholder="Any notes about this customer (internal only)..."
              value={form.notes}
              onChange={e => update('notes', e.target.value)}
            />
          </div>

          {/* Submit */}
          <div className="flex justify-end gap-3 pt-2 border-t border-white/10">
            <button type="button" onClick={onClose} className="px-5 py-2.5 text-sm font-bold text-gray-400 hover:text-white transition-colors">
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-8 py-2.5 bg-gradient-to-r from-purple-600 to-pink-500 hover:from-purple-700 hover:to-pink-600 rounded-xl font-bold text-sm text-white transition-all shadow-lg disabled:opacity-50 flex items-center gap-2"
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
