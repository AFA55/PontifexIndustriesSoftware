'use client';

import React, { useState, useEffect, useRef } from 'react';
import { ChevronDown, User, Users } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface OperatorSelectProps {
  value: string;
  onChange: (value: string) => void;
  operators: string[];
  placeholder?: string;
}

export function OperatorSelect({ value, onChange, operators, placeholder = 'Select operator' }: OperatorSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        !buttonRef.current?.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (selectedValue: string) => {
    onChange(selectedValue);
    setIsOpen(false);
  };

  const getDisplayValue = () => {
    if (value === 'all') return 'All Operators';
    if (value === 'unassigned') return 'Unassigned';
    return value;
  };

  const allOptions = [
    { value: 'all', label: 'All Operators', icon: <Users className="w-4 h-4" /> },
    ...operators.map(op => ({ value: op, label: op, icon: <User className="w-4 h-4" /> })),
    { value: 'unassigned', label: 'Unassigned', icon: <User className="w-4 h-4" /> }
  ];

  return (
    <div className="relative">
      {/* Trigger Button */}
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-4 py-3 rounded-xl font-medium bg-white/80 backdrop-blur-sm border-2 border-gray-200 hover:border-gray-300 focus:border-blue-500 focus:ring-4 focus:ring-blue-100 transition-all duration-200 shadow-sm hover:shadow-md text-gray-900 text-left flex items-center justify-between"
      >
        <span className="flex items-center gap-2">
          <User className="w-4 h-4 text-gray-500" />
          {getDisplayValue()}
        </span>
        <ChevronDown className={`w-5 h-5 text-gray-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            ref={dropdownRef}
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="absolute z-50 w-full mt-2 bg-white border-2 border-gray-200 rounded-xl shadow-xl overflow-hidden"
          >
            {/* Options */}
            <div className="max-h-80 overflow-y-auto">
              {allOptions.map((option, index) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => handleSelect(option.value)}
                  className={`w-full px-4 py-3 text-left transition-colors flex items-center gap-3 ${
                    value === option.value
                      ? 'bg-gradient-to-r from-blue-50 to-purple-50 text-blue-700 font-semibold'
                      : 'hover:bg-gray-50 text-gray-700'
                  } ${index !== 0 ? 'border-t border-gray-100' : ''}`}
                >
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
                    value === option.value
                      ? 'bg-gradient-to-r from-blue-500 to-purple-600 text-white'
                      : 'bg-gray-100 text-gray-500'
                  }`}>
                    {option.icon}
                  </div>
                  <span>{option.label}</span>
                  {value === option.value && (
                    <svg className="w-5 h-5 ml-auto text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
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
