'use client';

import { useEffect } from 'react';
import { CheckCircle, XCircle, AlertCircle, X } from 'lucide-react';

export interface NotificationProps {
  type: 'success' | 'error' | 'info';
  message: string;
  onClose: () => void;
  duration?: number;
}

export default function Notification({ type, message, onClose, duration = 3000 }: NotificationProps) {
  useEffect(() => {
    if (duration > 0) {
      const timer = setTimeout(() => {
        onClose();
      }, duration);
      return () => clearTimeout(timer);
    }
  }, [duration, onClose]);

  const icons = {
    success: <CheckCircle className="w-6 h-6" />,
    error: <XCircle className="w-6 h-6" />,
    info: <AlertCircle className="w-6 h-6" />
  };

  const colors = {
    success: 'bg-green-500',
    error: 'bg-red-500',
    info: 'bg-blue-500'
  };

  return (
    <div className="fixed top-4 right-4 z-[100] animate-in slide-in-from-top-2 duration-300">
      <div className={`${colors[type]} text-white rounded-xl shadow-2xl p-4 pr-12 min-w-[300px] max-w-md`}>
        <div className="flex items-start gap-3">
          {icons[type]}
          <p className="flex-1 font-medium leading-relaxed">{message}</p>
        </div>
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-white/80 hover:text-white transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}
