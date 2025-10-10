'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Search, Building2, Clock } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface Contractor {
  name: string;
  lastUsed?: Date;
}

interface ContractorAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

const STORAGE_KEY = 'pontifex_recent_contractors';

export function ContractorAutocomplete({ value, onChange, placeholder = 'Enter contractor name' }: ContractorAutocompleteProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<Contractor[]>([]);
  const [recentContractors, setRecentContractors] = useState<Contractor[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Load recent contractors from localStorage
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        setRecentContractors(parsed.map((c: any) => ({
          ...c,
          lastUsed: c.lastUsed ? new Date(c.lastUsed) : undefined
        })));
      } catch (e) {
        console.error('Error loading recent contractors:', e);
      }
    }
  }, []);

  // Save contractor when value changes
  const saveContractor = (name: string) => {
    if (!name || name.trim().length === 0) return;

    const trimmedName = name.trim();
    const updated = [
      { name: trimmedName, lastUsed: new Date() },
      ...recentContractors.filter(c => c.name !== trimmedName)
    ].slice(0, 10); // Keep only 10 recent

    setRecentContractors(updated);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  };

  // Filter suggestions based on input
  useEffect(() => {
    if (value.trim().length > 0) {
      const filtered = recentContractors.filter(c =>
        c.name.toLowerCase().includes(value.toLowerCase())
      );
      setSuggestions(filtered);
    } else {
      setSuggestions(recentContractors.slice(0, 5));
    }
  }, [value, recentContractors]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        !inputRef.current?.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (contractor: Contractor) => {
    onChange(contractor.name);
    saveContractor(contractor.name);
    setIsOpen(false);
  };

  const handleBlur = () => {
    // Save on blur if there's a value
    if (value.trim()) {
      saveContractor(value);
    }
  };

  return (
    <div className="relative">
      {/* Input */}
      <div className="relative">
        <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 dark:text-gray-500" />
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setIsOpen(true)}
          onBlur={handleBlur}
          placeholder={placeholder}
          className="w-full pl-10 pr-10 py-3 rounded-xl bg-white dark:bg-slate-800 border-2 border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 focus:border-primary-500 focus:ring-4 focus:ring-primary-100 dark:focus:ring-primary-900/30 transition-all text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none"
        />
        {value && (
          <button
            type="button"
            onClick={() => {
              onChange('');
              inputRef.current?.focus();
            }}
            className="absolute right-3 top-1/2 -translate-y-1/2 p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* Dropdown */}
      <AnimatePresence>
        {isOpen && suggestions.length > 0 && (
          <motion.div
            ref={dropdownRef}
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="absolute z-50 w-full mt-2 bg-white dark:bg-slate-800 border-2 border-gray-200 dark:border-gray-700 rounded-xl shadow-smooth overflow-hidden"
          >
            {/* Header */}
            {value.trim().length === 0 && (
              <div className="px-4 py-2 bg-gray-50 dark:bg-slate-900 border-b border-gray-200 dark:border-gray-700">
                <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase flex items-center gap-2">
                  <Clock className="w-3 h-3" />
                  Recent Contractors
                </p>
              </div>
            )}

            {/* Suggestions */}
            <div className="max-h-60 overflow-y-auto">
              {suggestions.map((contractor, index) => (
                <button
                  key={index}
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault(); // Prevent input blur
                    handleSelect(contractor);
                  }}
                  className="w-full px-4 py-3 text-left hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-colors flex items-center justify-between group"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-primary-100 dark:bg-primary-900 flex items-center justify-center group-hover:bg-primary-200 dark:group-hover:bg-primary-800 transition-colors">
                      <Building2 className="w-4 h-4 text-primary-600 dark:text-primary-400" />
                    </div>
                    <span className="font-medium text-gray-900 dark:text-gray-100">
                      {contractor.name}
                    </span>
                  </div>
                  {contractor.lastUsed && (
                    <span className="text-xs text-gray-400 dark:text-gray-500">
                      {formatRelativeTime(contractor.lastUsed)}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}
