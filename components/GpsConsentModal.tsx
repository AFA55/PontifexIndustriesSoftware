'use client';

import { useState } from 'react';
import { MapPin, Shield, Clock, Database, AlertTriangle, X } from 'lucide-react';
import { GPS_CONSENT_VERSION } from '@/lib/legal/gps-consent';

interface GpsConsentModalProps {
  onAccept: () => void;
  onDecline: () => void;
}

export default function GpsConsentModal({ onAccept, onDecline }: GpsConsentModalProps) {
  const [agreed, setAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleAccept = async () => {
    if (!agreed) return;
    setSubmitting(true);
    try {
      const { supabase } = await import('@/lib/supabase');
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      await fetch('/api/consent', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          consentType: 'gps_tracking',
          documentVersion: GPS_CONSENT_VERSION,
          granted: true,
          context: 'gps_gate',
        }),
      });

      onAccept();
    } catch (err) {
      console.error('Error recording GPS consent:', err);
      onAccept(); // Still allow through on error
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white p-5 rounded-t-2xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-white/20 rounded-xl">
                <MapPin className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-lg font-bold">GPS Location Tracking</h2>
                <p className="text-blue-100 text-sm">Consent Required</p>
              </div>
            </div>
            <button onClick={onDecline} className="p-1 hover:bg-white/20 rounded-lg transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4">
          <p className="text-gray-700 text-sm">
            This app uses GPS to track your location during work hours. Please review the details below before proceeding.
          </p>

          {/* Key Points */}
          <div className="space-y-3">
            <div className="flex items-start gap-3 p-3 bg-blue-50 rounded-xl">
              <Clock className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-semibold text-gray-800">Work Hours Only</p>
                <p className="text-xs text-gray-600">GPS is active only from clock-in to clock-out. We do not track you outside work hours.</p>
              </div>
            </div>

            <div className="flex items-start gap-3 p-3 bg-green-50 rounded-xl">
              <Shield className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-semibold text-gray-800">What We Track</p>
                <p className="text-xs text-gray-600">Clock-in/out location, en-route tracking to job sites, and job site arrival/departure.</p>
              </div>
            </div>

            <div className="flex items-start gap-3 p-3 bg-purple-50 rounded-xl">
              <Database className="w-5 h-5 text-purple-600 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-semibold text-gray-800">Data Security</p>
                <p className="text-xs text-gray-600">Location data is encrypted and retained for 3 years per company policy.</p>
              </div>
            </div>

            <div className="flex items-start gap-3 p-3 bg-amber-50 rounded-xl">
              <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-semibold text-gray-800">Your Rights</p>
                <p className="text-xs text-gray-600">You may withdraw consent at any time. Note: this may disable clock-in/out and en-route features.</p>
              </div>
            </div>
          </div>

          {/* Consent Checkbox */}
          <label className="flex items-start gap-3 p-4 bg-gray-50 rounded-xl border border-gray-200 cursor-pointer hover:bg-gray-100 transition-colors">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              className="mt-0.5 w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-sm text-gray-700">
              I understand and consent to GPS location tracking as described above during my work hours.
            </span>
          </label>

          {/* Actions */}
          <div className="flex gap-3">
            <button
              onClick={onDecline}
              className="flex-1 px-4 py-3 text-gray-600 border border-gray-300 rounded-xl hover:bg-gray-50 transition-colors text-sm font-medium"
            >
              Decline
            </button>
            <button
              onClick={handleAccept}
              disabled={!agreed || submitting}
              className="flex-1 px-4 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-50 text-sm font-bold"
            >
              {submitting ? 'Saving...' : 'Accept & Continue'}
            </button>
          </div>

          <p className="text-xs text-gray-400 text-center">
            Version {GPS_CONSENT_VERSION} &bull;{' '}
            <a href="/privacy" target="_blank" className="underline hover:text-gray-600">Privacy Policy</a>
          </p>
        </div>
      </div>
    </div>
  );
}
