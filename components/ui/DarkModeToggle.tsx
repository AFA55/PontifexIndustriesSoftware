'use client';

import React from 'react';
import { Moon, Sun } from 'lucide-react';
import { motion } from 'framer-motion';
import { useTheme } from '@/contexts/ThemeContext';

export function DarkModeToggle({ className = '' }: { className?: string }) {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';

  return (
    <button
      onClick={toggleTheme}
      className={`
        relative w-16 h-8 rounded-full transition-colors duration-300 focus:outline-none focus:ring-4 focus:ring-primary-100 dark:focus:ring-primary-900
        ${isDark ? 'bg-slate-700' : 'bg-blue-500'}
        ${className}
      `}
      aria-label={`Switch to ${isDark ? 'light' : 'dark'} mode`}
    >
      {/* Toggle knob */}
      <motion.div
        className="absolute top-1 w-6 h-6 bg-white rounded-full shadow-lg flex items-center justify-center"
        animate={{ x: isDark ? 36 : 4 }}
        transition={{ type: 'spring', stiffness: 500, damping: 30 }}
      >
        {isDark ? (
          <Moon className="w-4 h-4 text-slate-700" />
        ) : (
          <Sun className="w-4 h-4 text-yellow-500" />
        )}
      </motion.div>

      {/* Background icons */}
      <div className="absolute inset-0 flex items-center justify-between px-2">
        <Sun className={`w-4 h-4 transition-opacity ${isDark ? 'opacity-30' : 'opacity-100'} text-white`} />
        <Moon className={`w-4 h-4 transition-opacity ${isDark ? 'opacity-100' : 'opacity-30'} text-white`} />
      </div>
    </button>
  );
}

// Icon-only version for compact spaces
export function DarkModeIconToggle({ className = '' }: { className?: string }) {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';

  return (
    <button
      onClick={toggleTheme}
      className={`
        p-2 rounded-xl transition-all duration-200
        hover:bg-gray-100 dark:hover:bg-gray-800
        focus:outline-none focus:ring-2 focus:ring-primary-500
        ${className}
      `}
      aria-label={`Switch to ${isDark ? 'light' : 'dark'} mode`}
    >
      <motion.div
        initial={{ rotate: 0, scale: 1 }}
        animate={{ rotate: isDark ? 180 : 0, scale: 1 }}
        transition={{ duration: 0.3 }}
      >
        {isDark ? (
          <Moon className="w-5 h-5 text-gray-300" />
        ) : (
          <Sun className="w-5 h-5 text-yellow-600" />
        )}
      </motion.div>
    </button>
  );
}
