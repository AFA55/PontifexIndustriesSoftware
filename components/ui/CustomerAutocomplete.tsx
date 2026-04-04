'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Building2, Search, Plus, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';

interface CustomerResult {
  id: string;
  company_name: string;
  primary_contact_name: string | null;
  primary_contact_phone: string | null;
  address: string | null;
}

interface CustomerAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  onSelect: (customer: CustomerResult) => void;
  onCreateNew?: () => void;
  placeholder?: string;
  autoFocus?: boolean;
}

export function CustomerAutocomplete({
  value,
  onChange,
  onSelect,
  onCreateNew,
  placeholder = 'Enter contractor or customer name',
  autoFocus = false,
}: CustomerAutocompleteProps) {
  const [results, setResults] = useState<CustomerResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  const getToken = async () => {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token || null;
  };

  const searchCustomers = useCallback(async (query: string) => {
    if (!query.trim() || query.trim().length < 2) {
      setResults([]);
      setShowDropdown(false);
      return;
    }

    setLoading(true);
    try {
      const token = await getToken();
      const res = await fetch(`/api/admin/customers/search?q=${encodeURIComponent(query.trim())}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) {
        const json = await res.json();
        setResults(json.data || []);
        setShowDropdown((json.data || []).length > 0 || !!onCreateNew);
      }
    } catch (err) {
      console.error('Customer search failed:', err);
    } finally {
      setLoading(false);
    }
  }, [onCreateNew]);

  const handleChange = (newValue: string) => {
    onChange(newValue);
    setSelectedId(null);

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      searchCustomers(newValue);
    }, 300);
  };

  const handleSelect = (customer: CustomerResult) => {
    onChange(customer.company_name);
    setSelectedId(customer.id);
    setShowDropdown(false);
    onSelect(customer);
  };

  // Close dropdown on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  return (
    <div ref={dropdownRef} className="relative">
      <div className="relative">
        <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
        <input
          type="text"
          className="w-full pl-10 pr-10 py-3 text-gray-900 bg-white border border-slate-200 rounded-xl text-sm font-medium focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all placeholder-slate-400"
          placeholder={placeholder}
          value={value}
          onChange={e => handleChange(e.target.value)}
          onFocus={() => {
            if (value.trim().length >= 2 && (results.length > 0 || onCreateNew)) {
              setShowDropdown(true);
            }
          }}
          autoFocus={autoFocus}
          autoComplete="off"
        />
        {loading && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-purple-400 animate-spin" />
        )}
        {selectedId && !loading && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-green-500 flex items-center justify-center">
            <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
        )}
      </div>

      {showDropdown && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded-xl shadow-xl max-h-64 overflow-y-auto animate-in fade-in slide-in-from-top-1 duration-150">
          {results.map(customer => (
            <button
              key={customer.id}
              type="button"
              onClick={() => handleSelect(customer)}
              className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-blue-50 transition-all border-b border-slate-100 last:border-b-0"
            >
              <div className="w-8 h-8 rounded-lg bg-purple-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                <Building2 className="w-4 h-4 text-purple-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-800 truncate">{customer.company_name}</p>
                <div className="flex items-center gap-3 mt-0.5">
                  {customer.primary_contact_name && (
                    <span className="text-xs text-slate-500">{customer.primary_contact_name}</span>
                  )}
                  {customer.address && (
                    <span className="text-xs text-slate-400 truncate">{customer.address}</span>
                  )}
                </div>
              </div>
            </button>
          ))}
          {onCreateNew && value.trim().length >= 2 && (
            <button
              type="button"
              onClick={() => {
                setShowDropdown(false);
                onCreateNew();
              }}
              className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-emerald-50 transition-all text-emerald-700 border-t border-slate-100"
            >
              <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center flex-shrink-0">
                <Plus className="w-4 h-4 text-emerald-600" />
              </div>
              <div>
                <p className="text-sm font-semibold">Create New Customer</p>
                <p className="text-xs text-emerald-600">Save &quot;{value.trim()}&quot; as a new customer</p>
              </div>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
