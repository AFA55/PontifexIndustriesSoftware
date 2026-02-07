'use client';

import { useEffect, useState } from 'react';

interface LoadingTransitionProps {
  isLoading: boolean;
  message?: string;
}

export default function LoadingTransition({ isLoading, message = 'Processing...' }: LoadingTransitionProps) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (isLoading) {
      setShow(true);
    } else {
      // Delay hiding to allow fade-out animation
      const timer = setTimeout(() => setShow(false), 300);
      return () => clearTimeout(timer);
    }
  }, [isLoading]);

  if (!show) return null;

  return (
    <div
      className={`fixed inset-0 z-[9999] flex items-center justify-center bg-gradient-to-br from-blue-600/95 via-blue-700/95 to-red-600/95 backdrop-blur-sm transition-opacity duration-300 ${
        isLoading ? 'opacity-100' : 'opacity-0'
      }`}
    >
      <div className="text-center">
        {/* Pontifex Logo with Animation */}
        <div className="mb-8 animate-pulse">
          <h1 className="text-6xl font-bold text-white tracking-tight">
            PONTIFEX
          </h1>
          <p className="text-white/80 text-sm uppercase tracking-widest mt-2">
            Industries
          </p>
        </div>

        {/* Animated Loading Spinner */}
        <div className="flex items-center justify-center mb-6">
          <div className="relative">
            {/* Outer ring */}
            <div className="w-16 h-16 border-4 border-white/30 rounded-full"></div>
            {/* Spinning ring */}
            <div className="absolute top-0 left-0 w-16 h-16 border-4 border-transparent border-t-white rounded-full animate-spin"></div>
          </div>
        </div>

        {/* Loading Message */}
        <p className="text-white text-lg font-medium animate-pulse">
          {message}
        </p>

        {/* Subtle progress indicator dots */}
        <div className="flex items-center justify-center gap-2 mt-4">
          <div className="w-2 h-2 bg-white/60 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
          <div className="w-2 h-2 bg-white/60 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
          <div className="w-2 h-2 bg-white/60 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
        </div>
      </div>
    </div>
  );
}
