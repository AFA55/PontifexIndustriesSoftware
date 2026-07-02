'use client';

import { MessageSquareOff, X } from 'lucide-react';

interface SmsConfigWarningProps {
  onDismiss: () => void;
}

export default function SmsConfigWarning({ onDismiss }: SmsConfigWarningProps) {
  return (
    <div className="container mx-auto px-4 md:px-6 pt-4">
      <div className="flex items-center gap-3 p-3 rounded-xl bg-amber-50 ring-1 ring-amber-200 dark:bg-amber-500/10 dark:ring-amber-400/30">
        <MessageSquareOff className="w-4 h-4 text-amber-600 dark:text-amber-300 flex-shrink-0" />
        <p className="text-sm text-amber-800 dark:text-amber-200 flex-1">
          <span className="font-semibold">SMS not configured</span> — dispatch text notifications won&apos;t reach operators.
          Set <code className="font-mono text-xs bg-amber-100 dark:bg-amber-900/40 px-1 py-0.5 rounded">TELNYX_API_KEY</code> or{' '}
          <code className="font-mono text-xs bg-amber-100 dark:bg-amber-900/40 px-1 py-0.5 rounded">TWILIO_AUTH_TOKEN</code> in Vercel environment variables.
        </p>
        <button
          onClick={onDismiss}
          className="text-amber-500 hover:text-amber-700 dark:text-amber-400 dark:hover:text-amber-200 transition-colors flex-shrink-0"
          title="Dismiss"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
