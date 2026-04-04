'use client';

import { useState } from 'react';
import { FileSignature } from 'lucide-react';
import { ESIGN_CONSENT_TEXT } from '@/lib/legal/esign-consent';

interface EsignConsentCheckboxProps {
  onConsentChange: (consented: boolean) => void;
  consented?: boolean;
  compact?: boolean;
}

export default function EsignConsentCheckbox({
  onConsentChange,
  consented = false,
  compact = false,
}: EsignConsentCheckboxProps) {
  const [showDetails, setShowDetails] = useState(false);

  return (
    <div className={`${compact ? '' : 'bg-blue-50 border border-blue-200 rounded-xl p-4'}`}>
      <label className="flex items-start gap-3 cursor-pointer group">
        <input
          type="checkbox"
          checked={consented}
          onChange={(e) => onConsentChange(e.target.checked)}
          className="mt-1 w-4 h-4 rounded border-blue-300 text-blue-600 focus:ring-blue-500 cursor-pointer flex-shrink-0"
        />
        <div className="text-sm">
          <span className="text-gray-700 group-hover:text-gray-900 transition-colors">
            I consent to use an <strong>electronic signature</strong> for this transaction, which is legally binding under the{' '}
            <span className="text-blue-600 font-medium">ESIGN Act</span> and{' '}
            <span className="text-blue-600 font-medium">UETA</span>.
          </span>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              setShowDetails(!showDetails);
            }}
            className="ml-1 text-blue-600 hover:text-blue-800 underline text-xs font-medium"
          >
            {showDetails ? 'Hide details' : 'Learn more'}
          </button>
        </div>
      </label>
      {showDetails && (
        <div className="mt-3 ml-7 p-3 bg-white rounded-lg border border-blue-100 text-xs text-gray-600 leading-relaxed">
          <div className="flex items-center gap-2 mb-2">
            <FileSignature className="w-3.5 h-3.5 text-blue-500" />
            <span className="font-semibold text-gray-700">Electronic Signature Disclosure</span>
          </div>
          <ol className="list-decimal ml-4 space-y-1">
            <li>Your electronic signature has the same legal effect as a handwritten signature.</li>
            <li>You may withdraw consent at any time by contacting support.</li>
            <li>You may request a paper copy of any electronically signed document.</li>
            <li>A record of this signature (timestamp, device info, location) will be stored for audit purposes.</li>
          </ol>
        </div>
      )}
    </div>
  );
}
